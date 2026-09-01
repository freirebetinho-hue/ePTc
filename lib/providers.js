const DEFAULT_TIMEOUT = 25000;

export function apiConfig() {
  return {
    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
    googleGeocoding: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    nominatimFallback: process.env.ALLOW_NOMINATIM_FALLBACK !== 'false',
  };
}

export async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeHost(value = '') {
  try {
    const u = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(value).toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

export function urlMatchesDomains(url = '', domains = []) {
  const host = normalizeHost(url);
  return domains.some(domain => {
    const d = normalizeHost(domain);
    return host === d || host.endsWith(`.${d}`);
  });
}

function cleanResults(results = [], domains = []) {
  const seen = new Set();
  return results.filter(item => {
    if (!item?.url || seen.has(item.url)) return false;
    if (domains.length && !urlMatchesDomains(item.url, domains)) return false;
    seen.add(item.url);
    return true;
  });
}

export async function braveSearch({ query, domains = [], count = 10 }) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { configured: false, provider: 'Brave Search', results: [], error: 'BRAVE_SEARCH_API_KEY não configurada.' };
  const domainQuery = domains.length ? ` (${domains.map(d => `site:${normalizeHost(d)}`).join(' OR ')})` : '';
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', `${query}${domainQuery}`.slice(0, 390));
  endpoint.searchParams.set('count', String(Math.min(20, Math.max(1, count))));
  endpoint.searchParams.set('country', 'BR');
  endpoint.searchParams.set('search_lang', 'pt-br');
  endpoint.searchParams.set('ui_lang', 'pt-BR');
  try {
    const res = await fetchWithTimeout(endpoint, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
      },
    });
    if (!res.ok) return { configured: true, provider: 'Brave Search', results: [], error: `Brave Search retornou HTTP ${res.status}.` };
    const data = await res.json();
    const results = (data?.web?.results || []).map(r => ({
      title: r.title || '', url: r.url || '', description: r.description || '', age: r.age || '', provider: 'Brave Search',
    }));
    return { configured: true, provider: 'Brave Search', results: cleanResults(results, domains), error: '' };
  } catch (error) {
    return { configured: true, provider: 'Brave Search', results: [], error: error?.name === 'AbortError' ? 'Brave Search excedeu o tempo limite.' : String(error) };
  }
}

export async function firecrawlSearch({ query, domains = [], count = 10, location = '' }) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { configured: false, provider: 'Firecrawl Search', results: [], error: 'FIRECRAWL_API_KEY não configurada.' };
  try {
    const res = await fetchWithTimeout('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: String(query).slice(0, 480),
        limit: Math.min(20, Math.max(1, count)),
        sources: ['web'],
        includeDomains: domains.map(normalizeHost).filter(Boolean),
        country: 'BR',
        location: location || undefined,
        timeout: 20000,
        ignoreInvalidURLs: true,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    }, 30000);
    if (!res.ok) return { configured: true, provider: 'Firecrawl Search', results: [], error: `Firecrawl Search retornou HTTP ${res.status}.` };
    const data = await res.json();
    const results = (data?.data?.web || []).map(r => ({
      title: r.title || r.metadata?.title || '',
      url: r.url || r.metadata?.sourceURL || '',
      description: r.description || r.metadata?.description || '',
      markdown: r.markdown || '',
      provider: 'Firecrawl Search',
    }));
    return { configured: true, provider: 'Firecrawl Search', results: cleanResults(results, domains), error: data?.warning || '' };
  } catch (error) {
    return { configured: true, provider: 'Firecrawl Search', results: [], error: error?.name === 'AbortError' ? 'Firecrawl Search excedeu o tempo limite.' : String(error) };
  }
}

export async function searchWeb(args) {
  const brave = await braveSearch(args);
  if (brave.results.length || (brave.configured && !brave.error)) return brave;
  const firecrawl = await firecrawlSearch(args);
  if (firecrawl.results.length || firecrawl.configured) return firecrawl;
  return {
    configured: false,
    provider: 'nenhum',
    results: [],
    error: 'Nenhum provedor de busca configurado. Configure BRAVE_SEARCH_API_KEY ou FIRECRAWL_API_KEY.',
  };
}

export async function firecrawlScrape(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { configured: false, ok: false, error: 'FIRECRAWL_API_KEY não configurada.' };
  try {
    const res = await fetchWithTimeout('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'html'], onlyMainContent: true, timeout: 20000, blockAds: true }),
    }, 30000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { configured: true, ok: false, error: data?.error || `Firecrawl Scrape retornou HTTP ${res.status}.` };
    return { configured: true, ok: true, data: data.data || {}, provider: 'Firecrawl' };
  } catch (error) {
    return { configured: true, ok: false, error: error?.name === 'AbortError' ? 'Firecrawl Scrape excedeu o tempo limite.' : String(error) };
  }
}

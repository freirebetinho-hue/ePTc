import * as cheerio from 'cheerio';
import dns from 'node:dns/promises';

const DEFAULT_TIMEOUT = 22000;
const USER_AGENT = 'Mozilla/5.0 (compatible; BPCBuscaAreas/0.4; +https://github.com/freirebetinho-hue/ePTc)';

export function runtimeConfig() {
  return {
    mode: 'NO_API',
    requiresApiKey: false,
    publicHtmlSearch: true,
    publicHtmlExtraction: true,
    externalGeocoder: false,
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

function cleanResults(results = [], domains = [], count = 10) {
  const seen = new Set();
  return results.filter(item => {
    if (!item?.url || seen.has(item.url)) return false;
    if (domains.length && !urlMatchesDomains(item.url, domains)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, Math.max(1, count));
}

function unwrapDuckDuckGo(href = '') {
  try {
    if (href.startsWith('//')) href = `https:${href}`;
    if (href.startsWith('/')) href = `https://duckduckgo.com${href}`;
    const u = new URL(href);
    const target = u.searchParams.get('uddg');
    return target || href;
  } catch {
    return href;
  }
}

async function duckDuckGoSearch({ query, domains = [], count = 10 }) {
  const site = domains.length ? ` (${domains.map(d => `site:${normalizeHost(d)}`).join(' OR ')})` : '';
  const endpoint = new URL('https://html.duckduckgo.com/html/');
  endpoint.searchParams.set('q', `${query}${site}`.slice(0, 450));
  try {
    const res = await fetchWithTimeout(endpoint, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { provider: 'DuckDuckGo HTML', results: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    if (/captcha|anomaly|automated requests/i.test(html)) return { provider: 'DuckDuckGo HTML', results: [], error: 'Busca pública temporariamente bloqueada.' };
    const $ = cheerio.load(html);
    const results = [];
    $('.result').each((_, el) => {
      const a = $(el).find('.result__a').first();
      const href = unwrapDuckDuckGo(a.attr('href') || '');
      if (!/^https?:\/\//i.test(href)) return;
      results.push({
        title: a.text().trim(),
        url: href,
        description: $(el).find('.result__snippet').first().text().trim(),
        provider: 'DuckDuckGo HTML',
      });
    });
    return { provider: 'DuckDuckGo HTML', results: cleanResults(results, domains, count), error: '' };
  } catch (error) {
    return { provider: 'DuckDuckGo HTML', results: [], error: error?.name === 'AbortError' ? 'Timeout na busca pública.' : String(error) };
  }
}

async function bingHtmlSearch({ query, domains = [], count = 10 }) {
  const site = domains.length ? ` (${domains.map(d => `site:${normalizeHost(d)}`).join(' OR ')})` : '';
  const endpoint = new URL('https://www.bing.com/search');
  endpoint.searchParams.set('q', `${query}${site}`.slice(0, 450));
  endpoint.searchParams.set('setlang', 'pt-br');
  endpoint.searchParams.set('cc', 'br');
  try {
    const res = await fetchWithTimeout(endpoint, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { provider: 'Bing HTML', results: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $('li.b_algo').each((_, el) => {
      const a = $(el).find('h2 a').first();
      const href = a.attr('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      results.push({
        title: a.text().trim(),
        url: href,
        description: $(el).find('.b_caption p').first().text().trim(),
        provider: 'Bing HTML',
      });
    });
    return { provider: 'Bing HTML', results: cleanResults(results, domains, count), error: '' };
  } catch (error) {
    return { provider: 'Bing HTML', results: [], error: error?.name === 'AbortError' ? 'Timeout na busca pública.' : String(error) };
  }
}

export async function searchWeb(args) {
  const ddg = await duckDuckGoSearch(args);
  if (ddg.results.length) return ddg;
  const bing = await bingHtmlSearch(args);
  if (bing.results.length) return bing;
  return {
    provider: 'Busca HTML pública',
    results: [],
    error: [ddg.error, bing.error].filter(Boolean).join(' | ') || 'Nenhum resultado público localizado.',
  };
}

function isPrivateIpv4(host = '') {
  const p = host.split('.').map(Number);
  if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] === 0;
}

function isPrivateIpv6(host = '') {
  const h = host.toLowerCase();
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:');
}

export async function assertPublicUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Somente URLs HTTP/HTTPS são permitidas.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || isPrivateIpv4(host) || isPrivateIpv6(host)) throw new Error('Endereço local/privado não permitido.');
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.some(r => isPrivateIpv4(r.address) || isPrivateIpv6(r.address))) throw new Error('Destino resolve para rede privada.');
  } catch (error) {
    if (/privada/.test(String(error?.message))) throw error;
  }
  return u;
}

function robotsDisallows(robots = '', pathname = '/') {
  const lines = String(robots).split(/\r?\n/).map(x => x.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false;
  const disallow = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    else if (applies && key === 'disallow' && value) disallow.push(value);
  }
  return disallow.some(path => path !== '/' ? pathname.startsWith(path) : pathname === '/');
}

export async function publicScrape(rawUrl) {
  try {
    const url = await assertPublicUrl(rawUrl);
    let robots = '';
    try {
      const robotsUrl = new URL('/robots.txt', url.origin);
      const rr = await fetchWithTimeout(robotsUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' } }, 9000);
      if (rr.ok) robots = (await rr.text()).slice(0, 150000);
    } catch {}
    if (robots && robotsDisallows(robots, url.pathname)) {
      return { ok: false, provider: 'HTML público', blocked: true, error: 'robots.txt indica que esta rota não deve ser coletada automaticamente.' };
    }

    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
    }, 22000);
    if (!res.ok) return { ok: false, provider: 'HTML público', error: `HTTP ${res.status}` };
    const contentType = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|application\/json/i.test(contentType)) return { ok: false, provider: 'HTML público', error: `Tipo de conteúdo não suportado: ${contentType || 'desconhecido'}.` };
    const html = (await res.text()).slice(0, 4_000_000);
    const $ = cheerio.load(html);
    const jsonld = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try { jsonld.push(JSON.parse($(el).text())); } catch {}
    });
    let nextData = null;
    try { const raw = $('#__NEXT_DATA__').text(); if (raw) nextData = JSON.parse(raw); } catch {}
    $('script,style,noscript,svg').remove();
    const bodyText = ($('main').text() || $('article').text() || $('body').text() || '').replace(/\s+/g, ' ').trim().slice(0, 120000);
    const metadata = {
      title: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '',
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '',
      sourceURL: res.url,
      canonical: $('link[rel="canonical"]').attr('href') || '',
      latitude: $('meta[property="place:location:latitude"]').attr('content') || '',
      longitude: $('meta[property="place:location:longitude"]').attr('content') || '',
    };
    return {
      ok: true,
      provider: 'HTML público',
      data: { html: html.slice(0, 600000), markdown: bodyText, metadata, jsonld, nextData },
      robots_excerpt: robots.slice(0, 3000),
    };
  } catch (error) {
    return { ok: false, provider: 'HTML público', error: error?.name === 'AbortError' ? 'Timeout ao carregar a página.' : String(error?.message || error) };
  }
}

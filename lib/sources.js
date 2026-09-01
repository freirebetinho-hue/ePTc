export const LARGE_SOURCES = [
  { id: 'zap-vivareal', name: 'ZAP/VivaReal', category: 'grande', domains: ['zapimoveis.com.br', 'vivareal.com.br'] },
  { id: 'olx', name: 'OLX', category: 'grande', domains: ['olx.com.br'] },
  { id: 'imovelweb-wimoveis', name: 'Imovelweb/Wimoveis', category: 'grande', domains: ['imovelweb.com.br', 'wimoveis.com.br'] },
  { id: 'chavesnamao', name: 'Chaves na Mão', category: 'grande', domains: ['chavesnamao.com.br'] },
  { id: 'lopes', name: 'Lopes', category: 'grande', domains: ['lopes.com.br'] },
  { id: 'loft', name: 'Loft', category: 'grande', domains: ['loft.com.br'] },
  { id: 'quintoandar', name: 'QuintoAndar', category: 'grande', domains: ['quintoandar.com.br'] },
];

export const FALLBACK_REGIONAL_SOURCES = [
  { id: 'mgf', name: 'MGF Imóveis', category: 'regional', domains: ['mgfimoveis.com.br'] },
  { id: 'trovit', name: 'Trovit Imóveis', category: 'regional', domains: ['trovit.com.br'] },
  { id: 'properati', name: 'Properati', category: 'regional', domains: ['properati.com.br'] },
  { id: 'nestoria', name: 'Nestoria', category: 'regional', domains: ['nestoria.com.br'] },
];

export function largeSourcesForMode(mode = 'A') {
  const ids = mode === 'C'
    ? ['zap-vivareal', 'olx', 'imovelweb-wimoveis', 'chavesnamao', 'lopes', 'quintoandar']
    : ['zap-vivareal', 'olx', 'imovelweb-wimoveis', 'chavesnamao', 'lopes', 'loft'];
  return ids.map(id => LARGE_SOURCES.find(s => s.id === id)).filter(Boolean);
}

export function normalizeDomain(value = '') {
  try {
    const u = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(value).toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

export function mergeRegionalSources(discovered = []) {
  const all = [...discovered, ...FALLBACK_REGIONAL_SOURCES];
  const seen = new Set();
  return all.filter(item => {
    const domain = normalizeDomain(item.domain || item.domains?.[0] || '');
    if (!domain || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  }).map((item, index) => ({
    id: item.id || `regional-${index + 1}`,
    name: item.name || item.domain,
    category: 'regional',
    domains: (item.domains || [item.domain]).map(normalizeDomain).filter(Boolean),
    discovery_reason: item.reason || item.discovery_reason || '',
  }));
}

export function sourceCountSummary(results = []) {
  const searched = results.filter(r => ['pesquisado', 'sem_resultado', 'bloqueado'].includes(r.status));
  return {
    total: searched.length,
    grandes: searched.filter(r => r.category === 'grande').length,
    regionais: searched.filter(r => r.category === 'regional').length,
    erros: results.filter(r => r.status === 'erro').length,
  };
}

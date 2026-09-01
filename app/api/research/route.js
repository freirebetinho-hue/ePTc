import { largeSourcesForMode, mergeRegionalSources, normalizeDomain } from '../../../lib/sources';
import { searchWeb, publicScrape, urlMatchesDomains } from '../../../lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 300;

function n(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function extractMoney(text = '') {
  const matches = [...String(text).matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)].map(m => n(m[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : null;
}

function extractArea(text = '') {
  const m = String(text).match(/(?:terreno|lote|área)[^\d]{0,30}(\d{2,7}(?:[.,]\d+)?)\s*m(?:²|2)/i)
    || String(text).match(/(\d{2,7}(?:[.,]\d+)?)\s*m(?:²|2)[^\n]{0,25}(?:terreno|lote)/i);
  return m ? n(m[1]) : null;
}

function pickFromJsonLd(jsonld = []) {
  const flat = [];
  const push = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(push);
    if (typeof value === 'object') {
      flat.push(value);
      if (value['@graph']) push(value['@graph']);
    }
  };
  push(jsonld);
  return flat;
}

function findJsonLdValue(objects, keys = []) {
  for (const obj of objects) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value != null && value !== '') return value;
    }
  }
  return null;
}

function textFromScrape(scrape, result) {
  return [result?.title, result?.description, scrape?.data?.markdown, scrape?.data?.metadata?.title, scrape?.data?.metadata?.description].filter(Boolean).join('\n');
}

function inferType(text = '', briefing = {}) {
  const t = text.toLowerCase();
  if (/terreno|lote/.test(t)) return 'Terreno';
  if (/casa/.test(t)) return 'Casa';
  if (/galp[aã]o/.test(t)) return 'Galpão';
  if (/pr[eé]dio|edif[ií]cio/.test(t)) return 'Prédio';
  if (/apartamento|apto/.test(t)) return 'Apartamento';
  if (/comercial|loja|sala/.test(t)) return 'Imóvel comercial';
  return String(briefing.types || '').split(',')[0]?.trim() || '';
}

function parseAddress(jsonObjects = [], briefing = {}) {
  const raw = findJsonLdValue(jsonObjects, ['address']);
  if (raw && typeof raw === 'object') {
    return {
      logradouro: raw.streetAddress || '',
      numero: '',
      bairro: raw.addressLocality || '',
      cidade: raw.addressLocality || briefing.location || '',
      uf: raw.addressRegion || '',
      cep: raw.postalCode || '',
    };
  }
  return { logradouro: '', numero: '', bairro: '', cidade: briefing.location || '', uf: '', cep: '' };
}

function parseProperty(source, result, briefing, scrape) {
  const text = textFromScrape(scrape, result);
  const jsonObjects = pickFromJsonLd(scrape?.data?.jsonld || []);
  const title = result?.title || scrape?.data?.metadata?.title || '';
  const description = result?.description || scrape?.data?.metadata?.description || '';
  const url = result?.url || scrape?.data?.metadata?.sourceURL || '';
  const offer = findJsonLdValue(jsonObjects, ['offers']);
  const offerPrice = typeof offer === 'object' ? n(offer?.price || offer?.lowPrice || offer?.highPrice) : null;
  const price = offerPrice ?? extractMoney(text);
  const floorSize = findJsonLdValue(jsonObjects, ['floorSize']);
  const jsonArea = typeof floorSize === 'object' ? n(floorSize?.value) : n(floorSize);
  const areaTerreno = extractArea(text);
  const finalidade = briefing.mode === 'C' || /aluguel|alugar|loca[cç][aã]o/i.test(text) ? 'ALUGUEL' : 'VENDA';
  const address = parseAddress(jsonObjects, briefing);
  const latitude = n(scrape?.data?.metadata?.latitude);
  const longitude = n(scrape?.data?.metadata?.longitude);

  return {
    portal: source.name,
    url,
    codigo: '',
    finalidade,
    tipo_imovel: inferType(text, briefing),
    logradouro: address.logradouro,
    numero: address.numero,
    complemento: '',
    bairro: address.bairro,
    cidade: address.cidade,
    uf: address.uf,
    cep: address.cep,
    area_terreno_m2: areaTerreno,
    area_construida_m2: jsonArea,
    area_util_m2: null,
    area_privativa_m2: null,
    testada_m: null,
    preco: price,
    condominio: null,
    iptu: null,
    aluguel: finalidade === 'ALUGUEL' ? price : null,
    dormitorios: null,
    vagas: null,
    latitude,
    longitude,
    data_publicacao: result?.age || null,
    anunciante: '',
    creci: '',
    status_anuncio: 'A_VALIDAR',
    source_evidence: [title, description].filter(Boolean).join(' — ').slice(0, 1200),
    confidence_score: scrape?.ok ? 65 : 40,
    observacao: scrape?.ok ? 'Conteúdo público extraído diretamente da página. Campos não comprovados permaneceram vazios.' : `Página não extraída automaticamente: ${scrape?.error || 'indisponível'}`,
  };
}

function queryFor(briefing) {
  const purpose = briefing.mode === 'C' ? 'aluguel' : 'venda';
  const area = briefing.areaMin ? ` ${briefing.areaMin} m²` : '';
  const budget = briefing.budget ? ` até R$ ${briefing.budget}` : '';
  return `${briefing.types} ${purpose} ${briefing.location}${area}${budget}`.trim();
}

async function researchSource(source, briefing) {
  const query = queryFor(briefing);
  const search = await searchWeb({ query, domains: source.domains || [], count: 8 });
  const candidates = (search.results || []).filter(r => r.url && urlMatchesDomains(r.url, source.domains || [])).slice(0, 4);
  const properties = [];
  for (const result of candidates) {
    const scrape = await publicScrape(result.url);
    properties.push(parseProperty(source, result, briefing, scrape));
  }
  const status = candidates.length ? 'pesquisado' : (search.error ? 'erro' : 'sem_resultado');
  return {
    source: {
      name: source.name,
      domain: (source.domains || []).join(', '),
      category: source.category,
      status,
      query,
      url_consulta: candidates[0]?.url || '',
      result_count: properties.length,
      provider: search.provider,
      notes: search.error || (candidates.length ? `${candidates.length} URL(s) pública(s) localizada(s).` : 'Nenhuma URL compatível localizada nesta rodada.'),
      data_consulta: new Date().toISOString(),
    },
    properties,
  };
}

async function discoverRegional(briefing, largeDomains) {
  const query = `imobiliária local imóveis ${briefing.location} ${briefing.mode === 'C' ? 'aluguel' : 'venda'}`;
  const search = await searchWeb({ query, count: 20 });
  const blocked = new Set([...largeDomains, 'facebook.com', 'instagram.com', 'youtube.com', 'linkedin.com', 'wikipedia.org']);
  const seen = new Set();
  const candidates = [];
  for (const result of search.results || []) {
    let host = '';
    try { host = normalizeDomain(new URL(result.url).hostname); } catch { continue; }
    if (!host || [...blocked].some(d => host === d || host.endsWith(`.${d}`)) || seen.has(host)) continue;
    seen.add(host);
    candidates.push({ name: result.title?.split(/[|–—-]/)[0]?.trim() || host, domain: host, reason: result.description || `Fonte descoberta para ${briefing.location}` });
    if (candidates.length >= 10) break;
  }
  return { candidates, provider: search.provider, error: search.error || '' };
}

async function officialResearch(briefing) {
  if (briefing.mode !== 'A') return [];
  const isSPCapital = /(^|,|\s)s[aã]o paulo(\s*-?\s*sp|,\s*sp|$)/i.test(briefing.location || '');
  const source = isSPCapital ? 'GeoSampa / Prefeitura de São Paulo' : `Prefeitura / legislação urbanística de ${briefing.location}`;
  const query = isSPCapital ? `GeoSampa zoneamento ${briefing.location}` : `zoneamento plano diretor ${briefing.location} prefeitura`;
  const domains = isSPCapital ? ['geosampa.prefeitura.sp.gov.br', 'prefeitura.sp.gov.br'] : [];
  const search = await searchWeb({ query, domains, count: 5 });
  const hit = search.results?.[0];
  return [{
    source,
    url: hit?.url || '',
    status: hit ? 'consultado' : 'pendente',
    finding: hit ? (hit.description || hit.title || 'Fonte oficial localizada; exige validação do imóvel/lote.') : (search.error || 'Fonte oficial específica ainda não localizada.'),
    applies_to: 'geral',
    confidence: hit ? 'media' : 'baixa',
  }];
}

async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.all(items.slice(i, i + size).map(fn));
    out.push(...batch);
  }
  return out;
}

export async function POST(req) {
  try {
    const { briefing = {} } = await req.json();
    if (!briefing.confirmed) return Response.json({ ok: false, error: 'Briefing precisa estar confirmado.' }, { status: 400 });
    if (!briefing.mode || !briefing.location || !briefing.types) return Response.json({ ok: false, error: 'Briefing incompleto.' }, { status: 400 });

    const large = largeSourcesForMode(briefing.mode);
    const largeDomains = large.flatMap(s => s.domains || []).map(normalizeDomain);
    const discovery = await discoverRegional(briefing, largeDomains);
    const regionals = mergeRegionalSources(discovery.candidates).slice(0, 6);

    const all = [
      ...(await inChunks(large, 2, source => researchSource(source, briefing))),
      ...(await inChunks(regionals, 2, source => researchSource(source, briefing))),
    ];
    const official = await officialResearch(briefing);
    const sources = all.map(x => x.source);
    const properties = all.flatMap(x => x.properties).slice(0, 30);
    const limitations = [];
    const failed = sources.filter(s => s.status === 'erro');
    if (failed.length) limitations.push(`${failed.length} fonte(s) não puderam ser consultadas automaticamente: ${failed.map(x => x.name).join(', ')}.`);
    if (regionals.length < 6) limitations.push(`Somente ${regionals.length} fontes regionais foram identificadas automaticamente; complete a pesquisa com URLs/entrada manual se necessário.`);
    if (!properties.length) limitations.push('Nenhum anúncio verificável foi coletado automaticamente. Use a entrada manual/importação de URLs para complementar o estudo.');
    if (briefing.mode === 'A') limitations.push('Zoneamento, CA, SQL/IPTU, matrícula, contaminação e remembramento exigem confirmação oficial por imóvel/lote.');

    return Response.json({
      ok: true,
      summary: {
        query: queryFor(briefing),
        limitations,
        notes: `Modo sem API: pesquisa por HTML público, extração direta e entrada manual assistida. ${sources.length} fontes registradas nesta rodada.`,
      },
      sources,
      properties,
      official,
      discovery,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

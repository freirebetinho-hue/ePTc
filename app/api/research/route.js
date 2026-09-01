import { ToolLoopAgent, gateway, stepCountIs } from 'ai';
import { largeSourcesForMode, mergeRegionalSources, normalizeDomain } from '../../../lib/sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM = `Você é o agente BPC Busca de Áreas, especializado em prospecção imobiliária no Brasil.
Regras obrigatórias:
- Nunca invente imóvel, endereço, preço, área, disponibilidade, coordenada, fonte ou consulta.
- Use a ferramenta de busca sempre que solicitado a pesquisar uma fonte.
- Uma página genérica do portal não é um anúncio específico.
- Dados de anúncio são declaratórios. Identifique incertezas e não converta inferência em fato.
- area_terreno_m2 é SOMENTE terreno; área útil/privativa/construída deve ficar em seu campo próprio.
- Não afirme contiguidade sem evidência cadastral/cartográfica de divisa comum.
- Não contorne login, CAPTCHA, paywall ou bloqueio.
- No Modo A, anúncio não confirma zoneamento, CA, SQL/IPTU ou matrícula.
- Responda SOMENTE JSON válido, sem markdown.`;

function safeParse(text, fallback = {}) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {} }
  return fallback;
}

function sourceUrl(source) {
  return source?.url || source?.source?.url || source?.value?.url || '';
}
function host(url = '') { try { return normalizeDomain(new URL(url).hostname); } catch { return normalizeDomain(url); } }
function matchesDomains(url, domains = []) { const h = host(url); return domains.some(d => h === normalizeDomain(d) || h.endsWith(`.${normalizeDomain(d)}`)); }
function dedupeByUrl(items = []) { const seen = new Set(); return items.filter(x => { const u = x?.url; if (!u || seen.has(u)) return false; seen.add(u); return true; }); }

function makeSearchAgent(domains = []) {
  const config = { country: 'BR', searchRecencyFilter: 'month' };
  if (domains.length) config.searchDomainFilter = domains.slice(0, 5);
  return new ToolLoopAgent({
    model: 'openai/gpt-5',
    instructions: SYSTEM,
    stopWhen: stepCountIs(6),
    tools: { web_search: gateway.tools.perplexitySearch(config) },
  });
}

async function researchSource(source, briefing) {
  const agent = makeSearchAgent(source.domains || []);
  const prompt = `Pesquise EXCLUSIVAMENTE a fonte ${source.name} (${(source.domains || []).join(', ')}) para o briefing abaixo.
${JSON.stringify(briefing)}
Use a busca web. Procure páginas específicas de imóveis compatíveis. Retorne no máximo 4 imóveis e somente valores sustentados pelas páginas encontradas.
JSON obrigatório:
{"properties":[{"portal":"${source.name}","url":"","codigo":"","finalidade":"VENDA|ALUGUEL","tipo_imovel":"","logradouro":"","numero":"","complemento":"","bairro":"","cidade":"","uf":"","cep":"","area_terreno_m2":null,"area_construida_m2":null,"area_util_m2":null,"area_privativa_m2":null,"testada_m":null,"preco":null,"condominio":null,"iptu":null,"aluguel":null,"dormitorios":null,"vagas":null,"latitude":null,"longitude":null,"data_publicacao":null,"anunciante":"","creci":"","status_anuncio":"ATIVO|A_VALIDAR","source_evidence":"","confidence_score":0,"observacao":""}],"notes":""}`;
  try {
    const result = await agent.generate({ prompt });
    const evidenceUrls = dedupeByUrl((result.sources || []).map(s => ({ url: sourceUrl(s) })).filter(x => matchesDomains(x.url, source.domains || [])));
    const parsed = safeParse(result.text, { properties: [], notes: 'Resposta não estruturada.' });
    const properties = (parsed.properties || []).filter(p => p.url && matchesDomains(p.url, source.domains || [])).slice(0, 4).map(p => ({ ...p, portal: source.name }));
    return {
      source: {
        name: source.name, domain: (source.domains || []).join(', '), category: source.category,
        status: evidenceUrls.length ? (properties.length ? 'pesquisado' : 'sem_resultado') : 'erro',
        query: `${briefing.types} em ${briefing.location}`,
        url_consulta: evidenceUrls[0]?.url || '', result_count: properties.length,
        notes: evidenceUrls.length ? (parsed.notes || '') : 'A ferramenta de busca não retornou evidência verificável deste domínio nesta rodada.',
      },
      properties,
      evidence: evidenceUrls,
    };
  } catch (error) {
    return { source: { name: source.name, domain: (source.domains || []).join(', '), category: source.category, status: 'erro', query: `${briefing.types} em ${briefing.location}`, url_consulta: '', result_count: 0, notes: error instanceof Error ? error.message : String(error) }, properties: [], evidence: [] };
  }
}

async function discoverRegional(briefing, largeDomains) {
  const agent = makeSearchAgent([]);
  const prompt = `Descubra imobiliárias e portais imobiliários REGIONAIS realmente ligados a ${briefing.location}, Brasil, com páginas públicas de imóveis. Evite os grandes portais nacionais e sites de notícias. Use busca web. Retorne até 10 candidatos em JSON: {"regional":[{"name":"","domain":"","reason":""}]}`;
  try {
    const result = await agent.generate({ prompt });
    const actualDomains = new Set((result.sources || []).map(sourceUrl).map(host).filter(Boolean));
    const parsed = safeParse(result.text, { regional: [] });
    const validated = (parsed.regional || []).filter(x => {
      const d = normalizeDomain(x.domain || '');
      const evidenced = [...actualDomains].some(a => a === d || a.endsWith(`.${d}`) || d.endsWith(`.${a}`));
      const isLarge = largeDomains.some(ld => d === ld || d.endsWith(`.${ld}`));
      return d && evidenced && !isLarge;
    });
    return { candidates: validated, evidence: [...actualDomains] };
  } catch { return { candidates: [], evidence: [] }; }
}

async function officialResearch(briefing) {
  if (briefing.mode !== 'A') return [];
  const agent = makeSearchAgent([]);
  const prompt = `Pesquise fontes OFICIAIS de urbanismo aplicáveis a ${briefing.location}. Priorize prefeitura/legislação municipal, mapas oficiais de zoneamento e, quando a localização for São Paulo capital, GeoSampa e legislação urbanística. Não invente CA/zoneamento de imóvel específico sem endereço/SQL confirmado. Retorne JSON: {"official":[{"source":"","url":"","status":"consultado|pendente|indisponivel","finding":"","applies_to":"geral|endereço","confidence":"alta|media|baixa"}]}`;
  try {
    const result = await agent.generate({ prompt });
    const evidenceUrls = new Set((result.sources || []).map(sourceUrl).filter(Boolean));
    const parsed = safeParse(result.text, { official: [] });
    return (parsed.official || []).filter(o => o.url && [...evidenceUrls].some(u => host(u) === host(o.url) || u === o.url)).map(o => ({ ...o, status: o.status || 'consultado' }));
  } catch { return []; }
}

async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.all(items.slice(i, i + size).map(fn)); out.push(...batch);
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
    const regionalDiscovery = await discoverRegional(briefing, largeDomains);
    const regionals = mergeRegionalSources(regionalDiscovery.candidates).slice(0, 6);

    const largeResults = await inChunks(large, 3, source => researchSource(source, briefing));
    const regionalResults = await inChunks(regionals, 3, source => researchSource(source, briefing));
    const all = [...largeResults, ...regionalResults];
    const official = await officialResearch(briefing);

    const sources = all.map(x => ({ ...x.source, data_consulta: new Date().toISOString() }));
    const properties = all.flatMap(x => x.properties).slice(0, 30);
    const limitations = [];
    const failed = sources.filter(s => s.status === 'erro');
    const empty = sources.filter(s => s.status === 'sem_resultado');
    if (failed.length) limitations.push(`${failed.length} fontes sem evidência verificável nesta rodada: ${failed.map(x => x.name).join(', ')}.`);
    if (empty.length) limitations.push(`${empty.length} fontes pesquisadas sem imóvel compatível encontrado.`);
    if (briefing.mode === 'A') limitations.push('Zoneamento, CA, SQL/IPTU, matrícula, contaminação e remembramento devem ser confirmados por imóvel antes da decisão.');

    return Response.json({
      ok: true,
      summary: { query: `${briefing.types} em ${briefing.location}`, limitations, notes: `Pesquisa orquestrada em ${sources.length} fontes; cada fonte só conta como pesquisada quando a ferramenta retorna evidência do domínio.` },
      sources,
      properties,
      official,
      discovery: { regional_candidates: regionalDiscovery.candidates, evidence_domains: regionalDiscovery.evidence },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

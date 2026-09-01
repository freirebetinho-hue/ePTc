import { ToolLoopAgent, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { largeSourcesForMode } from '../../../lib/sources';

export const runtime = 'nodejs';

const SYSTEM = `Você é o agente BPC Busca de Áreas, especializado em prospecção imobiliária no Brasil.
Regras obrigatórias:
- Não invente imóvel, endereço, preço, área, disponibilidade, coordenada ou fonte.
- Use busca web para localizar apenas páginas públicas verificáveis.
- Registre URL específica do anúncio quando houver; não use apenas página genérica do portal como se fosse anúncio.
- Diferencie fato confirmado, dado declarado pelo anúncio e inferência.
- Não afirme contiguidade sem evidência de divisa/lote/quadra.
- Não contorne login, CAPTCHA, paywall ou bloqueio.
- Para Modo A, dados de zoneamento/CA anunciados não substituem fonte oficial.
- ZAP e VivaReal pertencem ao mesmo grupo e devem ser tratados como uma origem ampla para deduplicação.
- Retorne SOMENTE JSON válido, sem markdown.`;

function safeParse(text) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  throw new Error('O agente não retornou JSON válido.');
}

export async function POST(req) {
  try {
    const body = await req.json();
    const briefing = body.briefing || {};
    if (!briefing.confirmed) return Response.json({ ok: false, error: 'Briefing precisa estar confirmado.' }, { status: 400 });
    if (!briefing.mode || !briefing.location || !briefing.types) return Response.json({ ok: false, error: 'Briefing incompleto.' }, { status: 400 });

    const large = largeSourcesForMode(briefing.mode);
    const prompt = `Execute UMA rodada de pesquisa imobiliária para o briefing abaixo.
BRIEFING:
${JSON.stringify(briefing, null, 2)}

ETAPA 1 — DESCOBERTA REGIONAL:
Descubra pelo menos 6 imobiliárias/portais regionais realmente relacionados à localização do briefing. Dê preferência a imobiliárias locais, portais de bairro/cidade e agregadores que tenham resultados públicos. Não invente nomes.

ETAPA 2 — GRANDES PORTAIS:
Pesquise os seguintes 6 grupos/fontes grandes: ${large.map(s => s.name).join(', ')}.

ETAPA 3 — RESULTADOS:
Em cada fonte pesquisada, procure imóveis compatíveis com o briefing. Priorize páginas específicas de detalhe. Para cada imóvel extraia somente o que estiver sustentado pela fonte.

Retorne neste schema JSON:
{
  "summary": {"query":"", "limitations":[], "notes":""},
  "sources": [
    {"name":"", "domain":"", "category":"grande|regional", "status":"pesquisado|sem_resultado|bloqueado|erro", "query":"", "url_consulta":"", "result_count":0, "notes":""}
  ],
  "properties": [
    {"portal":"", "url":"", "codigo":"", "finalidade":"VENDA|ALUGUEL", "tipo_imovel":"", "logradouro":"", "numero":"", "complemento":"", "bairro":"", "cidade":"", "uf":"", "cep":"", "area_terreno_m2":null, "area_construida_m2":null, "testada_m":null, "preco":null, "condominio":null, "iptu":null, "dormitorios":null, "vagas":null, "latitude":null, "longitude":null, "data_publicacao":null, "anunciante":"", "creci":"", "status_anuncio":"ATIVO|A_VALIDAR", "source_evidence":"", "confidence_score":0, "observacao":""}
  ],
  "official": [
    {"source":"", "url":"", "status":"consultado|pendente|indisponivel", "finding":"", "applies_to":"geral|property_url_or_address", "confidence":"alta|media|baixa"}
  ]
}

Regras adicionais:
- Não preencha latitude/longitude se a fonte não trouxer coordenadas ou endereço suficiente.
- area_terreno_m2 é somente terreno. Se a fonte só informar área útil/construída, deixe terreno null.
- Se um portal não retornar anúncio verificável, mantenha a fonte em sources com result_count 0.
- No Modo A, pesquise também fontes oficiais adequadas à localização quando acessíveis pela web (por exemplo GeoSampa/legislação municipal em São Paulo), mas marque como pendente qualquer dado que exija SQL/IPTU/matrícula específica.
- Não ultrapasse 30 imóveis nesta rodada; prefira qualidade e URLs verificáveis.`;

    const agent = new ToolLoopAgent({
      model: 'openai/gpt-5-mini',
      instructions: SYSTEM,
      stopWhen: stepCountIs(18),
      tools: {
        web_search: openai.tools.webSearch({ searchContextSize: 'high' }),
      },
    });

    const result = await agent.generate({ prompt });
    const payload = safeParse(result.text);
    return Response.json({ ok: true, ...payload, web_sources: result.sources || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

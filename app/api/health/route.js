import { apiConfig } from '../../../lib/providers';

export const runtime = 'nodejs';

export async function GET() {
  const config = apiConfig();
  const searchConfigured = config.brave || config.firecrawl;
  return Response.json({
    ok: true,
    version: '0.3.0',
    runtime: 'nodejs',
    services: {
      search: {
        ok: searchConfigured,
        status: searchConfigured ? 'configured' : 'optional_not_configured',
        providers: { brave: config.brave, firecrawl: config.firecrawl },
        message: searchConfigured ? 'Ao menos um provedor de busca está configurado.' : 'Configure BRAVE_SEARCH_API_KEY ou FIRECRAWL_API_KEY para pesquisa automática.',
      },
      extraction: {
        ok: true,
        firecrawl: config.firecrawl,
        fallback: 'html_publico',
        message: config.firecrawl ? 'Firecrawl ativo com fallback para HTML público.' : 'Firecrawl não configurado; HTML público será usado quando permitido.',
      },
      geocoding: {
        ok: config.googleGeocoding || config.nominatimFallback,
        google: config.googleGeocoding,
        nominatimFallback: config.nominatimFallback,
        message: config.googleGeocoding ? 'Google Geocoding ativo.' : (config.nominatimFallback ? 'Google não configurado; Nominatim disponível como fallback.' : 'Nenhum geocodificador configurado.'),
      },
      export: { ok: true, provider: 'ExcelJS' },
      localStorage: { ok: true, scope: 'browser' },
    },
    timestamp: new Date().toISOString(),
  });
}

import { runtimeConfig } from '../../../lib/providers';

export const runtime = 'nodejs';

export async function GET() {
  const config = runtimeConfig();
  return Response.json({
    ok: true,
    version: '0.4.0',
    runtime: 'nodejs',
    mode: config.mode,
    requires_api_key: false,
    services: {
      search: {
        ok: true,
        provider: 'HTML público (DuckDuckGo/Bing)',
        message: 'Sem chave. Resultados dependem da disponibilidade pública dos mecanismos de busca e dos portais.',
      },
      extraction: {
        ok: true,
        provider: 'HTML/JSON-LD público',
        message: 'Sem chave. Respeita bloqueios, robots.txt e não contorna autenticação/CAPTCHA.',
      },
      geocoding: {
        ok: true,
        provider: 'manual',
        coordinates: false,
        message: 'Sem API de geocodificação. O sistema gera link de Maps e mantém coordenadas como não confirmadas até entrada manual.',
      },
      export: { ok: true, provider: 'ExcelJS' },
      persistence: { ok: true, provider: 'localStorage + JSON', scope: 'browser' },
    },
    timestamp: new Date().toISOString(),
  });
}

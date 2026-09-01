export const runtime = 'nodejs';

function mapsLink(address = '') {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export async function POST(req) {
  try {
    const { address } = await req.json();
    const value = String(address || '').trim();
    if (value.length < 5) {
      return Response.json({ ok: false, error: 'Endereço insuficiente.' }, { status: 400 });
    }

    return Response.json({
      ok: true,
      found: false,
      provider: 'SEM_API',
      geo_precisao: 'NAO_GEOCODIFICADO',
      link_maps: mapsLink(value),
      warning: 'Modo sem API: coordenadas não são inventadas. Use o link do Maps para conferência e informe latitude/longitude manualmente quando houver evidência confiável.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { address } = await req.json();
    if (!address || String(address).trim().length < 5) {
      return Response.json({ ok: false, error: 'Endereço insuficiente para geocodificação.' }, { status: 400 });
    }
    const endpoint = new URL('https://nominatim.openstreetmap.org/search');
    endpoint.searchParams.set('q', String(address));
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('addressdetails', '1');
    endpoint.searchParams.set('countrycodes', 'br');
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'BPCBuscaAreas/0.2 (real-estate-research; contact-through-app)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) return Response.json({ ok: false, error: `Geocodificador retornou ${res.status}.` }, { status: 502 });
    const data = await res.json();
    if (!data.length) return Response.json({ ok: true, found: false });
    const item = data[0];
    return Response.json({
      ok: true,
      found: true,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      display_name: item.display_name,
      geo_precisao: 'APROXIMADO_RUA',
      provider: 'OpenStreetMap/Nominatim',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

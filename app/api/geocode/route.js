import { apiConfig, fetchWithTimeout } from '../../../lib/providers';

export const runtime = 'nodejs';

function precisionFromGoogle(result) {
  const types = result?.types || [];
  if (types.includes('street_address') || types.includes('premise')) return 'EXATO';
  if (types.includes('route')) return 'APROXIMADO_RUA';
  if (types.includes('sublocality') || types.includes('neighborhood')) return 'BAIRRO';
  return 'APROXIMADO';
}

async function googleGeocode(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('address', address);
  endpoint.searchParams.set('region', 'br');
  endpoint.searchParams.set('language', 'pt-BR');
  endpoint.searchParams.set('key', key);
  const res = await fetchWithTimeout(endpoint, {}, 15000);
  if (!res.ok) throw new Error(`Google Geocoding retornou HTTP ${res.status}.`);
  const data = await res.json();
  if (data.status === 'ZERO_RESULTS') return { found: false, provider: 'Google Geocoding' };
  if (data.status !== 'OK') throw new Error(`Google Geocoding: ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`);
  const item = data.results?.[0];
  if (!item?.geometry?.location) return { found: false, provider: 'Google Geocoding' };
  return {
    found: true,
    latitude: Number(item.geometry.location.lat),
    longitude: Number(item.geometry.location.lng),
    display_name: item.formatted_address || address,
    geo_precisao: precisionFromGoogle(item),
    provider: 'Google Geocoding',
  };
}

async function nominatimGeocode(address) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', address);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('countrycodes', 'br');
  const res = await fetchWithTimeout(endpoint, {
    headers: {
      'User-Agent': 'BPCBuscaAreas/0.3 (real-estate-research; local-development)',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  }, 15000);
  if (!res.ok) throw new Error(`Nominatim retornou HTTP ${res.status}.`);
  const data = await res.json();
  if (!data.length) return { found: false, provider: 'OpenStreetMap/Nominatim' };
  const item = data[0];
  return {
    found: true,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    display_name: item.display_name,
    geo_precisao: item.type === 'house' || item.type === 'building' ? 'EXATO' : 'APROXIMADO_RUA',
    provider: 'OpenStreetMap/Nominatim',
  };
}

export async function POST(req) {
  try {
    const { address } = await req.json();
    const value = String(address || '').trim();
    if (value.length < 5) return Response.json({ ok: false, error: 'Endereço insuficiente para geocodificação.' }, { status: 400 });

    const cfg = apiConfig();
    const errors = [];
    if (cfg.googleGeocoding) {
      try {
        const result = await googleGeocode(value);
        if (result?.found) return Response.json({ ok: true, ...result });
        if (result && !result.found) errors.push('Google não localizou o endereço.');
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }

    if (cfg.nominatimFallback) {
      try {
        const result = await nominatimGeocode(value);
        return Response.json({ ok: true, ...result, fallback: cfg.googleGeocoding });
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }

    return Response.json({ ok: true, found: false, provider: 'nenhum', warning: errors.join(' | ') || 'Nenhum geocodificador disponível.' });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

import * as cheerio from 'cheerio';
import { firecrawlScrape, fetchWithTimeout } from '../../../lib/providers';

export const runtime = 'nodejs';

function isPrivateHost(hostname = '') {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./); if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  return false;
}

function robotsDisallows(robots = '', pathname = '/') {
  const lines = robots.split(/\r?\n/).map(x => x.trim());
  let applies = false;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [keyRaw, ...rest] = line.split(':');
    const key = keyRaw.toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*' || /bpcbuscaareas/i.test(value);
    if (applies && key === 'disallow' && value && pathname.startsWith(value)) return true;
  }
  return false;
}

export async function POST(req) {
  try {
    const { url } = await req.json();
    let target;
    try { target = new URL(String(url || '')); } catch { return Response.json({ ok: false, error: 'URL inválida.' }, { status: 400 }); }
    if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname)) {
      return Response.json({ ok: false, error: 'URL não permitida.' }, { status: 400 });
    }

    const fc = await firecrawlScrape(target.toString());
    if (fc.ok) {
      return Response.json({
        ok: true,
        url: fc.data?.metadata?.sourceURL || target.toString(),
        data_consulta: new Date().toISOString(),
        provider: 'Firecrawl',
        markdown: fc.data?.markdown || '',
        html: fc.data?.html || '',
        meta: fc.data?.metadata || {},
        notice: 'Conteúdo extraído via Firecrawl sem contornar autenticação ou CAPTCHA.',
      });
    }

    const robotsUrl = new URL('/robots.txt', target).toString();
    let robots = '';
    try {
      const rr = await fetchWithTimeout(robotsUrl, { headers: { 'User-Agent': 'BPCBuscaAreas/0.3' } }, 10000);
      if (rr.ok) robots = await rr.text();
    } catch {}
    if (robotsDisallows(robots, target.pathname)) {
      return Response.json({ ok: false, error: 'robots.txt não permite coleta automatizada desta rota.', manual_review_required: true, provider: 'HTML direto' }, { status: 403 });
    }

    const res = await fetchWithTimeout(target, {
      headers: {
        'User-Agent': 'BPCBuscaAreas/0.3',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
    }, 20000);
    if (!res.ok) return Response.json({ ok: false, status: res.status, error: 'Fonte indisponível ou bloqueada; usar entrada manual.', manual_review_required: true });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return Response.json({ ok: false, error: 'Conteúdo retornado não é HTML.', manual_review_required: true }, { status: 415 });
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const jsonld = [];
    $('script[type="application/ld+json"]').each((_, el) => { try { jsonld.push(JSON.parse($(el).text())); } catch {} });
    const next = $('#__NEXT_DATA__').text();
    let nextData = null; try { if (next) nextData = JSON.parse(next); } catch {}
    const meta = {
      title: $('meta[property="og:title"]').attr('content') || $('title').text() || '',
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '',
      latitude: $('meta[property="place:location:latitude"]').attr('content') || $('meta[name="geo.position"]').attr('content') || '',
      longitude: $('meta[property="place:location:longitude"]').attr('content') || '',
    };
    return Response.json({
      ok: true,
      url: res.url,
      data_consulta: new Date().toISOString(),
      provider: 'HTML direto',
      robots_excerpt: robots.slice(0, 3000),
      jsonld,
      nextData,
      meta,
      notice: fc.configured ? `Firecrawl indisponível (${fc.error}); usado HTML público como fallback.` : 'Firecrawl não configurado; usado HTML público como fallback.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error), manual_review_required: true }, { status: 502 });
  }
}

import { publicScrape } from '../../../lib/providers';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { url } = await req.json();
    const result = await publicScrape(String(url || ''));
    if (!result.ok) {
      return Response.json({
        ok: false,
        error: result.error || 'Não foi possível extrair a página pública.',
        blocked: Boolean(result.blocked),
        manual_review_required: true,
        provider: result.provider || 'HTML público',
      }, { status: result.blocked ? 403 : 502 });
    }

    return Response.json({
      ok: true,
      url: result.data?.metadata?.sourceURL || String(url || ''),
      data_consulta: new Date().toISOString(),
      provider: result.provider,
      markdown: result.data?.markdown || '',
      html: result.data?.html || '',
      jsonld: result.data?.jsonld || [],
      nextData: result.data?.nextData || null,
      meta: result.data?.metadata || {},
      robots_excerpt: result.robots_excerpt || '',
      notice: 'Modo sem API: conteúdo público extraído diretamente, sem chave externa e sem contornar autenticação, CAPTCHA ou robots.txt.',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error), manual_review_required: true }, { status: 502 });
  }
}

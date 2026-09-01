import * as cheerio from 'cheerio';

export async function POST(req){
 const {url}=await req.json();
 if(!/^https?:\/\//i.test(url||'')) return Response.json({ok:false,error:'URL inválida'},{status:400});
 try{
  const robotsUrl=new URL('/robots.txt',url).toString();
  let robots=''; try{robots=await (await fetch(robotsUrl,{headers:{'user-agent':'BPCBuscaAreas/1.0'}})).text()}catch{}
  const res=await fetch(url,{headers:{'user-agent':'BPCBuscaAreas/1.0'} ,redirect:'follow'});
  if(!res.ok) return Response.json({ok:false,status:res.status,error:'Fonte indisponível ou bloqueada; usar entrada manual.'});
  const html=await res.text(); const $=cheerio.load(html);
  const jsonld=[]; $('script[type="application/ld+json"]').each((_,el)=>{try{jsonld.push(JSON.parse($(el).text()))}catch{}});
  const next=$('#__NEXT_DATA__').text(); let nextData=null; try{if(next)nextData=JSON.parse(next)}catch{}
  const meta={title:$('meta[property="og:title"]').attr('content')||$('title').text(),description:$('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content')||'',latitude:$('meta[property="place:location:latitude"]').attr('content')||$('meta[name="geo.position"]').attr('content')||'',longitude:$('meta[property="place:location:longitude"]').attr('content')||''};
  return Response.json({ok:true,url:res.url,data_consulta:new Date().toISOString(),robots_excerpt:robots.slice(0,3000),jsonld,nextData,meta,notice:'Conteúdo público extraído sem contornar autenticação, CAPTCHA ou bloqueios.'});
 }catch(e){return Response.json({ok:false,error:String(e),manual_review_required:true},{status:502})}
}

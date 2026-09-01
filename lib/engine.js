export const SOURCES=[
['ZAP/VivaReal','grande'],['OLX','grande'],['Imovelweb/Wimoveis','grande'],['Chaves na Mão','grande'],['Lopes','grande'],['Loft','grande'],['QuintoAndar','grande'],['MGF','regional'],['Zona Leste Imóveis','regional'],['Nestoria','regional'],['Trovit','regional'],['Properati','regional'],['Imobiliária regional 1','regional'],['Imobiliária regional 2','regional']
].map(([name,type],i)=>({id:i+1,name,type,status:'pendente',count:0,url:'',notes:''}));

export function normalizeText(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\bR\.?\b/g,'RUA').replace(/\bAV\.?\b/g,'AVENIDA').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
export function money(v){const n=Number(v||0);return Number.isFinite(n)?n:0}
export function mapsLink(p){if(p.latitude&&p.longitude)return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;const q=[p.logradouro,p.numero,p.bairro,p.cidade,p.uf].filter(Boolean).join(', ');return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
export function canonicalize(p,i=0){const a=p.area_terreno_m2==null||p.area_terreno_m2===''?null:money(p.area_terreno_m2);const price=p.preco==null||p.preco===''?null:money(p.preco);return {...p,id_canonico:p.id_canonico||`P-${Date.now()}-${i}-${Math.random().toString(36).slice(2,7)}`,logradouro:p.logradouro||'',numero:p.numero||'',bairro:p.bairro||'',cidade:p.cidade||'',uf:p.uf||'SP',area_terreno_m2:a,preco:price,preco_m2:a&&price?price/a:0,geo_precisao:p.geo_precisao||'NAO_GEOCODIFICADO',data_consulta:p.data_consulta||new Date().toISOString(),status_anuncio:p.status_anuncio||'A_VALIDAR',flag_desatualizado:!!p.flag_desatualizado,dedup_status:p.dedup_status||'UNICO',link_maps:mapsLink(p),anti_fake_score:Number.isFinite(Number(p.anti_fake_score))?Number(p.anti_fake_score):antiFakeScore(p)}}

function haversineMeters(a,b){const lat1=Number(a.latitude),lon1=Number(a.longitude),lat2=Number(b.latitude),lon2=Number(b.longitude);if(![lat1,lon1,lat2,lon2].every(Number.isFinite))return null;const R=6371000,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const s=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(s))}
function tokens(v){return new Set(normalizeText(v).split(' ').filter(x=>x.length>2))}
function jaccard(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let inter=0;for(const x of A)if(B.has(x))inter++;return inter/(A.size+B.size-inter)}
function relativeClose(a,b,tolerance){a=money(a);b=money(b);return !!(a&&b&&Math.abs(a-b)/Math.max(a,b)<=tolerance)}

export function similarity(a,b){
 let s=0;const distance=haversineMeters(a,b);
 if(normalizeText(a.cidade)&&normalizeText(a.cidade)===normalizeText(b.cidade))s+=6;
 if(normalizeText(a.bairro)&&normalizeText(a.bairro)===normalizeText(b.bairro))s+=10;
 if(normalizeText(a.logradouro)&&normalizeText(a.logradouro)===normalizeText(b.logradouro))s+=18;
 if(a.numero&&b.numero&&normalizeText(a.numero)===normalizeText(b.numero))s+=32;
 if(distance!=null&&distance<20)s+=42;else if(distance!=null&&distance<60)s+=18;
 if(relativeClose(a.area_terreno_m2,b.area_terreno_m2,.05))s+=20;
 if(relativeClose(a.testada_m,b.testada_m,.05))s+=12;
 if(relativeClose(a.preco,b.preco,.10))s+=8;
 if(a.foto_hash&&b.foto_hash&&a.foto_hash===b.foto_hash)s+=65;
 if(a.codigo&&b.codigo&&normalizeText(a.codigo)===normalizeText(b.codigo))s+=18;
 const desc=jaccard(a.source_evidence||a.observacao||'',b.source_evidence||b.observacao||'');if(desc>.65)s+=15;else if(desc>.4)s+=7;
 return Math.min(s,100)
}

function strongDuplicate(a,b,score){const distance=haversineMeters(a,b);const sameNumber=a.numero&&b.numero&&normalizeText(a.numero)===normalizeText(b.numero)&&normalizeText(a.logradouro)===normalizeText(b.logradouro);const coordArea=distance!=null&&distance<20&&relativeClose(a.area_terreno_m2,b.area_terreno_m2,.05);const samePhoto=a.foto_hash&&b.foto_hash&&a.foto_hash===b.foto_hash;return sameNumber||coordArea||samePhoto||score>=82}

export function deduplicate(list){
 const out=[];const links=[];
 for(const p0 of list){const p=canonicalize(p0,out.length);let merged=false;
  for(const x of out){const score=similarity(p,x);if(strongDuplicate(p,x,score)){
    const originSet=new Set([...(Array.isArray(x.origens)?x.origens:[x.origens||x.portal]),p.portal].filter(Boolean));x.origens=[...originSet];
    const history=[...(x.historico_precos||[{preco:x.preco,url:x.url,data:x.data_consulta,portal:x.portal}]),{preco:p.preco,url:p.url,data:p.data_consulta,portal:p.portal}];
    x.historico_precos=history.filter((v,i,a)=>a.findIndex(q=>q.url===v.url&&q.preco===v.preco&&q.data===v.data)===i);
    if(!x.latitude&&p.latitude){x.latitude=p.latitude;x.longitude=p.longitude;x.geo_precisao=p.geo_precisao;x.link_maps=mapsLink(x)}
    if(!x.area_terreno_m2&&p.area_terreno_m2)x.area_terreno_m2=p.area_terreno_m2;
    x.dedup_status='MESCLADO';links.push({a:x.id_canonico,b:p.id_canonico,score,status:'MESCLADO',reason:'endereço/coordenada/área/foto compatível'});merged=true;break
   }else if(score>=45){links.push({a:x.id_canonico,b:p.id_canonico,score,status:'PROVAVEL',reason:'similaridade insuficiente para merge automático'})}}
  if(!merged)out.push(p)
 }
 return {unique:out,links}
}

export function antiFakeScore(p){let s=0;if(!p.url)s+=25;if(!p.logradouro&&!p.numero)s+=15;if(!p.codigo)s+=8;if(p.urgencia_suspeita)s+=20;if(p.pede_sinal_antes_visita)s+=35;if(p.status_anuncio==='INDEFINIDO')s+=8;return Math.min(s,100)}
export function modeA(p,params={}){const At=money(p.area_terreno_m2);const ca=money(p.ca_max||params.ca_max);const ac=At*ca;const eff=Math.min(.78,Math.max(.68,money(params.eficiencia||.72)));const apv=ac*eff;const vgv=apv*money(params.preco_venda_m2);const oodc=money(p.oodc||params.oodc);const land=money(p.preco);return {At,ca_max:ca,AC:ac,eficiencia:eff,APV:apv,VGV:vgv,OODC:oodc,preco_potencial_m2:ac?(land+oodc)/ac:0,custo_terreno_outorga_vgv:vgv?(land+oodc)/vgv:0}}
export function modeBC(p,params={}){const rent=money(p.aluguel||params.aluguel);const annual=rent*12;const adm=annual*money(params.adm_pct||.09);const vac=annual*money(params.vacancia_pct||.05);const maint=annual*money(params.manutencao_pct||.03);const insurance=money(params.seguro_anual);const condo=money(p.condominio)*12*money(params.condominio_vago_pct||0);const iptu=money(p.iptu)*12;const inad=annual*money(params.inadimplencia_pct||.02);const noi=annual-iptu-condo-maint-insurance-vac-inad-adm;const price=money(p.preco);return {aluguel_mensal:rent,yield_bruto:price?annual/price:0,NOI:noi,cap_rate_liquido:price?noi/price:0,payback_anos:noi>0?price/noi:null,valor_total_ocupacao:rent+money(p.condominio)+money(p.iptu)}}
export const CHECKS=['Briefing confirmado e modo definido','≥12 portais pesquisados e documentados','Modo A: fontes oficiais/zoneamento e potencial preenchidos ou limitação registrada','Áreas de terreno diferenciadas e confrontadas quando possível','Deduplicação executada e histórico de preços preservado','geo_precisao + link anúncio + Google Maps','Filtro anti-fake e frescor aplicados','Excel XLSX gerado','Relatório executivo gerado','Limitações declaradas; fato × inferência separados','B/C: cap rate líquido e yield separados'];

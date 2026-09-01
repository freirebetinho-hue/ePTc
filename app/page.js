'use client';
import {useMemo,useState} from 'react';

const initial={mode:'A',location:'',budget:'',types:'',areaMin:'',frontMin:'',maxProperties:'',rentTarget:'',confirmed:false};

function calcA(p){const At=+p.area||0,ca=+p.ca||0,price=+p.price||0,oodc=+p.oodc||0,eff=+p.eff||0.72,sale=+p.sale||0;const ac=At*ca,apv=ac*eff,vgv=apv*sale;return {ac,apv,vgv,potential:ac?((price+oodc)/ac):0,landPct:vgv?((price+oodc)/vgv)*100:0}}
function calcB(p){const price=+p.price||0,rent=+p.rent||0,iptu=+p.iptu||0,cond=+p.cond||0,maint=+p.maint||0,ins=+p.ins||0,vac=+p.vac||0.05,defaultRate=+p.defaultRate||0.02,adm=+p.adm||0.09;const gross=rent*12;const noi=gross-iptu-cond-maint-ins-(gross*vac)-(gross*defaultRate)-(gross*adm);return {grossYield:price?gross/price*100:0,noi,cap:price?noi/price*100:0,payback:noi>0?price/noi:0}}

export default function Home(){
 const [b,setB]=useState(initial); const [rows,setRows]=useState([]); const [form,setForm]=useState({});
 const canStart=b.mode&&b.location&&b.types&&(b.budget||b.mode==='C');
 const checks=useMemo(()=>[
  ['Briefing confirmado',b.confirmed],['>=12 portais documentados',false],['Deduplicação executada',rows.length>0],['Geo + links preenchidos',rows.length>0&&rows.every(r=>r.geo_precisao&&r.url&&r.link_maps)],['Anti-fake/frescor aplicados',rows.length>0&&rows.every(r=>r.data_consulta&&r.anti_fake_score!==undefined)],['Excel gerado',false]
 ],[b.confirmed,rows]);
 function add(){const id=crypto.randomUUID();const base={id_canonico:id,finalidade:b.mode==='C'?'ALUGUEL':'VENDA',...form,data_consulta:new Date().toISOString(),geo_precisao:form.geo_precisao||'NAO_GEOCODIFICADO',anti_fake_score:+form.anti_fake_score||0,link_maps:form.link_maps||'',dedup_status:'UNICO'};setRows(x=>[...x,base]);setForm({});}
 async function exportXlsx(){const res=await fetch('/api/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({briefing:b,rows,checks})});const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=((b.location||'estudo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').toLowerCase())+'_'+new Date().toISOString().slice(0,10).replaceAll('-','')+'.xlsx';a.click();URL.revokeObjectURL(a.href)}
 return <main style={{fontFamily:'Arial',maxWidth:1200,margin:'0 auto',padding:24}}>
  <h1>BPC Busca de Áreas — Inteligência Imobiliária</h1><p>Agente de prospecção, formação de áreas, potencial construtivo e renda.</p>
  <section><h2>1. Briefing obrigatório</h2><select value={b.mode} onChange={e=>setB({...b,mode:e.target.value})}><option value='A'>Modo A — Incorporação</option><option value='B'>Modo B — Compra para renda</option><option value='C'>Modo C — Aluguel</option></select>
  <input placeholder='Localização' value={b.location} onChange={e=>setB({...b,location:e.target.value})}/><input placeholder='Orçamento' value={b.budget} onChange={e=>setB({...b,budget:e.target.value})}/><input placeholder='Tipos permitidos' value={b.types} onChange={e=>setB({...b,types:e.target.value})}/>
  {b.mode==='A'&&<><input placeholder='Área mínima m²' value={b.areaMin} onChange={e=>setB({...b,areaMin:e.target.value})}/><input placeholder='Testada mínima m' value={b.frontMin} onChange={e=>setB({...b,frontMin:e.target.value})}/><input placeholder='Máx. imóveis na composição' value={b.maxProperties} onChange={e=>setB({...b,maxProperties:e.target.value})}/></>}
  {b.mode!=='A'&&<input placeholder='Cap rate/yield alvo' value={b.rentTarget} onChange={e=>setB({...b,rentTarget:e.target.value})}/>}<button disabled={!canStart} onClick={()=>setB({...b,confirmed:true})}>CONFIRMAR BRIEFING</button></section>
  <section><h2>2. Base de imóveis</h2><p>Use somente dados verificáveis e registre URL, data, precisão geográfica e fonte.</p>{['portal','url','logradouro','numero','bairro','cidade','area','price','latitude','longitude','geo_precisao','link_maps','anti_fake_score'].map(k=><input key={k} placeholder={k} value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
  {b.mode==='A'&&['ca','oodc','eff','sale'].map(k=><input key={k} placeholder={k} value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
  {b.mode!=='A'&&['rent','iptu','cond','maint','ins','vac','defaultRate','adm'].map(k=><input key={k} placeholder={k} value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}<button onClick={add}>Adicionar imóvel</button>
  <table><thead><tr><th>Portal</th><th>Endereço</th><th>Preço</th><th>Métrica</th><th>Status</th></tr></thead><tbody>{rows.map(r=>{const m=b.mode==='A'?calcA(r):calcB(r);return <tr key={r.id_canonico}><td>{r.portal}</td><td>{r.logradouro}, {r.numero}</td><td>{r.price}</td><td>{b.mode==='A'?`VGV R$ ${m.vgv.toFixed(0)} | Terreno/VGV ${m.landPct.toFixed(1)}%`:`Cap rate ${m.cap.toFixed(2)}% | Yield ${m.grossYield.toFixed(2)}%`}</td><td>{r.dedup_status}</td></tr>})}</tbody></table></section>
  <section><h2>3. CHECK FINAL</h2>{checks.map(([n,ok])=><div key={n}>{ok?'✅':'⬜'} {n}</div>)}<button onClick={exportXlsx}>Exportar XLSX</button></section>
 </main>
}

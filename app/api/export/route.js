import * as XLSX from 'xlsx';

export async function POST(req){
 const {briefing,rows,checks}=await req.json();
 const wb=XLSX.utils.book_new();
 const summary=[['BPC Busca de Áreas'],['Modo',briefing.mode],['Localização',briefing.location],['Orçamento',briefing.budget],['Tipos',briefing.types],['Anúncios/únicos',rows.length],['Metodologia','Dados declarados devem ser confrontados com fontes oficiais; fatos, inferências e limitações devem permanecer separados.']];
 const sources=[['Portal','Categoria','Status','Data consulta','URL','Limitação']];
 [...new Set(rows.map(r=>r.portal).filter(Boolean))].forEach(p=>sources.push([p,'A CLASSIFICAR','PESQUISADO',new Date().toISOString(),'','']));
 const base=rows.map(r=>({id_canonico:r.id_canonico,finalidade:r.finalidade,tipo_imovel:r.tipo_imovel||'',logradouro:r.logradouro||'',numero:r.numero||'',complemento:r.complemento||'',bairro:r.bairro||'',cidade:r.cidade||'',uf:r.uf||'',cep:r.cep||'',latitude:r.latitude||'',longitude:r.longitude||'',geo_precisao:r.geo_precisao||'',link_maps:r.link_maps||'',sql_geosampa:r.sql_geosampa||'',quadra:r.quadra||'',area_terreno_m2:r.area||'',area_construida_m2:r.area_construida_m2||'',area_confirmada:r.area_confirmada||'N',testada_m:r.testada_m||'',dormitorios:r.dormitorios||'',vagas:r.vagas||'',preco:r.price||'',condominio:r.cond||'',iptu:r.iptu||'',preco_m2:(+r.area?+r.price/+r.area:''),valor_total_ocupacao:r.valor_total_ocupacao||'',yield_indicador:r.yield_indicador||'',zoneamento:r.zoneamento||'',contiguidade_status:r.contiguidade_status||'',portal:r.portal||'',codigo:r.codigo||'',url:r.url||'',origens:r.origens||r.portal||'',foto_hash:r.foto_hash||'',dedup_status:r.dedup_status||'',status_anuncio:r.status_anuncio||'A_VALIDAR',flag_desatualizado:r.flag_desatualizado||false,data_publicacao:r.data_publicacao||'',data_consulta:r.data_consulta||'',observacao:r.observacao||''}));
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'Resumo');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sources),'Portais_Fonte_Pesquisados');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(base),'Base_de_Imoveis');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([]),briefing.mode==='A'?'Areas_Montadas':'Comparativo_Aluguel_Renda');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([]),briefing.mode==='A'?'Potencial':'Analise_Renda');
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Item','Status'],...checks.map(([n,ok])=>[n,ok?'OK':'PENDENTE'])]),'Verificacao');
 const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 return new Response(out,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="estudo.xlsx"'}})
}

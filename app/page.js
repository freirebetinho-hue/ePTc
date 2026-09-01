'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { canonicalize, deduplicate, modeA, modeBC, CHECKS } from '../lib/engine';
import { sourceCountSummary } from '../lib/sources';

const STORAGE_KEY = 'bpc-busca-areas-study-v2';
const initialBriefing = {
  mode: 'A', location: '', budget: '', types: 'terreno, casa, imóvel comercial', deadline: '', risk: 'moderado', confirmed: false,
  areaMin: '', frontMin: '', maxProperties: '5', acceptsOccupied: 'sim', acceptsOffMarket: 'sim', targetProduct: '', targetVGV: '',
  acquisition: 'compra', restrictions: '', zeisTolerance: 'avaliar', bedrooms: '', parking: '', furnished: 'indiferente', usage: 'residencial', rentTarget: '', horizon: '',
};
const initialParamsA = { ca_max: '', eficiencia: 0.72, preco_venda_m2: '', oodc: '' };
const initialParamsBC = { adm_pct: 0.09, vacancia_pct: 0.05, manutencao_pct: 0.03, inadimplencia_pct: 0.02, seguro_anual: 0, condominio_vago_pct: 0 };

function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); }
function pct(v) { return `${(Number(v || 0) * 100).toFixed(2)}%`; }
function address(p) { return [p.logradouro, p.numero, p.bairro, p.cidade, p.uf].filter(Boolean).join(', '); }
function downloadJson(data, filename) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }

export default function Home() {
  const [briefing, setBriefing] = useState(initialBriefing);
  const [rows, setRows] = useState([]);
  const [sources, setSources] = useState([]);
  const [official, setOfficial] = useState([]);
  const [limitations, setLimitations] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState([]);
  const [paramsA, setParamsA] = useState(initialParamsA);
  const [paramsBC, setParamsBC] = useState(initialParamsBC);
  const [manual, setManual] = useState({ finalidade: 'VENDA', tipo_imovel: '', portal: '', url: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: 'SP', area_terreno_m2: '', area_construida_m2: '', testada_m: '', preco: '', aluguel: '', condominio: '', iptu: '', codigo: '', observacao: '' });
  const [researching, setResearching] = useState(false);
  const [message, setMessage] = useState('');
  const [excelGenerated, setExcelGenerated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const importRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        setBriefing(saved.briefing || initialBriefing); setRows(saved.rows || []); setSources(saved.sources || []); setOfficial(saved.official || []);
        setLimitations(saved.limitations || []); setDuplicates(saved.duplicates || []); setGroups(saved.groups || []); setParamsA(saved.paramsA || initialParamsA); setParamsBC(saved.paramsBC || initialParamsBC);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ briefing, rows, sources, official, limitations, duplicates, groups, paramsA, paramsBC }));
  }, [loaded, briefing, rows, sources, official, limitations, duplicates, groups, paramsA, paramsBC]);

  const sourceSummary = useMemo(() => sourceCountSummary(sources), [sources]);
  const enrichedRows = useMemo(() => rows.map(r => {
    const metrics = briefing.mode === 'A' ? modeA(r, paramsA) : modeBC(r, paramsBC);
    return { ...r, metrics, yield_indicador: briefing.mode === 'A' ? metrics.custo_terreno_outorga_vgv : metrics.cap_rate_liquido };
  }), [rows, briefing.mode, paramsA, paramsBC]);

  const checks = useMemo(() => {
    const sourceOK = sourceSummary.total >= 12 && sourceSummary.grandes >= 6 && sourceSummary.regionais >= 6;
    const geoOK = rows.length > 0 && rows.every(r => r.url && r.link_maps && r.geo_precisao);
    const freshOK = rows.length > 0 && rows.every(r => r.data_consulta && typeof r.anti_fake_score === 'number' && r.status_anuncio);
    const officialOK = briefing.mode !== 'A' || (official.some(x => x.status === 'consultado') && rows.some(r => r.zoneamento || r.ca_max || r.zoneamento_fonte));
    const areaOK = rows.length > 0 && rows.every(r => r.area_terreno_m2 == null || r.area_terreno_m2 === '' || Number(r.area_terreno_m2) >= 0);
    const rentOK = briefing.mode === 'A' || enrichedRows.every(r => r.metrics && Number.isFinite(r.metrics.cap_rate_liquido));
    return [
      [CHECKS[0], !!briefing.confirmed, briefing.confirmed ? 'Briefing confirmado.' : 'Confirme o briefing antes da pesquisa.'],
      [CHECKS[1], sourceOK, `${sourceSummary.total} fontes: ${sourceSummary.grandes} grandes e ${sourceSummary.regionais} regionais.`],
      [CHECKS[2], officialOK, briefing.mode === 'A' ? 'Exige evidência oficial de zoneamento/CA e potencial por imóvel/grupo.' : 'Não aplicável ao modo atual.'],
      [CHECKS[3], areaOK, 'Área de terreno permanece separada de área construída/útil.'],
      [CHECKS[4], rows.length > 0, `${rows.length} registros canônicos; ${duplicates.length} vínculos de duplicidade/probabilidade.`],
      [CHECKS[5], geoOK, geoOK ? 'URLs e precisão geográfica registradas.' : 'Há imóvel sem anúncio, Maps ou geo_precisao.'],
      [CHECKS[6], freshOK, freshOK ? 'Frescor e anti-fake registrados.' : 'Há itens sem data/status/anti-fake.'],
      [CHECKS[7], excelGenerated, excelGenerated ? 'Arquivo Excel foi gerado nesta sessão.' : 'Gere o Excel após concluir as validações.'],
      [CHECKS[8], rows.length > 0, 'Resumo executivo é montado a partir da base atual.'],
      [CHECKS[9], limitations.length > 0 || sourceSummary.total > 0, limitations.length ? limitations.join(' | ') : 'Sem limitações registradas pelo agente até o momento.'],
      [CHECKS[10], rentOK, briefing.mode === 'A' ? 'Não aplicável.' : 'NOI, yield bruto e cap rate líquido calculados separadamente.'],
    ];
  }, [briefing, rows, official, enrichedRows, duplicates, limitations, sourceSummary, excelGenerated]);

  const completion = Math.round((checks.filter(x => x[1]).length / checks.length) * 100);
  const canResearch = briefing.confirmed && briefing.location && briefing.types;

  function setB(key, value) { setBriefing(prev => ({ ...prev, [key]: value, confirmed: key === 'confirmed' ? value : false })); setExcelGenerated(false); }
  function confirmBriefing() {
    if (!briefing.mode || !briefing.location || !briefing.types) return setMessage('Preencha modo, localização e tipos permitidos.');
    setBriefing(prev => ({ ...prev, confirmed: true })); setMessage('Briefing confirmado. O robô pode iniciar a pesquisa.');
  }

  function applyDedup(input) {
    const result = deduplicate(input);
    const probableIds = new Set(result.links.filter(x => x.status === 'PROVAVEL').flatMap(x => [x.a, x.b]));
    const unique = result.unique.map(r => probableIds.has(r.id_canonico) ? { ...r, dedup_status: 'PROVAVEL' } : r);
    setRows(unique); setDuplicates(result.links); setExcelGenerated(false);
    return unique;
  }

  async function runResearch() {
    if (!canResearch) return;
    setResearching(true); setMessage('Executando pesquisa multiportal...');
    try {
      const res = await fetch('/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ briefing }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha na pesquisa.');
      const now = new Date().toISOString();
      const newSources = (data.sources || []).map(s => ({ ...s, data_consulta: now }));
      const sourceMap = new Map([...sources, ...newSources].map(s => [`${s.name}|${s.domain}`, s]));
      setSources([...sourceMap.values()]);
      setOfficial(prev => [...prev, ...(data.official || [])].filter((x, i, a) => a.findIndex(y => y.source === x.source && y.url === x.url && y.applies_to === x.applies_to) === i));
      const newRows = (data.properties || []).map((p, i) => canonicalize({ ...p, data_consulta: now, geo_precisao: p.latitude && p.longitude ? 'EXATO' : (p.logradouro ? 'APROXIMADO_RUA' : 'BAIRRO'), area_confirmada: p.area_confirmada || 'N', source_evidence: p.source_evidence || '', flag_desatualizado: false }, i));
      applyDedup([...rows, ...newRows]);
      const lim = [...limitations, ...(data.summary?.limitations || [])].filter(Boolean);
      setLimitations([...new Set(lim)]);
      setMessage(`Rodada concluída: ${newRows.length} candidatos coletados e ${newSources.length} fontes registradas.`);
    } catch (e) { setMessage(`Falha na pesquisa: ${e.message}`); }
    finally { setResearching(false); }
  }

  function addManual() {
    if (!manual.url || (!manual.bairro && !manual.cidade)) return setMessage('Entrada manual exige URL e localização.');
    const p = canonicalize({ ...manual, area_terreno_m2: manual.area_terreno_m2 ? Number(manual.area_terreno_m2) : null, area_construida_m2: manual.area_construida_m2 ? Number(manual.area_construida_m2) : null, testada_m: manual.testada_m ? Number(manual.testada_m) : null, preco: manual.preco ? Number(manual.preco) : null, aluguel: manual.aluguel ? Number(manual.aluguel) : null, condominio: manual.condominio ? Number(manual.condominio) : null, iptu: manual.iptu ? Number(manual.iptu) : null, fonte_manual: true, status_anuncio: 'A_VALIDAR', area_confirmada: 'N' }, rows.length);
    applyDedup([...rows, p]);
    setManual(prev => ({ ...prev, url: '', logradouro: '', numero: '', area_terreno_m2: '', area_construida_m2: '', testada_m: '', preco: '', aluguel: '', observacao: '' }));
    setMessage('Imóvel incluído e deduplicação reprocessada.');
  }

  async function geocodeOne(id) {
    const p = rows.find(x => x.id_canonico === id); if (!p) return;
    const res = await fetch('/api/geocode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: address(p) }) });
    const data = await res.json();
    if (data.ok && data.found) {
      setRows(prev => prev.map(x => x.id_canonico === id ? canonicalize({ ...x, latitude: data.latitude, longitude: data.longitude, geo_precisao: data.geo_precisao, observacao: [x.observacao, `Geocodificado por ${data.provider}`].filter(Boolean).join(' | ') }) : x));
      setMessage('Geocodificação aproximada concluída.');
    } else setMessage(data.error || 'Endereço não localizado.');
  }

  function toggleSelected(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function createGroup() {
    const members = enrichedRows.filter(r => selected.includes(r.id_canonico));
    if (members.length < 2) return setMessage('Selecione pelo menos 2 imóveis para formar uma área.');
    const areaTotal = members.reduce((a, p) => a + Number(p.area_terreno_m2 || 0), 0);
    const priceTotal = members.reduce((a, p) => a + Number(p.preco || 0), 0);
    const frontTotal = members.reduce((a, p) => a + Number(p.testada_m || 0), 0);
    const min = Number(briefing.areaMin || 0);
    setGroups(g => [...g, { group_id: crypto.randomUUID(), name: `GRUPO ${g.length + 1}`, member_ids: selected, quantidade_imoveis: members.length, area_total_m2: areaTotal, preco_total: priceTotal, testada_total_m: frontTotal, excedente_deficit_m2: min ? areaTotal - min : 0, contiguidade_status: 'NAO_CONFIRMADO', confidence_score: 0, evidence_notes: 'Aguardando evidência de divisa comum/lote/quadra.' }]);
    setSelected([]); setMessage('Grupo criado. A contiguidade continua NÃO CONFIRMADA até validação cadastral/cartográfica.');
  }

  function updateGroup(id, patch) { setGroups(g => g.map(x => x.group_id === id ? { ...x, ...patch } : x)); }
  function updateProperty(id, patch) { setRows(prev => prev.map(x => x.id_canonico === id ? canonicalize({ ...x, ...patch }) : x)); setExcelGenerated(false); }

  async function exportXlsx() {
    const res = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ briefing, rows: enrichedRows, sources, checks, groups, official, limitations }) });
    if (!res.ok) return setMessage('Falha ao gerar Excel.');
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const cd = res.headers.get('content-disposition') || ''; a.download = cd.match(/filename="([^"]+)/)?.[1] || 'estudo.xlsx'; a.click(); URL.revokeObjectURL(a.href);
    setExcelGenerated(true); setMessage('Excel profissional gerado.');
  }

  function exportStudy() { downloadJson({ briefing, rows, sources, official, limitations, duplicates, groups, paramsA, paramsBC }, 'bpc_estudo.json'); }
  function importStudy(file) { const reader = new FileReader(); reader.onload = () => { try { const d = JSON.parse(reader.result); setBriefing(d.briefing || initialBriefing); setRows(d.rows || []); setSources(d.sources || []); setOfficial(d.official || []); setLimitations(d.limitations || []); setDuplicates(d.duplicates || []); setGroups(d.groups || []); setParamsA(d.paramsA || initialParamsA); setParamsBC(d.paramsBC || initialParamsBC); setMessage('Estudo importado.'); } catch { setMessage('Arquivo de estudo inválido.'); } }; reader.readAsText(file); }
  function resetStudy() { if (!confirm('Apagar o estudo salvo neste navegador?')) return; localStorage.removeItem(STORAGE_KEY); location.reload(); }

  const report = useMemo(() => {
    const ranked = [...enrichedRows].sort((a, b) => briefing.mode === 'A' ? (b.metrics?.VGV || 0) - (a.metrics?.VGV || 0) : (b.metrics?.cap_rate_liquido || 0) - (a.metrics?.cap_rate_liquido || 0)).slice(0, 5);
    return { ranked, unique: rows.length, sources: sourceSummary.total, groups: groups.length };
  }, [enrichedRows, rows.length, sourceSummary.total, groups.length, briefing.mode]);

  return <main className="appShell">
    <header className="topbar">
      <div><div className="eyebrow">BPC • INTELIGÊNCIA IMOBILIÁRIA</div><h1>Busca de Áreas</h1><p>Prospecção multiportal, formação de terrenos, potencial construtivo e renda.</p></div>
      <div className="topActions"><button className="secondary" onClick={exportStudy}>Salvar estudo</button><button className="secondary" onClick={() => importRef.current?.click()}>Importar</button><input ref={importRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && importStudy(e.target.files[0])}/><button className="danger" onClick={resetStudy}>Novo estudo</button></div>
    </header>

    <div className="statusStrip"><span className="pill">Modo {briefing.mode}</span><span>{briefing.location || 'Localização não definida'}</span><span>Conclusão <strong>{completion}%</strong></span><span>{rows.length} imóveis únicos</span><span>{sourceSummary.total} fontes</span></div>
    {message && <div className="message">{message}</div>}

    <section>
      <div className="sectionHead"><div><span className="step">01</span><h2>Briefing obrigatório</h2></div><span className={briefing.confirmed ? 'badge ok' : 'badge warn'}>{briefing.confirmed ? 'CONFIRMADO' : 'PENDENTE'}</span></div>
      <div className="grid4">
        <label>Modo<select value={briefing.mode} onChange={e => setB('mode', e.target.value)}><option value="A">A — Incorporação</option><option value="B">B — Compra para renda</option><option value="C">C — Aluguel</option></select></label>
        <label>Localização<input value={briefing.location} onChange={e => setB('location', e.target.value)} placeholder="Ex.: Guarulhos, SP / Cumbica"/></label>
        <label>Orçamento<input value={briefing.budget} onChange={e => setB('budget', e.target.value)} placeholder="Ex.: 8.000.000"/></label>
        <label>Tipos permitidos<input value={briefing.types} onChange={e => setB('types', e.target.value)}/></label>
        <label>Prazo<input value={briefing.deadline} onChange={e => setB('deadline', e.target.value)} placeholder="Ex.: 60 dias"/></label>
        <label>Risco<select value={briefing.risk} onChange={e => setB('risk', e.target.value)}><option>baixo</option><option>moderado</option><option>alto</option></select></label>
        {briefing.mode === 'A' ? <>
          <label>Área mínima m²<input value={briefing.areaMin} onChange={e => setB('areaMin', e.target.value)}/></label><label>Testada mínima m<input value={briefing.frontMin} onChange={e => setB('frontMin', e.target.value)}/></label>
          <label>Máx. imóveis<input value={briefing.maxProperties} onChange={e => setB('maxProperties', e.target.value)}/></label><label>Produto alvo<input value={briefing.targetProduct} onChange={e => setB('targetProduct', e.target.value)} placeholder="Ex.: HIS/R2V médio padrão"/></label>
          <label>VGV/APV alvo<input value={briefing.targetVGV} onChange={e => setB('targetVGV', e.target.value)}/></label><label>Aquisição<select value={briefing.acquisition} onChange={e => setB('acquisition', e.target.value)}><option>compra</option><option>permuta</option><option>opção</option></select></label>
          <label>Vizinhos off-market<select value={briefing.acceptsOffMarket} onChange={e => setB('acceptsOffMarket', e.target.value)}><option>sim</option><option>não</option></select></label><label>Restrições<input value={briefing.restrictions} onChange={e => setB('restrictions', e.target.value)} placeholder="ZEIS, APA, topografia..."/></label>
        </> : <>
          <label>Quartos<input value={briefing.bedrooms} onChange={e => setB('bedrooms', e.target.value)}/></label><label>Vagas<input value={briefing.parking} onChange={e => setB('parking', e.target.value)}/></label>
          <label>Mobiliado<select value={briefing.furnished} onChange={e => setB('furnished', e.target.value)}><option>indiferente</option><option>sim</option><option>não</option></select></label><label>Uso<select value={briefing.usage} onChange={e => setB('usage', e.target.value)}><option>residencial</option><option>comercial</option></select></label>
          <label>Cap rate/yield alvo<input value={briefing.rentTarget} onChange={e => setB('rentTarget', e.target.value)}/></label><label>Horizonte<input value={briefing.horizon} onChange={e => setB('horizon', e.target.value)}/></label>
        </>}
      </div>
      <button onClick={confirmBriefing}>Confirmar briefing</button>
    </section>

    <section>
      <div className="sectionHead"><div><span className="step">02</span><h2>Robô de pesquisa multiportal</h2></div><span className="badge info">6 GRANDES + 6 REGIONAIS</span></div>
      <p className="muted">O agente pesquisa páginas públicas, descobre fontes regionais da própria localização e registra fontes sem resultado ou bloqueadas em vez de simular cobertura.</p>
      <button disabled={!canResearch || researching} onClick={runResearch}>{researching ? 'Pesquisando...' : 'Rodar pesquisa agora'}</button>
      <div className="kpis"><div><b>{sourceSummary.total}</b><span>fontes documentadas</span></div><div><b>{sourceSummary.grandes}</b><span>grandes</span></div><div><b>{sourceSummary.regionais}</b><span>regionais</span></div><div><b>{rows.length}</b><span>imóveis canônicos</span></div></div>
      {sources.length > 0 && <div className="tableWrap"><table><thead><tr><th>Fonte</th><th>Categoria</th><th>Status</th><th>Resultados</th><th>Consulta</th><th>Observação</th></tr></thead><tbody>{sources.map((s, i) => <tr key={`${s.name}-${i}`}><td>{s.url_consulta ? <a href={s.url_consulta} target="_blank">{s.name}</a> : s.name}</td><td>{s.category}</td><td><span className={`badge ${s.status === 'pesquisado' ? 'ok' : s.status === 'bloqueado' ? 'bad' : 'warn'}`}>{s.status}</span></td><td>{s.result_count ?? 0}</td><td>{s.query}</td><td>{s.notes}</td></tr>)}</tbody></table></div>}
    </section>

    <section>
      <div className="sectionHead"><div><span className="step">03</span><h2>Base de imóveis e deduplicação</h2></div><span className="badge info">{duplicates.length} vínculos detectados</span></div>
      <div className="tableWrap"><table><thead><tr><th></th><th>Status</th><th>Portal</th><th>Endereço</th><th>Terreno</th><th>Preço</th><th>Métrica</th><th>Geo</th><th>Links</th></tr></thead><tbody>{enrichedRows.map(r => <tr key={r.id_canonico}><td>{briefing.mode === 'A' && <input type="checkbox" checked={selected.includes(r.id_canonico)} onChange={() => toggleSelected(r.id_canonico)}/>}</td><td><span className={`badge ${r.dedup_status === 'PROVAVEL' ? 'warn' : 'ok'}`}>{r.dedup_status}</span></td><td>{r.portal}</td><td>{address(r) || r.bairro}</td><td>{r.area_terreno_m2 ? `${Number(r.area_terreno_m2).toLocaleString('pt-BR')} m²` : 'não informado'}</td><td>{r.preco ? brl(r.preco) : '—'}</td><td>{briefing.mode === 'A' ? <>VGV {brl(r.metrics.VGV)}<br/><small>Custo/VGV {pct(r.metrics.custo_terreno_outorga_vgv)}</small></> : <>Cap {pct(r.metrics.cap_rate_liquido)}<br/><small>Yield {pct(r.metrics.yield_bruto)}</small></>}</td><td>{r.geo_precisao}<br/>{!r.latitude && r.logradouro && <button className="mini secondary" onClick={() => geocodeOne(r.id_canonico)}>Geocodificar</button>}</td><td>{r.url && <a href={r.url} target="_blank">Anúncio</a>}<br/>{r.link_maps && <a href={r.link_maps} target="_blank">Maps</a>}</td></tr>)}</tbody></table></div>
      {briefing.mode === 'A' && <button disabled={selected.length < 2} onClick={createGroup}>Formar área com selecionados ({selected.length})</button>}
      {duplicates.length > 0 && <details><summary>Revisar possíveis duplicidades</summary><div className="tableWrap"><table><thead><tr><th>Registro A</th><th>Registro B</th><th>Score</th><th>Status</th></tr></thead><tbody>{duplicates.map((d, i) => <tr key={i}><td>{d.a}</td><td>{d.b}</td><td>{d.score}</td><td>{d.status}</td></tr>)}</tbody></table></div></details>}
    </section>

    <section>
      <div className="sectionHead"><div><span className="step">04</span><h2>Entrada manual / fonte bloqueada</h2></div><span className="badge warn">EXIGE URL</span></div>
      <div className="grid4">
        {['portal','url','tipo_imovel','logradouro','numero','bairro','cidade','area_terreno_m2','area_construida_m2','testada_m','preco','aluguel','condominio','iptu','codigo','observacao'].map(k => <label key={k}>{k.replaceAll('_',' ')}<input value={manual[k] || ''} onChange={e => setManual(m => ({ ...m, [k]: e.target.value }))}/></label>)}
      </div><button onClick={addManual}>Adicionar e deduplicar</button>
    </section>

    {briefing.mode === 'A' ? <>
      <section><div className="sectionHead"><div><span className="step">05</span><h2>Fontes oficiais e potencial construtivo</h2></div><span className="badge warn">VALIDAÇÃO BLOQUEANTE</span></div>
        <div className="grid4"><label>CA máximo<input value={paramsA.ca_max} onChange={e => setParamsA({ ...paramsA, ca_max: e.target.value })}/></label><label>Eficiência<input value={paramsA.eficiencia} onChange={e => setParamsA({ ...paramsA, eficiencia: e.target.value })}/></label><label>Preço venda R$/m²<input value={paramsA.preco_venda_m2} onChange={e => setParamsA({ ...paramsA, preco_venda_m2: e.target.value })}/></label><label>OODC estimada<input value={paramsA.oodc} onChange={e => setParamsA({ ...paramsA, oodc: e.target.value })}/></label></div>
        <p className="muted">Parâmetros globais são apenas cenário. Para aprovação final, registre no imóvel a fonte oficial de zoneamento/CA e confirme área de terreno em SQL/IPTU/matrícula quando possível.</p>
        {official.length > 0 && <div className="tableWrap"><table><thead><tr><th>Fonte</th><th>Status</th><th>Aplicação</th><th>Achado</th><th>Confiança</th></tr></thead><tbody>{official.map((o,i) => <tr key={i}><td>{o.url ? <a href={o.url} target="_blank">{o.source}</a> : o.source}</td><td>{o.status}</td><td>{o.applies_to}</td><td>{o.finding}</td><td>{o.confidence}</td></tr>)}</tbody></table></div>}
        {groups.length > 0 && <><h3>Áreas montadas</h3>{groups.map(g => <div className="groupCard" key={g.group_id}><div><strong>{g.name}</strong><span>{g.quantidade_imoveis} imóveis • {g.area_total_m2.toLocaleString('pt-BR')} m² • {brl(g.preco_total)}</span></div><label>Contiguidade<select value={g.contiguidade_status} onChange={e => updateGroup(g.group_id, { contiguidade_status: e.target.value })}><option>NAO_CONFIRMADO</option><option>CROSS-CHECK</option><option>CONFIRMADO</option></select></label><label>Evidência<input value={g.evidence_notes} onChange={e => updateGroup(g.group_id, { evidence_notes: e.target.value, confidence_score: e.target.value ? 70 : 0 })}/></label></div>)}</>}
      </section>
    </> : <section><div className="sectionHead"><div><span className="step">05</span><h2>Premissas de renda</h2></div><span className="badge info">NOI / CAP RATE</span></div><div className="grid4">{Object.entries(paramsBC).map(([k,v]) => <label key={k}>{k.replaceAll('_',' ')}<input value={v} onChange={e => setParamsBC({ ...paramsBC, [k]: Number(e.target.value) })}/></label>)}</div><p className="muted">Yield bruto e cap rate líquido são exibidos separadamente. Informação para análise, não recomendação de investimento.</p></section>}

    <section>
      <div className="sectionHead"><div><span className="step">06</span><h2>Resumo executivo</h2></div><span className="badge info">TOP 5</span></div>
      <p><strong>{report.unique}</strong> imóveis únicos analisados em <strong>{report.sources}</strong> fontes documentadas. {briefing.mode === 'A' ? `${report.groups} agrupamentos de área foram montados.` : 'Ranking priorizado por cap rate líquido.'}</p>
      <div className="opportunityGrid">{report.ranked.map((r,i) => <div className="opportunity" key={r.id_canonico}><span>#{i+1}</span><strong>{address(r) || r.bairro || 'Endereço não confirmado'}</strong><small>{r.portal} • {r.geo_precisao}</small><b>{briefing.mode === 'A' ? `VGV ${brl(r.metrics.VGV)}` : `Cap rate ${pct(r.metrics.cap_rate_liquido)}`}</b></div>)}</div>
      {limitations.length > 0 && <div className="limitations"><strong>Limitações registradas</strong>{limitations.map((x,i) => <div key={i}>• {x}</div>)}</div>}
    </section>

    <section>
      <div className="sectionHead"><div><span className="step">07</span><h2>CHECK FINAL</h2></div><span className={`badge ${completion === 100 ? 'ok' : 'warn'}`}>{completion}%</span></div>
      <div className="checkList">{checks.map(([name, ok, note]) => <div className={ok ? 'check okline' : 'check'} key={name}><span>{ok ? '✓' : '!'}</span><div><strong>{name}</strong><small>{note}</small></div></div>)}</div>
      <button onClick={exportXlsx}>Gerar Excel profissional</button>
    </section>

    <footer>Dados de anúncios são declaratórios. Não tomar decisão de aquisição/incorporação sem validação cadastral, urbanística, documental e jurídica adequada.</footer>
  </main>;
}

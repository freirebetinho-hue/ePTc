import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const DARK = '0F172A';
const WHITE = 'FFFFFF';
const LIGHT = 'E2E8F0';
const GREEN = 'DCFCE7';
const YELLOW = 'FEF3C7';
const RED = 'FEE2E2';

function sanitizeName(value = 'estudo') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 45) || 'estudo';
}

function styleWorksheet(ws, freeze = true) {
  ws.views = freeze ? [{ state: 'frozen', ySplit: 1 }] : [];
  ws.autoFilter = ws.rowCount > 0 && ws.columnCount > 0 ? { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } } : undefined;
  ws.eachRow((row, rowNumber) => {
    row.eachCell(cell => {
      cell.font = { name: 'Arial', size: 10, color: { argb: rowNumber === 1 ? WHITE : '111827' }, bold: rowNumber === 1 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: LIGHT } },
        left: { style: 'thin', color: { argb: LIGHT } },
        bottom: { style: 'thin', color: { argb: LIGHT } },
        right: { style: 'thin', color: { argb: LIGHT } },
      };
      if (rowNumber === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    });
  });
  ws.columns.forEach(column => {
    let width = 12;
    column.eachCell({ includeEmpty: false }, cell => {
      width = Math.max(width, Math.min(42, String(cell.value?.text || cell.value || '').length + 2));
    });
    column.width = width;
  });
}

function addTableSheet(wb, name, columns, data) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns.map(c => c.header));
  for (const item of data) ws.addRow(columns.map(c => c.value(item)));
  styleWorksheet(ws);
  columns.forEach((c, idx) => {
    const col = ws.getColumn(idx + 1);
    if (c.numFmt) col.numFmt = c.numFmt;
    if (c.hyperlink) {
      for (let r = 2; r <= ws.rowCount; r++) {
        const raw = data[r - 2]?.[c.hyperlink];
        if (raw) ws.getCell(r, idx + 1).value = { text: c.linkText ? c.linkText(data[r - 2]) : String(raw), hyperlink: String(raw) };
      }
    }
  });
  return ws;
}

export async function POST(req) {
  const body = await req.json();
  const briefing = body.briefing || {};
  const rows = body.rows || [];
  const sources = body.sources || [];
  const checks = body.checks || [];
  const groups = body.groups || [];
  const official = body.official || [];
  const limitations = body.limitations || [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BPC Busca de Áreas';
  wb.created = new Date();
  wb.modified = new Date();

  const resumo = wb.addWorksheet('Resumo');
  const exact = rows.length ? rows.filter(r => r.geo_precisao === 'EXATO').length / rows.length : 0;
  const uniqueCount = rows.filter(r => r.dedup_status !== 'DUPLICADO').length;
  const summaryRows = [
    ['BPC Busca de Áreas — Inteligência Imobiliária', ''],
    ['Modo', briefing.mode || ''],
    ['Localização', briefing.location || ''],
    ['Orçamento', briefing.budget || ''],
    ['Tipos permitidos', briefing.types || ''],
    ['Data da exportação', new Date().toISOString()],
    ['Anúncios na base', rows.length],
    ['Imóveis únicos/canônicos', uniqueCount],
    ['Fontes documentadas', sources.length],
    ['Endereço EXATO', exact],
    ['Casos dedup prováveis', rows.filter(r => r.dedup_status === 'PROVAVEL').length],
    ['Metodologia', 'Dados de anúncio são declaratórios; fontes oficiais e documentos devem prevalecer em decisões de incorporação. Fatos, inferências e limitações permanecem separados.'],
    ['Limitações', limitations.join(' | ')],
  ];
  summaryRows.forEach(r => resumo.addRow(r));
  resumo.getColumn(1).width = 32; resumo.getColumn(2).width = 90;
  resumo.getCell('A1').font = { name: 'Arial', bold: true, size: 14, color: { argb: WHITE } };
  resumo.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  resumo.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  resumo.getCell('B10').numFmt = '0.0%';
  resumo.eachRow(row => row.eachCell(cell => { cell.font = { ...(cell.font || {}), name: 'Arial' }; cell.alignment = { vertical: 'top', wrapText: true }; }));

  addTableSheet(wb, 'Portais_Fontes', [
    { header: 'Fonte', value: x => x.name || '' },
    { header: 'Categoria', value: x => x.category || '' },
    { header: 'Domínio', value: x => x.domain || '' },
    { header: 'Status', value: x => x.status || '' },
    { header: 'Consulta', value: x => x.query || '' },
    { header: 'Qtd. resultados', value: x => x.result_count ?? x.count ?? 0 },
    { header: 'URL consulta', value: x => x.url_consulta || '', hyperlink: 'url_consulta', linkText: () => 'Abrir fonte' },
    { header: 'Data consulta', value: x => x.data_consulta || '' },
    { header: 'Bloqueio/limitação', value: x => x.notes || x.block_reason || '' },
  ], sources);

  const baseCols = [
    ['id_canonico','ID canônico'],['finalidade','Finalidade'],['tipo_imovel','Tipo'],['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro'],['cidade','Cidade'],['uf','UF'],['cep','CEP'],['latitude','Latitude'],['longitude','Longitude'],['geo_precisao','Geo precisão'],['sql_geosampa','SQL GeoSampa'],['quadra','Quadra'],['area_terreno_m2','Área terreno m²'],['area_construida_m2','Área construída m²'],['area_confirmada','Área confirmada'],['area_confirmada_fonte','Fonte área'],['testada_m','Testada m'],['dormitorios','Dormitórios'],['vagas','Vagas'],['preco','Preço'],['condominio','Condomínio'],['iptu','IPTU'],['preco_m2','Preço/m²'],['valor_total_ocupacao','Valor total ocupação'],['yield_indicador','Yield/indicador'],['zoneamento','Zoneamento'],['ca_basico','CA básico'],['ca_max','CA máximo'],['contiguidade_status','Contiguidade'],['portal','Portal'],['codigo','Código'],['origens','Origens'],['foto_hash','Foto hash'],['dedup_status','Dedup'],['status_anuncio','Status anúncio'],['flag_desatualizado','Desatualizado'],['data_publicacao','Data publicação'],['data_consulta','Data consulta'],['anunciante','Anunciante'],['creci','CRECI'],['confidence_score','Confiança'],['anti_fake_score','Anti-fake'],['observacao','Observação']
  ];
  const baseColumns = baseCols.map(([key, header]) => ({ header, value: x => x[key] ?? '', numFmt: ['preco','condominio','iptu','preco_m2','valor_total_ocupacao'].includes(key) ? 'R$ #,##0.00' : undefined }));
  baseColumns.push({ header: 'Anúncio', value: x => x.url || '', hyperlink: 'url', linkText: () => 'Abrir anúncio' });
  baseColumns.push({ header: 'Google Maps', value: x => x.link_maps || '', hyperlink: 'link_maps', linkText: () => 'Abrir mapa' });
  addTableSheet(wb, 'Base_de_Imoveis', baseColumns, rows);

  if (briefing.mode === 'A') {
    addTableSheet(wb, 'Areas_Montadas', [
      { header: 'Grupo', value: x => x.name || x.group_id || '' },
      { header: 'Imóveis', value: x => x.quantity || x.quantidade_imoveis || 0 },
      { header: 'Área total m²', value: x => x.area_total_m2 || 0 },
      { header: 'Preço total', value: x => x.preco_total || 0, numFmt: 'R$ #,##0.00' },
      { header: 'Testada total m', value: x => x.testada_total_m || 0 },
      { header: 'Excedente/déficit m²', value: x => x.excedente_deficit_m2 || 0 },
      { header: 'Contiguidade', value: x => x.contiguidade_status || '' },
      { header: 'Confiança', value: x => x.confidence_score || 0 },
      { header: 'Evidência', value: x => x.evidence_notes || '' },
    ], groups);
    addTableSheet(wb, 'Potencial', [
      { header: 'ID', value: x => x.id_canonico || '' },
      { header: 'Endereço', value: x => [x.logradouro, x.numero, x.bairro].filter(Boolean).join(', ') },
      { header: 'At m²', value: x => x.metrics?.At || 0 },
      { header: 'CA máx', value: x => x.metrics?.ca_max || x.ca_max || 0 },
      { header: 'AC m²', value: x => x.metrics?.AC || 0 },
      { header: 'Eficiência', value: x => x.metrics?.eficiencia || 0, numFmt: '0.0%' },
      { header: 'APV m²', value: x => x.metrics?.APV || 0 },
      { header: 'OODC', value: x => x.metrics?.OODC || 0, numFmt: 'R$ #,##0.00' },
      { header: 'VGV', value: x => x.metrics?.VGV || 0, numFmt: 'R$ #,##0.00' },
      { header: 'R$/m² potencial', value: x => x.metrics?.preco_potencial_m2 || 0, numFmt: 'R$ #,##0.00' },
      { header: '% terreno+outorga/VGV', value: x => x.metrics?.custo_terreno_outorga_vgv || 0, numFmt: '0.0%' },
      { header: 'Fonte CA/zoneamento', value: x => x.zoneamento_fonte || '' },
    ], rows);
  } else {
    addTableSheet(wb, 'Comparativo_Renda', [
      { header: 'ID', value: x => x.id_canonico || '' },
      { header: 'Endereço', value: x => [x.logradouro, x.numero, x.bairro].filter(Boolean).join(', ') },
      { header: 'Preço', value: x => x.preco || 0, numFmt: 'R$ #,##0.00' },
      { header: 'Aluguel mensal', value: x => x.metrics?.aluguel_mensal || x.aluguel || 0, numFmt: 'R$ #,##0.00' },
      { header: 'Yield bruto', value: x => x.metrics?.yield_bruto || 0, numFmt: '0.00%' },
      { header: 'NOI', value: x => x.metrics?.NOI || 0, numFmt: 'R$ #,##0.00' },
      { header: 'Cap rate líquido', value: x => x.metrics?.cap_rate_liquido || 0, numFmt: '0.00%' },
      { header: 'Payback anos', value: x => x.metrics?.payback_anos || '' },
      { header: 'Valor total ocupação', value: x => x.metrics?.valor_total_ocupacao || 0, numFmt: 'R$ #,##0.00' },
    ], rows);
  }

  addTableSheet(wb, 'Fontes_Oficiais', [
    { header: 'Fonte', value: x => x.source || '' },
    { header: 'Status', value: x => x.status || '' },
    { header: 'Aplicação', value: x => x.applies_to || '' },
    { header: 'Achado', value: x => x.finding || '' },
    { header: 'Confiança', value: x => x.confidence || '' },
    { header: 'URL', value: x => x.url || '', hyperlink: 'url', linkText: () => 'Abrir fonte oficial' },
  ], official);

  const verify = wb.addWorksheet('Verificacao');
  verify.addRow(['Item', 'Status', 'Evidência/observação']);
  for (const check of checks) {
    const name = Array.isArray(check) ? check[0] : check.name;
    const ok = Array.isArray(check) ? !!check[1] : !!check.ok;
    const note = Array.isArray(check) ? (check[2] || '') : (check.note || '');
    const row = verify.addRow([name, ok ? 'OK' : 'PENDENTE', note]);
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ok ? GREEN : YELLOW } };
  }
  styleWorksheet(verify);

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${sanitizeName(briefing.location || briefing.bairro || 'estudo')}_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`;
  return new Response(buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

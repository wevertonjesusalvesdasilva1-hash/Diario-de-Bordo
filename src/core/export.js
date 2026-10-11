// Output formats for the plant's "CONTROLE DE PARADA DE MÁQUINAS (RAW)" workbook.
import * as XLSX from 'xlsx';
import { fmtDur } from './analysis.js';

const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

// Columns B:P of the PRODUÇÃO sheet (COD in column A is a formula in the workbook).
export const PROD_HEAD = ['ROBÔ', 'DATA', 'PEÇA', 'MODELO', 'CHAPA', 'INÍCIO', 'FIM', 'CHAPA2', 'INICIO', 'FIM ', 'CHAPA3', 'INCIO', 'FIM 2', 'TURNO QUE FINALIZOU', 'OBSERVAÇÕES '];
export const STOP_HEAD = ['ROBÔ', 'DATA', 'CHAPA', 'INICIO ', 'FINAL ', 'TURNO', 'MOTIVO DA PARADA', 'DESCRIÇÃO DA PARADA'];

export function prodValues(machine, r) {
  return [machine, r.data, r.peca, r.modelo, r.chapa1, r.ini1, r.fim1, r.chapa2, r.ini2, r.fim2, r.chapa3, r.ini3, r.fim3, r.turno, r.obs];
}
export function stopValues(machine, r) {
  return [machine, r.data, r.chapa, r.ini, r.fim, r.turno, r.motivo, r.desc];
}

// pages: [{ machine, prod:[], stops:[] }] already filtered to the ones to include.
export function allRows(pages) {
  const prod = [], stops = [];
  for (const p of pages) {
    for (const r of p.prod) prod.push(prodValues(p.machine, r));
    for (const r of p.stops) stops.push(stopValues(p.machine, r));
  }
  return { prod, stops };
}

// Plain text for pasting straight under the table in Excel (no header row).
export function toTSV(rows) {
  return rows.map((r) => r.map(clean).join('\t')).join('\n');
}

const parseDate = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '');
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
};
const parseTime = (s) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s ?? '');
  return m ? (+m[1] * 60 + +m[2]) / 1440 : null;
};
const num = (s) => (/^\d+$/.test(s ?? '') ? Number(s) : s || null);

function cell(v, type) {
  if (v === '' || v == null) return null;
  if (type === 'date') { const d = parseDate(v); return d ? { t: 'd', v: d, z: 'dd/mm/yyyy' } : { t: 's', v }; }
  if (type === 'time') { const t = parseTime(v); return t == null ? { t: 's', v } : { t: 'n', v: t, z: 'hh:mm' }; }
  if (type === 'num') { const n = num(v); return typeof n === 'number' ? { t: 'n', v: n } : { t: 's', v: String(v) }; }
  return { t: 's', v: String(v) };
}

const PROD_TYPES = ['s', 'date', 's', 's', 'num', 'time', 'time', 'num', 'time', 'time', 'num', 'time', 'time', 'num', 's'];
const STOP_TYPES = ['s', 'date', 'num', 'time', 'time', 'num', 's', 's'];

// Builds the workbook with the same sheets/columns as the plant's spreadsheet.
export function buildWorkbook(pages, analysis = null) {
  const { prod, stops } = allRows(pages);

  const ws1 = {};
  const set = (ws, r, c, v) => { if (v) ws[XLSX.utils.encode_cell({ r, c })] = v; };
  const heads1 = ['COD', ...PROD_HEAD, '1ºTURNO', '2ºTURNO', '3ºTURNO', 'TEMPO/DEC'];
  set(ws1, 0, 5, { t: 's', v: '1ºTURNO' }); set(ws1, 0, 8, { t: 's', v: '2ºTURNO/RETORNO' }); set(ws1, 0, 11, { t: 's', v: '3ºTURNO/RETORNO' });
  heads1.forEach((h, c) => set(ws1, 1, c, { t: 's', v: h }));
  prod.forEach((vals, i) => {
    const r = i + 2, n = r + 1;
    set(ws1, r, 0, { t: 's', f: `CONCATENATE(B${n}&D${n}&E${n})`, v: `${vals[0]}${vals[2]}${vals[3]}` });
    vals.forEach((v, c) => set(ws1, r, c + 1, cell(v, PROD_TYPES[c])));
    set(ws1, r, 16, { t: 'n', f: `IFERROR(MOD(H${n}-G${n},1),"")`, z: 'hh:mm' });
    set(ws1, r, 17, { t: 'n', f: `IFERROR(MOD(K${n}-J${n},1),0)`, z: 'hh:mm' });
    set(ws1, r, 18, { t: 'n', f: `IFERROR(MOD(N${n}-M${n},1),0)`, z: 'hh:mm' });
    set(ws1, r, 19, { t: 'n', f: `((Q${n}+R${n}+S${n})*24)`, z: '0.00' });
  });
  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(prod.length + 1, 1), c: 19 } });
  ws1['!cols'] = [18, 8, 11, 18, 16, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 30, 10, 10, 10, 10].map((wch) => ({ wch }));

  const ws2 = {};
  const heads2 = ['', ...STOP_HEAD, 'TTL', 'TEMPO/DEC'];
  heads2.forEach((h, c) => set(ws2, 0, c, h ? { t: 's', v: h } : null));
  stops.forEach((vals, i) => {
    const r = i + 1, n = r + 1;
    vals.forEach((v, c) => set(ws2, r, c + 1, cell(v, STOP_TYPES[c])));
    set(ws2, r, 9, { t: 'n', f: `MOD(F${n}-E${n},1)`, z: 'hh:mm' });
    set(ws2, r, 10, { t: 'n', f: `J${n}*24`, z: '0.00' });
  });
  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(stops.length, 1), c: 10 } });
  ws2['!cols'] = [4, 8, 11, 8, 8, 8, 7, 18, 30, 8, 10].map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'PRODUÇÃO');
  XLSX.utils.book_append_sheet(wb, ws2, 'PARADAS');
  if (analysis) XLSX.utils.book_append_sheet(wb, analysisSheet(analysis), 'ANÁLISE');
  return wb;
}

export function workbookBytes(pages, analysis = null) {
  return XLSX.write(buildWorkbook(pages, analysis), { type: 'array', bookType: 'xlsx', cellDates: true });
}

// Separate sheet: nothing here is meant to be pasted into the base. Only added after the person's OK.
export function analysisSheet(a) {
  const rows = [];
  const add = (...r) => rows.push(r);
  const blank = () => rows.push([]);
  add('ANÁLISE DA LEITURA (feita após a conferência)');
  add(`Gerada em ${new Date(a.generatedAt).toLocaleString('pt-BR')} · ${a.sheets} folha(s)`);
  add(`Produzindo ${fmtDur(a.totals.prodMin)} · Parado ${fmtDur(a.totals.stopMin)} (${a.totals.pctStop} %) · Alertas: ${a.totals.alta} altos, ${a.totals.media} médios, ${a.totals.info} informativos${a.totals.fecham != null ? ` · Horários que fecham: ${a.totals.fecham} %` : ''}`);
  blank();
  const points = [...(a.ai ?? []).map((p) => ['IA', p]), ...a.machines.flatMap((m) => m.bullets.map((b) => [m.name, b]))];
  add('PONTOS IMPORTANTES'); add('Origem', 'Ponto');
  for (const [o, t] of points) add(o === 'IA' ? 'Resumo da IA' : o, t);
  blank();
  add('RESUMO POR MÁQUINA');
  add('Máquina', 'Datas', 'Produzindo', 'Parado', '% parado', 'Paradas', 'Horários que fecham', 'Sobreposições', 'Intervalos sem registro');
  for (const m of a.machines) add(m.name, m.dates.map((d) => d.slice(0, 5)).join(', '), fmtDur(m.prodMin), fmtDur(m.stopMin), m.pctStop / 100, m.stops, m.transitions.total ? `${m.transitions.ok} de ${m.transitions.total}` : '', m.transitions.overlaps, m.transitions.gaps);
  const pctRows = rows.length - a.machines.length;
  blank();
  add('PARADAS POR MOTIVO');
  add('Máquina', 'Motivo', 'Tempo', 'Quantidade', '% das paradas');
  const motivoStart = rows.length;
  for (const m of a.machines) for (const x of m.motivos) add(m.name, x.motivo, fmtDur(x.min), x.count, m.stopMin ? x.min / m.stopMin : 0);
  const motivoEnd = rows.length;
  blank();
  add('PRODUÇÃO × TEMPO PADRÃO');
  add('Máquina', 'Peça', 'Modelo', 'Linhas', 'Real (h)', 'Padrão (h)', '% do padrão');
  const stdStart = rows.length;
  for (const m of a.machines) for (const g of m.standards) add(m.name, g.peca, g.modelo, g.rows, Math.round(g.realH * 100) / 100, g.ratio != null ? Math.round(g.stdH * 100) / 100 : 'sem padrão', g.ratio != null ? g.ratio : '');
  const stdEnd = rows.length;
  blank();
  add('ALERTAS PARA CONFERIR');
  add('Gravidade', 'Máquina', 'Folha', 'Linha', 'Tipo', 'Descrição');
  for (const i of a.issues) add(i.sev === 'alta' ? 'ALTA' : i.sev === 'media' ? 'média' : 'info', i.machine, i.label, i.linha || '', i.kind, i.text);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const pct = (r0, r1, col) => { for (let r = r0; r < r1; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: col })]; if (c && typeof c.v === 'number') c.z = '0%'; } };
  pct(pctRows, pctRows + a.machines.length, 4); pct(motivoStart, motivoEnd, 4); pct(stdStart, stdEnd, 6);
  ws['!cols'] = [18, 26, 16, 16, 14, 14, 20, 16, 22].map((wch) => ({ wch })).concat([{ wch: 90 }]);
  return ws;
}

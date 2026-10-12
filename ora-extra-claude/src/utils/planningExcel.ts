import { OvertimeRecord } from '../types';
import { argb, BRAND } from './brand';
import { buildRows, buildSummary, fixText, levelsLabel, needsTransport, SortLevel, transpLabel, turno } from './planning';

const BLACK = argb(BRAND.blue); // azul Komatsu (cabeçalhos)
const YELLOW = argb(BRAND.yellow);
const GRAY = argb(BRAND.yellowSoft); // destaque dos responsáveis

/** Gera .xlsx formatado (A3 paisagem, cabeçalho repetido, autofiltro). */
export async function exportPlanningExcel(opts: {
  recs: OvertimeRecord[];
  perDay: boolean;
  title: string;
  levels: SortLevel[];
  group: boolean;
  filterNote: string;
  fileName: string;
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hora Extra Claude';
  const sum = buildSummary(opts.recs);
  let logoId: number | null = null;
  try {
    const res = await fetch('/komatsu-logo-white.png');
    if (res.ok) logoId = wb.addImage({ buffer: await res.arrayBuffer(), extension: 'png' });
  } catch { /* sem logo, segue */ }

  const setup = (ws: import('exceljs').Worksheet, repeat?: string) => {
    ws.pageSetup = {
      paperSize: 8 as unknown as import('exceljs').PaperSize, // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: repeat,
      horizontalCentered: true,
    };
    ws.headerFooter.oddFooter = '&LHora Extra Claude&CPágina &P de &N&R&D';
  };
  const bar = (ws: import('exceljs').Worksheet, row: number, text: string, cols: number) => {
    ws.mergeCells(row, 1, row, cols);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
  };
  const border = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };

  // ---------- Resumo ----------
  const rs = wb.addWorksheet('Resumo');
  setup(rs);
  rs.columns = [{ width: 38 }, { width: 12 }, { width: 4 }, { width: 38 }, { width: 12 }, { width: 4 }, { width: 38 }, { width: 12 }];
  rs.mergeCells('A1:H1');
  rs.getCell('A1').value = 'PLANEJAMENTO DE HORA EXTRA';
  rs.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  rs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
  rs.getRow(1).height = 40;
  if (logoId !== null) rs.addImage(logoId, { tl: { col: 6.3, row: 0.1 }, ext: { width: 175, height: 36 } });
  rs.properties.tabColor = { argb: YELLOW };
  rs.mergeCells('A2:H2');
  rs.getCell('A2').value = `${opts.title} · ${sum.locais.join(' / ')} · Gestor: ${sum.gestores.join(' / ')}`;
  rs.getCell('A2').font = { size: 11, bold: true, color: { argb: BLACK } };
  rs.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  rs.mergeCells('A3:H3');
  rs.getCell('A3').value = `Total: ${sum.total} colaboradores · ${sum.aprovados} aprovados${opts.filterNote ? ' · Filtros: ' + opts.filterNote : ''}`;

  const block = (col: number, top: number, title: string, rows: (string | number)[][]) => {
    rs.mergeCells(top, col, top, col + 1);
    const t = rs.getCell(top, col);
    t.value = title;
    t.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
    t.border = { bottom: { style: 'medium', color: { argb: YELLOW } } };
    rows.forEach((r, i) => {
      const a = rs.getCell(top + 1 + i, col);
      const b = rs.getCell(top + 1 + i, col + 1);
      a.value = r[0]; b.value = r[1];
      a.border = border; b.border = border;
      b.alignment = { horizontal: 'right' }; b.font = { bold: true };
    });
    return top + rows.length + 2;
  };
  let r1 = 5, r2 = 5;
  if (sum.byDia.length > 1) r1 = block(1, r1, 'POR DIA', sum.byDia.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'POR TURNO', sum.byTurno.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'POR CENTRO DE CUSTO', sum.byCc.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'TRANSPORTE', [['Com transporte', sum.comTransp], ['Sem (outros meios)', sum.semTransp]]);
  r1 = block(1, r1, 'REFEIÇÃO', sum.byRef.map(([k, v]) => [k, v]));
  r2 = block(4, r2, 'POR LÍDER / CONTRAMESTRE', sum.byLider.map(([k, v]) => [k, v]));
  r2 = block(4, r2, 'LÍDERES / RESPONSÁVEIS', sum.leaders.map((r) => [`${r.funcionario} (${r.chapa})`, r.cc]));
  r2 = block(4, r2, 'TRANSPORTE POR ROTA', sum.byRota.map(([k, v]) => [k, v]));

  // ---------- Lista nominal ----------
  const addList = (name: string, recs: OvertimeRecord[], showDate: boolean) => {
    const ws = wb.addWorksheet(name.slice(0, 31));
    const heads = ['Data', '#', 'Chapa', 'Funcionário', 'Peça / Atividade', 'CC', 'Líder', 'Turno', 'Transporte', 'Refeição', 'Aprovação'];
    ws.columns = heads.map((h) => ({ width: { Data: 12, '#': 5, Chapa: 9, Funcionário: 36, 'Peça / Atividade': 28, CC: 7, Líder: 22, Turno: 14, Transporte: 34, Refeição: 11, Aprovação: 11 }[h] ?? 12 }));
    ws.mergeCells(1, 1, 1, heads.length);
    ws.getCell(1, 1).alignment = { vertical: 'middle' };
    ws.getCell(1, 1).value = `LISTA NOMINAL — ${name} · classificada por ${levelsLabel(opts.levels)}${opts.group ? ' (agrupada)' : ''}${opts.filterNote ? ' · ' + opts.filterNote : ''}`;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: BLACK } };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    ws.properties.tabColor = { argb: BLACK };
    ws.getRow(1).height = 40;
    const hr = ws.getRow(3);
    heads.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
      c.border = { ...border, bottom: { style: 'medium', color: { argb: YELLOW } } };
    });
    let row = 4;
    buildRows(recs, opts.levels, opts.group).forEach((x) => {
      if (x.kind === 'group') {
        ws.mergeCells(row, 1, row, heads.length);
        const c = ws.getCell(row, 1);
        c.value = `${x.label}  —  ${x.n}`;
        c.font = { bold: true, color: { argb: BLACK } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.blueSoft) } };
      } else {
        const r = x.r;
        const vals = [r.data, x.idx, Number(r.chapa) || r.chapa, r.funcionario, r.motivoHe, r.cc, r.lider, turno(r), transpLabel(r), fixText(r.refeicao), r.aprovacao];
        vals.forEach((v, i) => {
          const c = ws.getCell(row, i + 1);
          c.value = v as string | number;
          c.border = border;
          if (x.r.motivoHe.trim().toLowerCase().startsWith('respons')) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; }
        });
        if (!needsTransport(r)) ws.getCell(row, heads.indexOf('Transporte') + 1).font = { italic: true, color: { argb: 'FF6B7280' } };
      }
      row++;
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: heads.length } };
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    setup(ws, '3:3');
  };
  addList('Lista', opts.recs, true);
  if (opts.perDay) {
    [...new Map(opts.recs.map((r) => [r.data, r.dataSortKey] as const))].sort((a, b) => a[1].localeCompare(b[1])).map(([d]) => d).forEach((d) => addList(d.replace(/\//g, '-'), opts.recs.filter((r) => r.data === d), false));
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.fileName}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

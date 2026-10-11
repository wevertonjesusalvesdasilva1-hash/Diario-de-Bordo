import { OvertimeRecord } from '../types';
import { buildRows, buildSummary, fixText, needsTransport, SortMode, SORT_LABELS, transpLabel, turno } from './planning';

const BLACK = 'FF000000';
const GRAY = 'FFE5E7EB';

/** Gera .xlsx formatado (A3 paisagem, cabeçalho repetido, autofiltro). */
export async function exportPlanningExcel(opts: {
  recs: OvertimeRecord[];
  perDay: boolean;
  title: string;
  sort: SortMode;
  group: boolean;
  filterNote: string;
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hora Extra Claude';
  const sum = buildSummary(opts.recs);

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
  rs.getCell('A1').font = { bold: true, size: 20 };
  rs.mergeCells('A2:H2');
  rs.getCell('A2').value = `${opts.title} · ${sum.locais.join(' / ')} · Gestor: ${sum.gestores.join(' / ')}`;
  rs.getCell('A2').font = { size: 11, bold: true };
  rs.mergeCells('A3:H3');
  rs.getCell('A3').value = `Total: ${sum.total} colaboradores · ${sum.aprovados} aprovados${opts.filterNote ? ' · Filtros: ' + opts.filterNote : ''}`;

  const block = (col: number, top: number, title: string, rows: (string | number)[][]) => {
    rs.mergeCells(top, col, top, col + 1);
    const t = rs.getCell(top, col);
    t.value = title;
    t.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
    rows.forEach((r, i) => {
      const a = rs.getCell(top + 1 + i, col);
      const b = rs.getCell(top + 1 + i, col + 1);
      a.value = r[0]; b.value = r[1];
      a.border = border; b.border = border;
      b.alignment = { horizontal: 'right' }; b.font = { bold: true };
    });
    return top + rows.length + 2;
  };
  let r1 = 5, r2 = 5, r3 = 5;
  if (sum.byDia.length > 1) r1 = block(1, r1, 'POR DIA', sum.byDia.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'POR TURNO', sum.byTurno.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'POR CENTRO DE CUSTO', sum.byCc.map(([k, v]) => [k, v]));
  r1 = block(1, r1, 'TRANSPORTE', [['Com transporte', sum.comTransp], ['Sem (outros meios)', sum.semTransp]]);
  r1 = block(1, r1, 'REFEIÇÃO', sum.byRef.map(([k, v]) => [k, v]));
  r2 = block(4, r2, 'POR LÍDER / CONTRAMESTRE', sum.byLider.map(([k, v]) => [k, v]));
  r2 = block(4, r2, 'LÍDERES / RESPONSÁVEIS', sum.leaders.map((r) => [`${r.funcionario} (${r.chapa})`, r.cc]));
  r2 = block(4, r2, 'TRANSPORTE POR ROTA', sum.byRota.map(([k, v]) => [k, v]));
  r3 = block(7, r3, 'QUANTIDADE POR PEÇA', sum.pieces.map((p) => [`${p.nome} (${[...p.cc].join('/')})`, p.people.length]));

  // ---------- Lista nominal ----------
  const addList = (name: string, recs: OvertimeRecord[], showDate: boolean) => {
    const ws = wb.addWorksheet(name.slice(0, 31));
    const heads = [...(showDate ? ['Data'] : []), '#', 'Chapa', 'Funcionário', 'Peça / Atividade', 'CC', 'Líder', 'Turno', 'Transporte', 'Refeição', 'Aprovação'];
    ws.columns = heads.map((h) => ({ width: { Data: 12, '#': 5, Chapa: 9, Funcionário: 36, 'Peça / Atividade': 28, CC: 7, Líder: 22, Turno: 14, Transporte: 34, Refeição: 11, Aprovação: 11 }[h] ?? 12 }));
    ws.mergeCells(1, 1, 1, heads.length);
    ws.getCell(1, 1).value = `LISTA NOMINAL — ${name} · ordenada: ${SORT_LABELS[opts.sort]}${opts.group ? ' (agrupada)' : ''}${opts.filterNote ? ' · ' + opts.filterNote : ''}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    const hr = ws.getRow(3);
    heads.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };
      c.border = border;
    });
    let row = 4;
    buildRows(recs, opts.sort, opts.group).forEach((x) => {
      if (x.kind === 'group') {
        ws.mergeCells(row, 1, row, heads.length);
        const c = ws.getCell(row, 1);
        c.value = `${x.label}  —  ${x.n}`;
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
      } else {
        const r = x.r;
        const vals = [...(showDate ? [r.data] : []), x.idx, Number(r.chapa) || r.chapa, r.funcionario, r.motivoHe, r.cc, r.lider, turno(r), transpLabel(r), fixText(r.refeicao), r.aprovacao];
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
    [...new Set(opts.recs.map((r) => r.data))].forEach((d) => addList(d.replace(/\//g, '-'), opts.recs.filter((r) => r.data === d), false));
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Planejamento_Hora_Extra_${opts.title.replace(/[^\w-]+/g, '_')}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

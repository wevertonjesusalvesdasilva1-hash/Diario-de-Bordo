import * as XLSX from 'xlsx';
import { normalizeOvertimeRecord } from '../data/realSampleData';
import {
  AbsentPieceAction,
  AttendanceStatus,
  OperationalStatus,
  OvertimeRecord,
  ProducedState,
} from '../types';

function normalizeHeaderKey(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function formatExcelDate(val: unknown): { display: string; sortKey: string } {
  if (val === null || val === undefined || val === '') {
    return { display: 'Sem Data', sortKey: '9999-99-99' };
  }

  if (val instanceof Date && !isNaN(val.getTime())) {
    const dd = String(val.getDate()).padStart(2, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const yyyy = String(val.getFullYear());
    return { display: `${dd}/${mm}/${yyyy}`, sortKey: `${yyyy}-${mm}-${dd}` };
  }

  if (typeof val === 'number' && val > 20000 && val < 90000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const yyyy = String(parsed.y);
      return { display: `${dd}/${mm}/${yyyy}`, sortKey: `${yyyy}-${mm}-${dd}` };
    }
  }

  const str = String(val).trim();
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (brMatch) {
    const dd = brMatch[1].padStart(2, '0');
    const mm = brMatch[2].padStart(2, '0');
    let yyyy = brMatch[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return { display: `${dd}/${mm}/${yyyy}`, sortKey: `${yyyy}-${mm}-${dd}` };
  }

  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return { display: `${dd}/${mm}/${yyyy}`, sortKey: `${yyyy}-${mm}-${dd}` };
  }

  return { display: str, sortKey: str };
}

export function formatExcelTime(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !isNaN(val.getTime())) {
    const hh = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
  }

  if (typeof val === 'number') {
    const fraction = val % 1;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const min = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${min}`;
  }

  const str = String(val).trim();
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  return str;
}

export function formatExcelDateTime(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !isNaN(val.getTime())) {
    const dd = String(val.getDate()).padStart(2, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const yyyy = val.getFullYear();
    const hh = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  if (typeof val === 'number' && val > 20000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const yyyy = parsed.y;
      const hh = String(parsed.H || 0).padStart(2, '0');
      const min = String(parsed.M || 0).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }
  }

  return String(val).trim();
}

export function getWeekdayLabel(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const dd = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) - 1;
  const yyyy = parseInt(parts[2], 10);
  const date = new Date(yyyy, mm, dd);
  if (isNaN(date.getTime())) return '';
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return weekdays[date.getDay()] || '';
}

export async function parseOvertimeExcel(file: File): Promise<OvertimeRecord[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Planilha vazia ou sem abas válidas.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  if (!rows || rows.length === 0) {
    throw new Error('Nenhum dado encontrado no arquivo Excel.');
  }

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const normalizedCells = row.map(normalizeHeaderKey);
    const hasChapa = normalizedCells.some(
      (c) => c === 'CHAPA' || c.includes('MATRICULA') || c.includes('REGISTRO')
    );
    const hasFuncionario = normalizedCells.some(
      (c) => c.includes('FUNCIONARIO') || c.includes('COLABORADOR') || c === 'NOME'
    );
    if (hasChapa || hasFuncionario) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = (rows[headerRowIndex] || []).map(normalizeHeaderKey);

  const findCol = (candidates: string[], fallbackIndex: number): number => {
    for (const cand of candidates) {
      const idx = headerRow.findIndex((h) => h === cand);
      if (idx !== -1) return idx;
    }
    for (const cand of candidates) {
      if (cand.length <= 3) continue; // siglas curtas (RE, DE, CC) só valem exatas
      const idx = headerRow.findIndex((h) => h.includes(cand));
      if (idx !== -1) return idx;
    }
    return fallbackIndex;
  };
  const hasHeader = (cands: string[]) => cands.some((c) => headerRow.includes(c) || (c.length > 3 && headerRow.some((h) => h.includes(c))));
  if (!hasHeader(['DATA']) || !hasHeader(['CHAPA', 'MATRICULA', 'RE']) || !hasHeader(['FUNCIONARIO', 'NOME', 'COLABORADOR'])) {
    throw new Error('Planilha sem as colunas obrigatórias DATA, CHAPA e FUNCIONÁRIO. Confira o cabeçalho.');
  }

  const idxData = findCol(['DATA'], 0);
  const idxChapa = findCol(['CHAPA', 'MATRICULA', 'RE'], 1);
  const idxFuncionario = findCol(['FUNCIONARIO', 'NOME', 'COLABORADOR'], 2);
  const idxMotivo = findCol(['MOTIVO', 'PECA', 'ATIVIDADE'], 3);
  const idxCc = findCol(['CC', 'CENTRO DE CUSTO'], 4);
  const idxLocal = findCol(['LOCAL', 'UNIDADE', 'PLANTA'], 5);
  const idxGestor = findCol(['GESTOR', 'LIDER', 'SUPERVISOR'], 6);
  const idxDe = findCol(['DE', 'INICIO', 'ENTRADA'], 7);
  const idxAte = findCol(['ATE', 'FIM', 'SAIDA'], 8);
  const idxTransporte = findCol(['TRANSPORTE', 'ROTA', 'FRETADO'], 9);
  const idxRefeicao = findCol(['REFEICAO', 'LANCHE'], 10);
  const idxSolicitacao = findCol(['SOLICITACAO', 'DATA SOLICITACAO'], 11);
  const idxAprovacao = findCol(['APROVACAO', 'STATUS APROVACAO'], 12);
  const idxDataApv = findCol(['DATA APV', 'DATA APROVACAO'], 13);

  const records: OvertimeRecord[] = [];
  const seenRows = new Set<string>();
  const idCount = new Map<string, number>();
  const slug = (v: string) =>
    normalizeHeaderKey(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rawFuncionario = String(row[idxFuncionario] ?? '').trim();
    const rawChapa = String(row[idxChapa] ?? '').trim();
    if (!rawFuncionario && !rawChapa) continue;

    if (
      normalizeHeaderKey(rawFuncionario) === 'FUNCIONARIO' &&
      normalizeHeaderKey(rawChapa) === 'CHAPA'
    ) {
      continue;
    }

    const { display: dataDisplay, sortKey: dataSortKey } = formatExcelDate(row[idxData]);

    // linha repetida na planilha (mesmo dia, chapa, peça e horário) -> conta uma vez só
    const motivoTxt = String(row[idxMotivo] ?? '').trim() || 'Peça não informada';
    const deTxt = formatExcelTime(row[idxDe]);
    const ateTxt = formatExcelTime(row[idxAte]);
    const rowKey = `${dataSortKey}|${rawChapa}|${slug(motivoTxt)}|${deTxt}|${ateTxt}`;
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);
    // id estável: NÃO depende do número da linha, então reimportar o mesmo dado não duplica
    const baseId = `rec-${dataSortKey}-${rawChapa}-${slug(motivoTxt)}`;
    const nth = (idCount.get(baseId) ?? 0) + 1;
    idCount.set(baseId, nth);
    const stableId = nth === 1 ? baseId : `${baseId}-${nth}`;

    records.push(
      normalizeOvertimeRecord(
        {
          id: stableId,
          data: dataDisplay,
          dataSortKey,
          chapa: rawChapa,
          funcionario: rawFuncionario,
          motivoHe: String(row[idxMotivo] ?? '').trim() || 'Peça não informada',
          cc: String(row[idxCc] ?? '').trim(),
          local: String(row[idxLocal] ?? '').trim(),
          gestor: String(row[idxGestor] ?? '').trim(),
          de: formatExcelTime(row[idxDe]),
          ate: formatExcelTime(row[idxAte]),
          transporte: String(row[idxTransporte] ?? '').trim(),
          refeicao: String(row[idxRefeicao] ?? '').trim(),
          solicitacao: formatExcelDateTime(row[idxSolicitacao]),
          aprovacao: String(row[idxAprovacao] ?? '').trim(),
          dataApv: formatExcelDateTime(row[idxDataApv]),
        },
        r
      )
    );
  }

  if (records.length === 0) {
    throw new Error('Nenhum colaborador ou peça encontrado na planilha enviada.');
  }

  return records;
}

export function exportOvertimeExcel(
  records: OvertimeRecord[],
  selectedDate: string | 'ALL',
  baseFileName = 'HoraExtra_Relatorio_Producao'
): void {
  const filtered =
    selectedDate === 'ALL' ? records : records.filter((r) => r.data === selectedDate);

  const exportRows = filtered.map((r) => {
    const timelineStr = r.timeline.map((ev) => `[${ev.time}] ${ev.description}`).join(' | ');
    return {
      DATA: r.data,
      CHAPA: r.chapa,
      'FUNCIONÁRIO': r.funcionario,
      'LÍDER': r.lider || 'Não identificado',
      'PEÇA / MOTIVO HE': r.motivoHe,
      CC: r.cc,
      LOCAL: r.local,
      GESTOR: r.gestor,
      'INÍCIO PLANEJADO': r.de,
      'FIM PLANEJADO': r.ate,
      'PRESENÇA': r.status,
      'STATUS OPERACIONAL': r.operationalStatus,
      'MOTIVO FALTA': r.motivoFalta || '',
      'SAÍDA ANTECIPADA':
        r.operationalStatus === OperationalStatus.SaiuMaisCedo
          ? `${r.horaEntradaReal || r.de} às ${r.horaSaidaReal} (${r.motivoSaidaAntecipada})`
          : '',
      'MOTIVO PARADA ATUAL': r.motivoParadaAtual || '',
      'PEÇA CONCLUÍDA': r.producedState,
      'QTD PLANEJADA': r.qtyPlanned,
      'QTD REALIZADA': r.qtyActual,
      'ATRASO / PARADA (MIN)': r.delayMinutes || 0,
      'AÇÃO NA PEÇA (FALTA/SAÍDA)': r.absentPieceAction || '',
      'REALOCADO PARA': r.reallocatedToWelder || '',
      'JUSTIFICATIVA': r.productionJustification || '',
      'LINHA DO TEMPO DO TURNO': timelineStr,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 32 },
    { wch: 24 },
    { wch: 8 },
    { wch: 12 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 30 },
    { wch: 26 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 24 },
    { wch: 28 },
    { wch: 36 },
    { wch: 60 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Apontamento_Turno');

  const safeDateSuffix =
    selectedDate === 'ALL' ? 'Fim_De_Semana_Consolidado' : selectedDate.replace(/\//g, '-');
  XLSX.writeFile(workbook, `${baseFileName}_${safeDateSuffix}.xlsx`);
}

export function downloadRawInputTemplate(records: OvertimeRecord[]): void {
  const inputRows = records.map((r) => ({
    DATA: r.data,
    CHAPA: r.chapa,
    'FUNCIONÁRIO': r.funcionario,
    MOTIVO: r.motivoHe,
    CC: r.cc,
    LOCAL: r.local,
    GESTOR: r.gestor,
    DE: r.de,
    'ATÉ': r.ate,
    TRANSPORTE: r.transporte,
    'REFEIÇÃO': r.refeicao,
    'SOLICITAÇÃO': r.solicitacao,
    'APROVAÇÃO': r.aprovacao,
    'DATA APV': r.dataApv,
  }));

  const worksheet = XLSX.utils.json_to_sheet(inputRows);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 34 },
    { wch: 24 },
    { wch: 8 },
    { wch: 12 },
    { wch: 26 },
    { wch: 8 },
    { wch: 8 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'HoraExtra');
  XLSX.writeFile(workbook, 'Planilha_Modelo_HoraExtra.xlsx');
}

export enum AttendanceStatus {
  Pendente = 'Pendente',
  Presente = 'Presente',
  Ausente = 'Ausente',
}

export enum OperationalStatus {
  Aguardando = 'Aguardando início',
  Soldando = 'Soldando',
  Parado = 'Parado',
  SaiuMaisCedo = 'Saiu mais cedo',
  Finalizou = 'Finalizou a peça',
  Ausente = 'Ausente',
}

export enum ProducedState {
  NaoIniciado = 'Não iniciado',
  Sim = 'Sim',
  Parcial = 'Parcial',
  Nao = 'Não',
}

export enum AbsentPieceAction {
  Nenhum = '',
  AlocarOutro = 'Alocar outro soldador',
  ProcessoParado = 'Processo parado',
  NaoRealizar = 'Não realizar a peça',
}

export interface TimelineEvent {
  id: string;
  time: string; // HH:mm
  description: string;
  type?: 'entry' | 'stop' | 'resume' | 'finish' | 'early_exit' | 'absence' | 'reallocation' | 'note';
}

export interface OvertimeRecord {
  id: string;
  data: string; // DD/MM/YYYY
  dataSortKey: string; // YYYY-MM-DD
  chapa: string;
  funcionario: string;
  motivoHe: string; // Nome da peça / atividade planejada
  cc: string;
  local: string;
  gestor: string;
  lider: string; // Líder direto identificado pela Base Geral de Colaboradores por Líder
  de: string; // Horário de início planejado
  ate: string; // Horário de fim planejado
  transporte: string;
  refeicao: string;
  solicitacao: string;
  aprovacao: string;
  dataApv: string;

  // 1. Presença no Turno
  status: AttendanceStatus;
  motivoFalta: string;

  // 2. Status Operacional & Parada / Saída Antecipada
  operationalStatus: OperationalStatus;
  motivoParadaAtual: string;
  horaEntradaReal: string;
  horaSaidaReal: string;
  motivoSaidaAntecipada: string;

  // 3. Resultado da Peça / Produção
  producedState: ProducedState;
  qtyPlanned: number;
  qtyActual: number;
  delayMinutes: number;
  productionJustification: string;

  // 4. Destino da peça quando o soldador faltou ou saiu mais cedo
  absentPieceAction: AbsentPieceAction;
  reallocatedToWelder: string;
  reallocatedToChapa?: string;
  reallocatedAtTime?: string;

  // 5. Vínculo reverso quando ESTE soldador precisou deixar sua própria peça para cobrir a peça prioritária de outro colaborador
  coveringForEmployee?: string;
  coveringForChapa?: string;
  coveringForPiece?: string;
  coveringSinceTime?: string;
  coveringReason?: string;
  coveredPieceDelivered?: boolean;

  // 6. Linha do Tempo Cronológica do Turno
  timeline: TimelineEvent[];
}

export interface ShiftGroup {
  data: string;
  dataSortKey: string;
  weekdayLabel: string;
  total: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
  locals: string[];
}

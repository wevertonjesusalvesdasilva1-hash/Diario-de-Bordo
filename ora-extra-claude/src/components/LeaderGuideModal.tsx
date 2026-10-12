import React from 'react';
import {
  CheckCircle2,
  Clock,
  DoorOpen,
  HelpCircle,
  PauseCircle,
  Play,
  UserX,
  X,
} from 'lucide-react';

interface LeaderGuideModalProps {
  isOpen: boolean;
  hideOnStartup: boolean;
  onToggleHideOnStartup: (hide: boolean) => void;
  onClose: () => void;
  onTryAirtonExample: () => void;
}

export const LeaderGuideModal: React.FC<LeaderGuideModalProps> = ({
  isOpen,
  hideOnStartup,
  onToggleHideOnStartup,
  onClose,
  onTryAirtonExample,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 sm:p-6 pb-safe shadow-2xl space-y-4 text-slate-100"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Guia Rápido de Uso no Turno
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 shrink-0" />
              <span>1. Apontar Paradas na Linha Vertical do Turno</span>
            </div>
            <p className="text-xs text-slate-300">
              Toque no nome do colaborador para abrir a linha vertical do horário de início ao fim do turno. Toque em qualquer horário para registrar <strong>Parada de Produção</strong> (ex: Ponte rolante ocupada), <strong>Retomada</strong> ou <strong>Peça Finalizada</strong>.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="font-bold text-orange-400 flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 shrink-0" />
              <span>2. Colaborador Saiu Mais Cedo (Ex: 06:00 às 10:00)</span>
            </div>
            <p className="text-xs text-slate-300">
              Na linha vertical do colaborador, toque no horário em que ele saiu (ex: <code>10:00</code>), escolha <strong>Saiu mais cedo</strong>, informe o motivo e defina o destino da peça.
            </p>
            <button
              type="button"
              onClick={onTryAirtonExample}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Testar Exemplo (Airton 06:00 às 10:00)</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 space-y-1.5">
            <div className="font-bold text-rose-400 flex items-center gap-1.5">
              <UserX className="w-4 h-4 shrink-0" />
              <span>3. Colaborador Faltou ao Turno</span>
            </div>
            <p className="text-xs text-slate-300">
              Marque <strong>Faltou o turno todo</strong>, escolha o motivo da falta e indique se a peça foi realocada para outro soldador ou se o processo ficou parado.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <span />

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Entendi, fechar guia</span>
          </button>
        </div>
      </div>
    </div>
  );
};

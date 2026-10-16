import React from 'react';
import { CheckCircle2, HelpCircle, X } from 'lucide-react';

interface LeaderGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS: { title: string; text: string }[] = [
  { title: 'Abrir o link', text: 'Abra o link que o gestor mandou no celular. Não precisa de senha.' },
  { title: 'Escolher o dia', text: 'Toque no botão do dia, no alto da tela, e escolha a data do turno.' },
  { title: 'Escolher seu nome', text: 'Toque em "Selecionar Líder" e escolha o seu nome. Só a sua equipe aparece.' },
  { title: 'Marcar presença', text: 'Toque no botão redondo do cartão. Um toque marca Presente, outro toque marca Ausente. Se errar, toque "Desfazer".' },
  { title: 'Registrar parada ou saída antecipada', text: 'Toque no nome da pessoa. Toque no horário e escolha: Parada, Retomada, Peça finalizada ou Saiu mais cedo.' },
  { title: 'Ver o dia no Planejamento ou PDF', text: 'Abra a aba Planejamento para ver o dia inteiro. Lá você também imprime ou baixa o PDF.' },
];

export const LeaderGuideModal: React.FC<LeaderGuideModalProps> = ({ isOpen, onClose }) => {
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
            <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />
            <h2 className="text-lg font-bold text-white">Como usar no turno</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
              <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-slate-950 font-bold text-base flex items-center justify-center">
                {i + 1}
              </span>
              <div className="space-y-0.5">
                <div className="font-bold text-white text-base">{step.title}</div>
                <p className="text-sm text-slate-300">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-base font-bold flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>Entendi</span>
        </button>
      </div>
    </div>
  );
};

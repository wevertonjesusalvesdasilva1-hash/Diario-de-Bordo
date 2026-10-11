import React, { useMemo, useState } from 'react';
import { Check, Search, ShieldCheck, UserCheck, Users, X } from 'lucide-react';
import {
  COLLABORATOR_LEADER_DIRECTORY,
  matchesSelectedLeader,
  OFFICIAL_LEADERS,
  resolveCollaboratorLeader,
} from '../data/leaderDatabase';
import { OvertimeRecord } from '../types';

interface LeaderDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: OvertimeRecord[];
  selectedLeaderFilter: string;
  onSelectLeaderFilter: (leader: string) => void;
  leaderOverrides: Record<string, string>;
  onUpdateCollaboratorLeader: (chapa: string, nome: string, newLeader: string) => void;
}

const LEADER_OPTIONS_FOR_ASSIGNMENT = [
  'Alexandre',
  'Odonei',
  'Alexandre / Odonei',
  'Fábio',
  'Diego',
  'Fábio / Diego',
  'Luiz',
  'João',
  'Luiz / João',
  'Ronaldo',
  'Não identificado',
];

export const LeaderDirectoryModal: React.FC<LeaderDirectoryModalProps> = ({
  isOpen,
  onClose,
  records,
  selectedLeaderFilter,
  onSelectLeaderFilter,
  leaderOverrides,
  onUpdateCollaboratorLeader,
}) => {
  const [search, setSearch] = useState('');
  const [modalLeaderTab, setModalLeaderTab] = useState<string>('ALL');

  // Combine official directory with any extra names present in the currently imported Excel
  const combinedDirectory = useMemo(() => {
    const map = new Map<
      string,
      {
        chapa: string;
        nome: string;
        lider: string;
        inCurrentSpreadsheet: boolean;
      }
    >();

    COLLABORATOR_LEADER_DIRECTORY.forEach((entry) => {
      const resolved = resolveCollaboratorLeader(entry.chapa, entry.nome, leaderOverrides);
      map.set(`${entry.chapa}-${entry.nome}`, {
        chapa: entry.chapa,
        nome: entry.nome,
        lider: resolved,
        inCurrentSpreadsheet: false,
      });
    });

    records.forEach((rec) => {
      const existingKey = Array.from(map.keys()).find((k) => {
        const item = map.get(k)!;
        return (
          item.chapa === rec.chapa ||
          item.nome.toUpperCase() === rec.funcionario.toUpperCase()
        );
      });

      const resolved =
        rec.lider || resolveCollaboratorLeader(rec.chapa, rec.funcionario, leaderOverrides);

      if (existingKey) {
        const prev = map.get(existingKey)!;
        map.set(existingKey, {
          ...prev,
          lider: resolved,
          inCurrentSpreadsheet: true,
        });
      } else {
        map.set(`${rec.chapa}-${rec.funcionario}`, {
          chapa: rec.chapa,
          nome: rec.funcionario,
          lider: resolved,
          inCurrentSpreadsheet: true,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [records, leaderOverrides]);

  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combinedDirectory.filter((item) => {
      if (!matchesSelectedLeader(item.lider, modalLeaderTab)) return false;
      if (!q) return true;
      return (
        item.nome.toLowerCase().includes(q) ||
        item.chapa.toLowerCase().includes(q) ||
        item.lider.toLowerCase().includes(q)
      );
    });
  }, [combinedDirectory, modalLeaderTab, search]);

  const leaderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: combinedDirectory.length,
      'Não identificado': 0,
    };
    OFFICIAL_LEADERS.forEach((l) => {
      counts[l] = 0;
    });

    combinedDirectory.forEach((item) => {
      OFFICIAL_LEADERS.forEach((l) => {
        if (matchesSelectedLeader(item.lider, l)) {
          counts[l] = (counts[l] || 0) + 1;
        }
      });
      if (matchesSelectedLeader(item.lider, 'Não identificado')) {
        counts['Não identificado'] += 1;
      }
    });

    return counts;
  }, [combinedDirectory]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111726] w-full max-w-4xl max-h-[90dvh] rounded-t-3xl sm:rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0 bg-[#0B0F19]/80">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Relação Geral de Colaboradores por Líder (Base de Dados)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Toda planilha Excel importada cruza automaticamente Chapa e Nome com esta matriz para separar as equipes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 shrink-0"
          >
            <span>Fechar</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Leader Quick Filter Pills */}
        <div className="px-4 sm:px-5 pt-3.5 pb-2 border-b border-slate-800/80 bg-[#111726] shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Filtrar ou Ativar Equipe do Líder no Painel:
            </span>
            {selectedLeaderFilter !== 'ALL' && (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                Filtro ativo no app: {selectedLeaderFilter}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setModalLeaderTab('ALL');
                onSelectLeaderFilter('ALL');
              }}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                modalLeaderTab === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-900'
              }`}
            >
              <span>Todos</span>
              <span className="font-mono-tabular text-[11px] opacity-80">
                ({leaderCounts.ALL})
              </span>
            </button>

            {OFFICIAL_LEADERS.map((leader) => {
              const isSelected = modalLeaderTab === leader;
              return (
                <button
                  key={leader}
                  type="button"
                  onClick={() => {
                    setModalLeaderTab(leader);
                    onSelectLeaderFilter(leader);
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-950 text-slate-200 border-slate-800 hover:bg-slate-900'
                  }`}
                >
                  <span>{leader}</span>
                  <span className="font-mono-tabular text-[11px] opacity-80">
                    ({leaderCounts[leader] || 0})
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setModalLeaderTab('Não identificado');
                onSelectLeaderFilter('Não identificado');
              }}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                modalLeaderTab === 'Não identificado'
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-950 text-amber-300 border-slate-800 hover:bg-slate-900'
              }`}
            >
              <span>Não identificado</span>
              <span className="font-mono-tabular text-[11px] opacity-80">
                ({leaderCounts['Não identificado'] || 0})
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar na relação geral por nome, chapa ou líder..."
              className="w-full min-h-[40px] pl-10 pr-9 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Alphabetical Table */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-5">
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/60">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3 sm:px-4 w-24">Chapa</th>
                  <th className="py-2.5 px-3 sm:px-4">Nome Completo do Colaborador</th>
                  <th className="py-2.5 px-3 sm:px-4 w-48 sm:w-56">Líder Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {filteredDirectory.map((item) => {
                  const isUnidentified =
                    !item.lider || item.lider.toLowerCase() === 'não identificado';
                  return (
                    <tr
                      key={`${item.chapa}-${item.nome}`}
                      className="hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="py-2.5 px-3 sm:px-4 font-mono-tabular font-bold text-cyan-400">
                        {item.chapa || '—'}
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 font-semibold text-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{item.nome}</span>
                          {item.inCurrentSpreadsheet && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Na escala atual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 sm:px-4">
                        <select
                          value={
                            LEADER_OPTIONS_FOR_ASSIGNMENT.includes(item.lider)
                              ? item.lider
                              : item.lider || 'Não identificado'
                          }
                          onChange={(e) =>
                            onUpdateCollaboratorLeader(item.chapa, item.nome, e.target.value)
                          }
                          aria-label={`Líder de ${item.nome}`}
                          className={`w-full min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-bold focus:outline-none focus:border-cyan-400 ${
                            isUnidentified
                              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                              : 'bg-slate-900 border-slate-700 text-emerald-300'
                          }`}
                        >
                          {!LEADER_OPTIONS_FOR_ASSIGNMENT.includes(item.lider) && (
                            <option value={item.lider}>{item.lider}</option>
                          )}
                          {LEADER_OPTIONS_FOR_ASSIGNMENT.map((opt) => (
                            <option key={opt} value={opt} className="bg-slate-900 text-slate-100">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-[#0B0F19] flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Exibindo <strong>{filteredDirectory.length}</strong> de{' '}
              <strong>{combinedDirectory.length}</strong> colaboradores cadastrados na base.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[40px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Concluir e Aplicar Filtro</span>
          </button>
        </div>
      </div>
    </div>
  );
};

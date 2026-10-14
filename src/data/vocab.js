// Valores já usados na planilha CONTROLE DE PARADA DE MÁQUINAS (RAW).
// O leitor usa estas listas para corrigir leituras duvidosas.
export const CHAPAS = ['11596', '7910', '11833', '10977', '11647', '11046', '12273', '10785', '11678', '11275', '10777'];

export const PECAS = [
  'VIGA BULLD', 'VIGA PC', 'LANÇA', 'CENTER FRAME', 'SUB BRACKET', 'BRACKET', 'S-CASE',
  'COLAR-CENTER FRAME', 'BOOM WA', '1° OP LANÇA', '2° OP LANÇA REFORÇO', 'ARTICULAÇÃO', 'FRAME TOP', 'LAMINA', 'ESTRUTURA', 'REFORÇO',
];

export const MODELOS = [
  'PC210-10M0', 'D61-24', 'D61', 'D61-23', 'PC210LC-10M0', 'PC360LC-8M2', 'WA200-6', 'D51-24',
  'PC500LC-10M0', 'PC130-10M0', 'PC130LC-10M0', 'PC240LC-8', 'D51', 'PC200-10M0', 'PC210F-10M0',
  'WA320-6', 'WA380-6', 'WA150', 'GD655-5', 'PC220F-10M0', 'D61-24/23', 'D51-22', 'PC160LC-8',
  'PC220F', 'WA320-8M0', 'PC200F-8', 'GD535', 'PC200F-8M0', 'PC210FLC-10M0',
];

// Motivos exatamente como na aba ITENS (na ordem das colunas do formulário).
export const MOTIVOS = [
  'MECÂNICA', 'ELÉTRICA', 'PREVENTIVA', 'AGUARD. PEÇA', 'PONTE ROLANTE',
  'CONSUMIVEIS', 'TROCA DE PEÇA', 'SET-UP', 'OUTROS', 'FALTA DE PEÇA',
];

// Turno de cada chapa, da aba REFERENCIAS da planilha de controle (DIURNO = 1, NOITE/NOTURNO = 2). Só números, sem nomes.
export const CHAPA_TURNO = { 11596: '2', 7910: '1', 11833: '1', 10977: '1', 11647: '1', 11046: '2', 12273: '1', 10785: '2', 11678: '2' };

// Motivo extra, fora das 10 colunas impressas (não tem X na folha): vem da palavra escrita na descrição.
export const MOTIVOS_EXTRA = ['TYOREI'];
export const MOTIVOS_ALL = [...MOTIVOS, ...MOTIVOS_EXTRA];

// Máquinas atendidas pelo app. RAW (solda robotizada) é marcada por bolinha na folha;
// as de usinagem vêm com o nome escrito/impresso no campo MÁQUINA.
export const MAQUINAS_RAW = ['RAW05', 'RAW06', 'RAW09', 'RAW10', 'RAW11', 'RAW12'];
export const MAQUINAS_USINAGEM = ['UMC 01', 'UMC 02', 'HMC-16', 'NCBZ'];
export const MAQUINAS = [...MAQUINAS_RAW, ...MAQUINAS_USINAGEM];

// Listas iniciais da usinagem (UMC 01, UMC 02, HMC 16, NCBZ), vistas nas folhas UMC. Edite na tela.
export const CHAPAS_USI = ['290049', '11997'];
export const PECAS_USI = ['MESA', 'ARTICULAÇÃO', 'LATERAL'];
export const MODELOS_USI = ['130', '150', 'D61', 'PC240', 'WA200'];

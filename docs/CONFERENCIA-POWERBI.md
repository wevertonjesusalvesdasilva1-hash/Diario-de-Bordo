# Conferência do app contra o Power BI e o Excel

O que foi conferido (e como repetir). Nenhum dado real vai para o repositório: os arquivos `.pbix` e `.xlsx` ficam na sua máquina, em `scripts/conferencia/arquivos/` (fora do Git).

## Método
1. **Power BI × app.** Lê as tabelas do `.pbix` (biblioteca `pbixray`), avalia as medidas do relatório **de forma independente** (pandas, seguindo o DAX e as relações Produção↔Paradas por data+máquina+chapa final) em milhares de combinações de filtros (cada robô, mês, dia, turno, motivo, peça, chapa final, seleções aleatórias de vários dias e máquinas) e compara com o motor do app (`src/core/bi.js`).
2. **Excel × app.** Lê as planilhas PRODUÇÃO e PARADAS direto do Excel (pandas) e compara, por máquina e dia, a quantidade de linhas, as horas e o tempo padrão com o que o app importa.

## Resultado (arquivos de 14/10/2026)
- **Medidas** (peças, horas produzidas, horas paradas, meta, disponibilidade, % ganho, tempo padrão): ~51.000 comparações em RAW, RAW (versão de 12/10) e usinagem, **0 divergências**. A única diferença apontada no teste é a soma de "Paradas_resumo" sem nenhum filtro, em que o teste independente assumia só as datas com produção; o Power BI soma todas.
- **Pareto** (horas, ranking, % acumulado): 1.780 barras, 0 divergências (empates de horas com ruído de ponto flutuante contam como empate).
- **Cores** (meta 88% / 79,2%, parada acima de 2,23 h, ganho): iguais às medidas do relatório.
- **Excel → app**: RAW 1.989 produções e 2.815 paradas, usinagem 469 e 548, mesmas linhas e horas por máquina e dia. Única diferença: RAW10 em 02/09/2026 (uma linha com TEMPO/DEC vazio no Excel: o Power BI conta 0 h, o app calcula 1,92 h pelos horários).
- **Telas do Power BI** (print de 12/10): Diária 25–29/09 (107 peças, 212,92 h, 89,32 h, 38,20%, e disponibilidade por robô) e Paradas RAW10 setembro (132 peças, 321,5 h, 69,22%) conferem; a parada de 83,2 h do print tem 0,2 h a menos que o arquivo salvo (uma parada sem motivo em 01/09).

## O que não é o Power BI
- "Horas entregues" e "eficiência" (tempo padrão × tempo real por robô) são cálculos do app, a pedido do supervisor; o Power BI tem só "% ganho".
- Linhas com tempo vazio, paradas com data futura e dias com mais de 24 h aparecem na auditoria; o app não corrige nada sozinho.

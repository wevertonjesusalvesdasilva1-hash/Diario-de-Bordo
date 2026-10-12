# Maple Tapping · Diário de Bordo

Lê a folha manuscrita **"DIÁRIO DE BORDO – PRODUÇÃO E PARADAS"** (PDF ou foto), entrega as linhas no formato da
planilha de controle de paradas (abas **PRODUÇÃO** e **PARADAS**) e mostra, em cards claros, onde a folha se contradiz,
quais paradas fogem do normal e quem está preenchendo errado.

Máquinas: **RAW05 a RAW12** (a bolinha marcada na folha) e **UMC 01, UMC 02, HMC 16, NCBZ** (nome escrito na folha).

Mais detalhes: [`PRODUTO.md`](PRODUTO.md) (o que é e as regras) · [`CLAUDE.md`](CLAUDE.md) (guia técnico) ·
[`docs/PRIVACIDADE.md`](docs/PRIVACIDADE.md) (dados pessoais e LGPD).

## Como usar

1. **Entrar** com o código de acesso.
2. **Subir** o PDF (várias páginas), fotos ou **fotografar a folha** pelo celular. Subir um arquivo novo apaga a leitura anterior.
3. **Conferir** (aba 1): cada folha é lida duas vezes e as diferenças ficam marcadas (amarelo e vermelho). Use a
   **Revisão rápida** para passar só pelo que está marcado. O que você altera ou preenche fica destacado.
4. **Dar o OK**: só depois dele a análise é gerada.
5. **Análise** (aba 2): cards por folha (produzindo e parado ao mesmo tempo, dois registros no mesmo horário, parada
   mais longa que o normal, tempo sem registro), qualidade do preenchimento, alterações feitas por você, produção
   contra o tempo padrão e resumo da IA.
6. **Painel** (aba 3): tempo parado por motivo, por máquina e por hora, com filtro por grupo e dia.
7. **Exportar**: copiar PRODUÇÃO/PARADAS para colar na base (coluna **B**) ou baixar o **Excel** (todas as folhas,
   só as selecionadas, só RAW ou só usinagem). O Excel inclui a aba ANÁLISE.

## Instalação (Vercel)

Projeto Vite + funções serverless em `api/`. Variáveis de ambiente (Vercel → Settings → Environment Variables):

| Variável | Para quê |
|---|---|
| `GEMINI_API_KEY` | chave do Google AI Studio (fica só no servidor) |
| `ACCESS_CODE` | código de acesso ao app |
| `GEMINI_MODEL` | opcional, padrão `gemini-flash-latest` |
| `GEMINI_FALLBACK_MODELS` | opcional, modelos de reserva quando o principal está sobrecarregado |

Depois de mudar uma variável, faça um novo deploy.

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm test         # regras de leitura, análise, exportação e funções serverless
npm run build    # gera dist/
```

## Estrutura

- `src/main.js`: telas e fluxo (leitura, conferência, análise, painel, exportação).
- `src/core/layout.js`, `image.js`: endireita a página, acha a grade e a máquina marcada.
- `src/core/rows.js`, `parse.js`, `lists.js`: junta as leituras, valida e aprende correções (listas separadas para RAW e usinagem).
- `src/core/analysis.js`, `cards.js`, `quality.js`, `edits.js`, `panel.js`: análise, cards, qualidade, alterações e painel.
- `src/core/export.js`: texto para colar e `.xlsx`.
- `api/`: `extract.js` e `analyze.js` chamam o Gemini com a chave do servidor; `login.js` e `_auth.js` cuidam do acesso.

## Observação

Leitores gratuitos offline foram testados sobre recortes de uma folha real (TrOCR 39%, Tesseract 18% de acerto em
chapa, hora e turno) e descartados em favor do Gemini.

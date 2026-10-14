# CLAUDE.md — guia técnico do Maple Tapping

Leia `PRODUTO.md` antes de mudar comportamento. Este arquivo diz **como** mexer no código sem quebrar nada.

## O que é

App web (Vite, JavaScript puro em módulos ES) + funções serverless na Vercel. Lê folhas manuscritas com Gemini, confere, analisa e exporta Excel.

## Comandos

```bash
npm install
npm run dev        # servidor local
npm run build      # gera dist/ (tem que passar antes de qualquer commit)
npm test           # node --test test/*.test.js (todos devem passar)
npx vite preview --port 4182 --strictPort   # serve o dist/ para teste em navegador
```

Teste de navegador: `playwright-core` com o Chromium já instalado em `/opt/pw-browsers/chromium` (não rodar `playwright install`). Simule `/api/*` com `page.route` e use folhas de exemplo.

## Estrutura

- `index.html`, `src/style.css`: telas e tema (tokens de cor em `:root`; claro/escuro).
- `src/main.js`: **arquivo grande e central**. Estado, leitura, renderização, revisão rápida, análise, painel, exportação, acesso, cota, câmera, listas.
- `src/core/` (funções puras, testáveis em Node):
  - `layout.js`, `image.js`: visão computacional da folha (grade, rotação, bolinha da máquina, máscaras de caneta).
  - `rows.js`, `parse.js`: transforma o JSON do modelo em linhas e marca dúvidas (`flags`); reconciliação das leituras.
  - `analysis.js` (+ `cards.js`, `quality.js`, `edits.js`, `report.js` que ordena os cards por prioridade, `turno.js`, `panel.js`): análise, cards, qualidade de preenchimento, alterações do usuário e painel.
  - `export.js`: TSV e Excel. `lists.js`: listas RAW/usinagem e correções aprendidas. `text.js`: utilidades de texto.
- `src/core/optime.js`: linha do tempo do dia de trabalho (minutos desde 04:00, bloco próprio por folha). Cards: `story` (frase simples, `*x*` = negrito) e `people` (operadores) vêm de `cards.js`; a UI está em `tile`/`flipCard`/`openCardModal` de `main.js` (classe `.acard`; `.tile` já é o resumo).
- Sincronização: `api/sync.js` (estado leve + imagens por folha em um Blob privado da Vercel, variável `BLOB_READ_WRITE_TOKEN`; sem ela responde 503), `src/sync.js` (envio e consulta a cada ~3,5 s), `src/core/share.js` (separa/junta imagens; `page.sid` identifica a folha). Campos novos em página entram no `persist()` e, se forem pesados, nas imagens de `share.js`.
- Leitura em segundo plano: `src/jobs.js` (envio) → `api/jobs.js` (recebe as partes de cada folha no Blob e acorda o trabalhador) → `api/work.js` + `api/_worker.js` (lê A/B/C com `api/_read.js`, grava `jobs/<id>/out/<n>.json`, chama a si mesmo de novo até acabar; espera quando o Gemini está sem cota). O navegador (`trackJob`/`finishFromServer` em `main.js`) monta as linhas a partir das respostas. Camada de armazenamento: `api/_store.js`.
- Base de dados e BI: `src/core/history.js` (registros de produção/paradas, leitura do Excel de controle), `api/historico.js` (histórico `raw`/`usi` no Blob, com envios desfazíveis), `src/historico.js` (cliente), `src/basedados.js` (telas "subir para a base" e "importar Excel"), `src/core/bi.js` (modelo e medidas do Power BI: relações Produção↔Paradas por chave data+máquina+chapa final; meta 88%, 18,58 h/dia), `src/biui.js` + `src/bicharts.js` + `src/bi.css` (aba "4 · BI": páginas Diária, Paradas, Peça produtividade, Operador, Mensal). Medidas novas vão em `bi.js` com teste em `test/bi.test.js`.
- `src/data/`: vocabulário (`vocab.js`) e tempos padrão (`padrao.js`, vindos da matriz da planilha).
- `api/` (Vercel, Node ESM): `extract.js` (leituras A/B/C), `analyze.js` (resumo da IA, hoje sem uso na tela), `login.js`, `_auth.js`, `_gemini.js`, `_shared.js`. Funções **não** importam de `src/`; o que for comum é duplicado (ver `decodeEntities`).
- `test/`: testes unitários e de integração. `scripts/`: ferramentas de depuração.

## Regras de código

- Siga o estilo vizinho: comentários curtos, nomes em inglês no código, textos de tela em português do Brasil com acentuação correta.
- Funções de `src/core` ficam puras (sem DOM). O DOM mora em `main.js`.
- Dados de linha: `row.flags[campo]` = motivo da dúvida; `row.edits[campo]` = alteração do usuário; `row.added`; `page.removedRows`. O estado da leitura é salvo no navegador (IndexedDB), então campos novos em página precisam entrar na lista de persistência em `persist()` de `main.js`.
- Todo texto mostrado ao usuário deve ser claro e sem jargão. Nada de "sobreposição": diga "dois registros no mesmo horário".
- Qualquer mudança que altera dados depois do OK deve chamar `resetReview(true)` (via os fluxos existentes).
- Não "corrija" peça/modelo automaticamente; só marque e sugira. Chapa só se autocorrige quando há exatamente um vizinho a 1 dígito na lista.

## Armadilhas já vividas

- **Edição que apaga código sem querer.** Uma edição grande em `main.js` já removeu o bloco de tema/acesso/cota/câmera e a leitura travou (`updateQuotaUi is not defined`). Depois de editar: `node --check src/main.js`, `npm run build` e um teste de navegador lendo um PDF de 2 páginas.
- A IA às vezes devolve entidades HTML (`&ccedil`) no resumo: `decodeEntities` trata isso nos dois lados.
- `[hidden]` precisa de `display:none !important` (regras `display:grid` o anulam).
- Opções de `<select>` herdam fundo translúcido; mantenha a regra de fundo sólido em `style.css`.
- Em testes de navegador, `pkill -f` pode matar o próprio shell; prefira iniciar e parar o servidor explicitamente.

## Segredos e segurança

- Variáveis na Vercel: `GEMINI_API_KEY` (sensível), `ACCESS_CODE` (sensível), `BLOB_READ_WRITE_TOKEN` (criada ao ligar o Blob ao projeto; guarda a sala de sincronização), `OPERADORES_JSON` (robô) e `OPERADORES_USINAGEM_JSON` (usinagem), ambas sensíveis: chapa → nome e turno, juntadas e servidas por `api/operadores.js` só com o código de acesso; nunca no repositório, `GEMINI_MODEL` e opcionais (`GEMINI_FALLBACK_MODELS`, `GEMINI_PASS_C_MODEL`, `THINKING_BUDGET`).
- **Nunca** escrever o código de acesso, chaves ou folhas reais no repositório, em commits, issues ou conversas públicas.
- As APIs checam origem, código de acesso (comparação em tempo constante) e limitam tentativas por IP.
- Não subir folhas reais nem exemplos com chapas verdadeiras (ver `docs/PRIVACIDADE.md`).

## Publicar

1. Commit na branch de trabalho e push também para `main`.
2. O projeto Vercel `diario-de-bordo` está ligado a este repositório: todo push em `main` publica sozinho em produção. (Se precisar forçar um deploy, dá para disparar pela API/ferramenta com `gitSource` do `main`.)
3. Confirme que o novo `index-*.js` está no ar e que o login responde.
4. Mudou variável de ambiente? É preciso um novo deploy para valer.

## Antes de dar uma tarefa por pronta

- `npm test` e `npm run build` verdes.
- Teste de navegador do fluxo mexido (e do caminho principal: subir PDF, ler, OK, análise).
- Se mexeu em leitura/extração: conferir contra folhas de exemplo e dizer claramente o que **não** foi testado com folhas reais.

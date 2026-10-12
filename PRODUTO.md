# Maple Tapping — Produto

Documento de produto do **Maple Tapping** (Diário de Bordo digital): o que é, para quem, como funciona, o que já existe e o que vem depois.

## Em uma frase

Lê a folha manuscrita "DIÁRIO DE BORDO – PRODUÇÃO E PARADAS" (PDF ou foto), devolve as linhas prontas para a planilha-base e mostra, em cards claros, onde a folha se contradiz, onde há paradas anormais e quem está preenchendo errado.

## Problema

- As folhas são preenchidas à mão pelos operadores, digitalizadas e depois digitadas ou copiadas manualmente para a base (Excel/Power BI).
- Leitura automática genérica (OCR, copiloto com print) erra horário, chapa e motivo, e não avisa onde errou.
- Ninguém cruza produção com paradas: erros de horário e paradas sem explicação passam batido.

## Quem usa

- **Quem lança os dados** (apontamento/PCP): sobe a folha, confere, copia ou baixa o Excel.
- **Gestor/supervisor**: lê a aba de Análise para ver o que precisa ser validado com o operador.

## Máquinas atendidas

- **RAW05 a RAW12** (solda robotizada): a máquina vem marcada por uma bolinha na folha.
- **UMC 01, UMC 02, HMC 16, NCBZ** (usinagem): o nome vem escrito na folha.

## Fluxo principal (regra de negócio central)

1. **Subir** o arquivo digitalizado (PDF com várias páginas, foto ou câmera do celular).
2. **Ler**: cada folha é lida duas vezes de forma independente; divergências ficam marcadas. Uma terceira leitura desempata só as células duvidosas.
3. **Conferir**: a pessoa revisa tudo contra o recorte da folha (revisão rápida célula a célula, só o que está marcado).
4. **OK**: só depois do OK do usuário a análise é gerada.
5. **Analisar** (aba Análise): sempre baseada **no arquivo que acabou de ser enviado**. Subir um arquivo novo apaga a leitura anterior.
6. **Exportar**: texto para colar na base (coluna B), Excel com abas PRODUÇÃO e PARADAS (e ANÁLISE), separado por RAW e usinagem se preferir.

Qualquer edição depois do OK desfaz o OK e exige novo OK.

## Funcionalidades

**Leitura e conferência**
- Duas leituras independentes + terceira só para desempate (chapa e horários).
- Detecção por pixel da coluna do X do motivo; discorda da IA → marca.
- Listas de chapas, peças e modelos para validar, **separadas para RAW e usinagem**; aprende correções do usuário.
- Campo de data só aceita números e põe as barras sozinho.
- Foto torta ou girada é endireitada e orientada automaticamente.
- Tudo que o usuário altera ou preenche é destacado na célula e vai para o relatório.

**Análise (aba 2, após o OK)**
- *Cards por folha*, com linha do tempo colorida: produzindo e parado ao mesmo tempo, dois registros no mesmo horário, parada mais longa que o normal (por motivo), tempo sem registro.
- *Qualidade do preenchimento*: chapa em branco, parada sem motivo, horário incompleto, data faltando, caligrafia difícil.
- *Alterações feitas pelo usuário* depois da leitura.
- Produção contra o **tempo padrão** (matriz da planilha) e resumo escrito pela IA (apenas números).

**Painel (aba 3)**
- Tempo parado por motivo, por máquina, por hora do dia e maiores paradas, com filtro por grupo e dia.

**Operação**
- Código de acesso, limite de tentativas, contador de leituras do dia com "retomar leitura" quando a cota do Gemini acaba.
- Visual preto e branco com vidro, gradientes e movimento suave; tema claro e escuro; botão de voltar ao topo; funciona no celular.
- Botão **?** (ajuda com passo a passo, cores e dúvidas, aberta sozinha na primeira visita) e menu **⋮** (como usar, tema, listas, limite diário, limpar tudo, sair).

## Regras que não mudam

- Erro pequeno é aceitável; **erro grande sem aviso não é**. Toda célula duvidosa precisa ficar marcada.
- Nunca reescrever peça ou modelo sozinho: só marcar e sugerir.
- A análise só roda com o OK do usuário e só olha o arquivo atual.
- Textos para o usuário: português claro, sem jargão (por exemplo, "dois registros no mesmo horário", não "sobreposição").

## Limites conhecidos

- Um horário errado, mas plausível, pode passar sem marcação (a análise e o tempo padrão ajudam a achar).
- Folhas com letra muito ruim exigem mais conferência (o app avisa quais).
- A cota diária do plano gratuito do Gemini limita o volume; o app mostra o consumo estimado.
- Os limites de "parada normal" por motivo são estimativas e devem ser calibrados com a fábrica (`src/core/cards.js`).
- Chapas aparecem, nomes de funcionários não (não há tabela chapa → nome).

## Próximos passos (candidatos, não prometidos)

- Histórico em banco de dados — **recusado por enquanto** ("por hora não precisa").
- Nome do operador por chapa (precisa da tabela de chapas).
- Ler duas folhas em paralelo; detectar folha já lançada.
- Trocar o código único de acesso por usuários.
- Preparar para mais de uma fábrica (listas e modelos de folha por cliente), caso vire SaaS.

## Métricas de sucesso

- Percentual de células corretas sem intervenção (medido em folhas reais: ~37 de 38 campos na melhor folha de teste).
- Tempo para lançar uma folha (hoje cerca de 1 minuto de leitura + conferência).
- Quantidade de erros que a análise acha e que passariam na digitação manual.

## Documentos relacionados

- `CLAUDE.md`: guia técnico para quem mexe no código.
- `docs/PRIVACIDADE.md`: dados pessoais e LGPD.

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
- Só **cards de aviso**, sem texto corrido nem tabelas. Cada **tipo de aviso é uma seção com cor própria** (nada misturado), em ordem de prioridade: 1) **Produção inclui parada** (vermelho): a produção foi anotada cobrindo uma parada, por exemplo 12:00–15:00 com parada 13:00–14:00; o card diz "deveria ser 12:00–13:00 e 14:00–15:00"; 2) dois registros no mesmo horário; 3) tempos grandes (parada longa, produção acima do padrão); 4) preenchimento (chapa, turno, motivo, horário, data); 5) outros (tempo sem registro, horário repetido, data diferente, registro incompleto); 6) caligrafia por último.
- **Filtros** por máquina e por tipo.
- Cada card **vira**: a frente mostra máquina, tipo, tempo, resumo, **o que o app leu** (linha, data, horários) e quem é o operador; o verso mostra a **folha inteira** com a linha marcada em vermelho. Clique na folha abre o visualizador: dois cliques aproximam e afastam, arrastar move, roda do mouse dá zoom, X fecha.
- **Anotação correta ✓**: se a folha está certa, o card sai da análise (dá para desfazer).
- *Alterações feitas pelo usuário* depois da leitura, em lista, no fim.
- A IA não escreve mais o resumo da análise (economiza uma chamada por OK).

### Em cima de dado conferido, não da imagem
- A análise **não usa IA nem olha a imagem**: ela só aplica regras sobre os valores da tabela, os mesmos que vão para o Excel (já conferidos e corrigidos por você). A imagem do verso do card serve só para você comparar.
- Registro com horário ou data **ainda marcado como dúvida** na conferência **não é julgado**: vira o card "Ainda em dúvida (não analisado)", sempre o primeiro. Confirme ou corrija o horário e dê o OK de novo.

### Como o app evita acusar o operador à toa
Validado com folhas reais (UMC 01, UMC 02, HMC 16, NCBZ, RAW05) e com a planilha de controle:
- Cruzamento de até 14 min é arredondamento, não erro. Parada curta (5 min ou mais) **totalmente dentro** da produção é erro.
- Início igual ao fim **não** é um registro de 24 horas (era a maior fonte de avisos falsos): vira "registro incompleto".
- Linha com data diferente do resto da folha usa o dia da folha no cruzamento e vira um aviso próprio ("confira a data": costuma ser leitura).
- Horário idêntico em duas linhas é "leitura repetida", não acusação.
- Lacuna só vale **dentro do mesmo turno** (a troca de turno não conta) e a partir de 20 min.
- Almoço e janta de até 1h30 não são "parada longa".
- Parada implausível para o motivo (por exemplo Tyorei de 2h) leva o aviso "confira se o horário foi lido certo".
- Folha com aviso de linhas na leitura leva o aviso "confirme na folha antes de julgar".

**Painel (aba 3)**
- Tempo parado por motivo (com % acumulado, estilo Pareto), por turno, por máquina, por hora do dia e maiores paradas, com filtro por grupo e dia. Inspirado nas páginas Diária e Paradas do Power BI.

**Operação**
- Código de acesso, limite de tentativas, contador de leituras do dia com "retomar leitura" quando a cota do Gemini acaba.
- Visual preto e branco com vidro, gradientes e movimento suave; tema claro e escuro; botão de voltar ao topo; funciona no celular.
- Botão **?** (ajuda com passo a passo, cores e dúvidas, aberta sozinha na primeira visita) e menu **⋮** (como usar, tema, listas, limite diário, limpar tudo, sair).

## Regras de preenchimento automático

- **Turno em branco:** o app preenche pelo horário e pela chapa. Turno 1 (dia): 07:30 às 17:30. Turno 2 (noite): 20:40 às 05:30. Nas horas de transição (05:30 às 07:30 e 17:30 às 20:40: hora extra do dia ou noite chegando mais cedo) a **chapa decide**, pela tabela de turnos da planilha de controle (aba REFERENCIAS: DIURNO = 1, NOITE/NOTURNO = 2); chapa fora da tabela aprende com os horários claros dela. Sem histórico: de manhã assume turno 1, e à noite o corte é 18:30. Calibrado com ~2.200 paradas da base real: 97% de acerto nas horas claras e ~90% nas de transição. Na produção, o turno de finalização vem do último horário preenchido.
- Tudo que o app preenche fica marcado "auto" e vira um card de qualidade ("coluna de turno em branco"). Turno escrito pelo operador nunca é trocado; se contradiz o horário, só é sinalizado.
- **Tyorei** na descrição define o motivo TYOREI (reunião diária). Esse motivo não tem coluna impressa na folha.

## Regras que não mudam

- Erro pequeno é aceitável; **erro grande sem aviso não é**. Toda célula duvidosa precisa ficar marcada.
- Nunca reescrever peça ou modelo sozinho: só marcar e sugerir.
- A análise só roda com o OK do usuário e só olha o arquivo atual.
- Textos para o usuário: português claro, sem jargão (por exemplo, "dois registros no mesmo horário", não "sobreposição").

## Limites conhecidos

- Um horário errado, mas plausível, pode passar sem marcação (a análise e o tempo padrão ajudam a achar).
- Folhas com letra muito ruim exigem mais conferência (o app avisa quais).
- A cota diária do plano gratuito do Gemini limita o volume; o app mostra o consumo estimado.
- Os limites de "parada normal" por motivo vêm do percentil 90 das ~2.200 paradas da planilha de controle (troca de peça 30 min, set-up 40, consumíveis 40, ponte rolante 30, Tyorei 60, mecânica e elétrica 120, outros 90, aguardando peça 150, falta de peça 360, preventiva 180). Ficam em `src/core/cards.js` e podem ser ajustados.
- Nomes de operadores só aparecem se a pessoa importar a aba REFERENCIAS da planilha de controle; ficam só no navegador dela (ver `docs/PRIVACIDADE.md`).

## Próximos passos (candidatos, não prometidos)

- Histórico em banco de dados — **recusado por enquanto** ("por hora não precisa").
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

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
- Os nomes dos operadores vêm sozinhos (tabela guardada como variável protegida na Vercel, fora do repositório) e aparecem na conferência e nos cards. Só existem nomes para as chapas da aba REFERENCIAS (robôs RAW); chapas da usinagem aparecem só pelo número até entrarem na tabela (ver `docs/PRIVACIDADE.md`).

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


## Cards da análise (v3)

- Na grade, cada aviso é um cartão pequeno: máquina, tipo, **nome do operador** (com a chapa) e o número principal.
- Ao clicar, o cartão abre grande na tela (✕ no canto, Esc ou clique fora fecham). Ele traz uma frase simples com horas e linha, por exemplo "O operador anotou produção das 12:00 às 15:00 (linha 1) e parada das 13:00 às 14:00". Dá para virar e ver a folha, ou marcar "Anotação correta ✓".
- A análise usa uma linha do tempo por folha (cada folha é um dia de trabalho): folhas nunca são comparadas entre si e a data escrita não muda o cruzamento.


## Sincronizar com a equipe

- Menu ⋮ → "Sincronizar com a equipe". Quem mexer (ler, corrigir, dar OK, marcar "anotação correta") aparece no PC do colega em alguns segundos. Todos que têm o código de acesso entram na mesma sala.
- Vale a última gravação: se duas pessoas salvam ao mesmo tempo, a segunda recebe a versão da primeira e é avisada.
- Uma leitura nova de arquivo substitui a da sala para todos (como já acontece na tela de cada um).
- Se a página for recarregada no meio da leitura, ela continua sozinha de onde parou.


## Leitura em segundo plano

- Ao enviar um PDF, o app prepara cada folha e a envia ao servidor. **A leitura (Gemini) continua no servidor mesmo com a aba fechada**; ao abrir de novo, as folhas lidas já estão prontas e o app monta as linhas.
- Se o Gemini estiver ocupado ou sem cota, o servidor espera e tenta de novo sozinho (por até 12 horas). Se o servidor de segundo plano não estiver configurado, o app lê com a aba aberta, como antes.
- Recarregar a página (F5) não perde nada: o arquivo enviado fica guardado e a leitura é retomada.


## Verificar e ordenar os cards

- No card aberto, o botão **✓ Marcar como verificado** (no fim do card) deixa o card escuro na lista e o manda para o fim do seu tipo. Dá para desmarcar. É diferente de "Anotação correta ✓", que tira o aviso da lista. Fica guardado no navegador e na sincronização.
- **Marcas na folha**: todo card, ao virar para "Ver folha", marca com contorno vermelho (sem pintar por cima da letra) as linhas e as células exatas do problema; a pré-visualização já amplia a parte marcada e o clique abre a folha inteira. Para acertar uma caixa, clique nela e mova com as setas do teclado (1 ponto por toque; Shift anda 5); duplo clique devolve ao lugar e Esc solta. O ajuste fica guardado com a folha e vale também no arquivo baixado (inclusive a caligrafia difícil). O botão **Baixar** salva a folha marcada em PDF (padrão) ou PNG (seta ▾); a escolha fica lembrada. Em folha sem grade reconhecida, o card fica sem marcação.
- Os **nomes** dos operadores (robô e usinagem) vêm de variáveis protegidas da Vercel e aparecem nos cards; chapa sem nome mostra "Nome não cadastrado".
- Dentro de cada tipo, os cards vêm por padrão com o **maior tempo primeiro** (os mais arriscados). A linha **Ordenar** do topo troca para menor tempo primeiro, máquina ou operador. Os tipos continuam na ordem de gravidade.

## Fotografar folha
O botão **Fotografar folha** abre a câmera. No computador, abre uma janela com a imagem da webcam e o botão "Tirar foto" (o navegador pede permissão da câmera na primeira vez; há também "Escolher arquivo"). No celular ou tablet, abre direto o aplicativo de câmera do aparelho. A foto entra na leitura atual, sem apagar o que já foi lido.

## Entrada de folhas: RAW, usinagem e PDF com as duas máquinas
A caixa de envio tem **três** lugares: **RAW** (RAW05 a RAW12), **Usinagem** (UMC 01, UMC 02, HMC 16, NCBZ) e **Duas máquinas no mesmo PDF**. Cada um tem o seu "escolha" e o seu "Fotografar folha".
- **RAW ou Usinagem:** o lado diz ao app, antes da leitura, qual lista de chapas, peças e modelos usar e o que esperar do cabeçalho (bolinha ou nome escrito). A folha só oferece as máquinas do lado: um envio RAW nunca sugere UMC/HMC/NCBZ, e o de usinagem nunca sugere RAW. Se a leitura enxergar uma máquina do outro grupo, ela não vira máquina da folha: aparece o aviso "a leitura viu X, mas o arquivo foi enviado no lado Y" e quem escolhe é você. Enviar de novo num lado troca só a leitura daquele lado; o outro fica como estava, e a análise cobre os dois. Enquanto uma leitura está em andamento, o envio do outro lado espera.
- **Duas máquinas no mesmo PDF:** antes de anexar o app pergunta "Anexar … como PDF escaneado com as DUAS máquinas?" (e avisa que a leitura atual será substituída). Cada folha é classificada pela máquina que aparece nela. É o comportamento antigo (troca tudo).
- **Arquivos enviados:** logo abaixo, cada arquivo tem **Ver** (as folhas em miniatura, com zoom) e **Baixar PDF**. Cada arquivo tem também **Apagar** (apaga o arquivo ou a foto com as folhas dele; vale o "Desfazer exclusão"; não apaga enquanto ainda está sendo lido). O arquivo original não é guardado: o PDF baixado é refeito a partir das imagens das folhas que o app guarda, e elas viajam na sincronização, então dá para ver e baixar de outro computador (se as imagens já tiverem chegado).

### Fotografar várias folhas de uma vez
**Fotografar folha** abre a câmera dentro do app (no computador e no celular). A cada "Tirar foto" a foto entra numa fileira de miniaturas, cada uma com um ✕ para apagar; quando acabar, **Enviar N fotos** manda todas juntas para a leitura, cada uma como uma folha (por exemplo, três folhas do mesmo robô no mesmo dia). Cancelar ou Esc com fotos tiradas pergunta antes de descartar. "Usar a câmera do aparelho" abre a câmera nativa do celular (uma foto por vez, melhor qualidade). O lado em que se tirou a foto (RAW, usinagem ou duas máquinas) vale para todas.

## Cards em fileiras que deslizam
Na aba de análise, cada tipo de aviso é **uma fileira** de cards que desliza para os lados, em vez de uma grade que cresce para baixo. Para andar na fileira: as **setas** nas pontas (somem quando não há mais para onde ir), a **roda do mouse** (para baixo vai para a direita, para cima vai para a esquerda; no fim da fileira a roda volta a rolar a página), **arrastar com o mouse**, ou o dedo no celular. A ordem dentro da fileira segue o "Ordenar" escolhido (por padrão, do maior tempo para o menor, da esquerda para a direita; "Menor tempo" inverte).

## Painel (estilo BI)
A aba **3 · Painel** mostra o tempo parado em gráficos animados e clicáveis. Todos os números vêm dos mesmos horários conferidos da análise (`core/panel.js`); nada é estimado.
- **Indicadores** no topo (tempo parado, produzindo, número de paradas e a curva das paradas ao longo do dia) com contagem animada.
- **Rosca por motivo:** passe o mouse numa fatia para ver o motivo, o tempo e a porcentagem; clique para abrir a tabela **Detalhes** ao lado, com cada parada daquele motivo (máquina, motivo, hora de início, duração, operador e "Ir para a linha").
- **Mapa de calor** (máquina × hora do dia, começando às 04h): quanto mais escuro, mais tempo parado naquela hora; clique numa célula para ver as paradas daquela máquina naquela hora.
- **Máquinas, turnos e horas** também são clicáveis e preenchem a mesma tabela. Clique de novo (ou no ✕) para limpar.
- **Aproveitamento:** medidor em segmentos com a porcentagem do tempo registrado em que a máquina estava produzindo.
- Filtros de grupo (RAW/usinagem) e de dia no topo; em tela pequena os cartões empilham. Respeita "reduzir movimento" do aparelho.

### Tabelas de detalhes do painel e botão "Voltar"
- Cada gráfico abre a **sua própria** tabela, sem trocar a dos outros: a rosca usa o cartão ao lado ("Detalhes"); o mapa de calor, a máquina, o turno e a hora abrem a tabela logo abaixo do respectivo gráfico. Dá para ter várias abertas ao mesmo tempo; o ✕ fecha uma.
- A tabela mostra máquina, motivo, início, duração, operador e **observação** (a descrição que o operador escreveu na parada). As colunas ficam alinhadas com o cabeçalho.
- **⤢ Maximizar** abre a tabela completa em tela cheia: dia, folha, máquina, motivo, início, fim, duração, turno, operador (nome e chapa) e observação, com busca, ordenação ao clicar no título da coluna, total no rodapé e "Copiar" (cola direto no Excel).
- **Voltar:** ao clicar em "Ir para a linha" (no painel, na tabela maximizada ou num card), aparece perto das setas um botão roxo "↩ Voltar para o painel / o card / a tabela do painel / a análise". Ele devolve você à aba, à rolagem e ao card ou à tabela de onde saiu. O ✕ ao lado dispensa o atalho.

### Ver a folha inteira na conferência
No cabeçalho de cada folha da conferência há o botão **👁 Ver folha inteira**, que abre a imagem completa da folha que está sendo conferida (com zoom e arrastar). Fica desativado se a imagem não estiver neste computador.

### Aviso de versão nova
Se o app ficar aberto numa aba enquanto uma versão nova é publicada, aparece no alto uma faixa roxa "Há uma versão nova do app" com o botão **Atualizar agora**. O app só pergunta e nunca recarrega sozinho (a leitura fica salva no navegador). A conferência é feita ao voltar para a aba e a cada 3 minutos.

### Resumo e botões de exportar
O resumo (folhas, linhas de produção, paradas e o que está pendente) e os botões **Copiar PRODUÇÃO**, **Copiar PARADAS** e **Baixar Excel** ficam dentro do cartão "Entrada de folhas", logo abaixo dos arquivos enviados, e rolam junto com a página. Não há mais barra fixa no rodapé cobrindo o conteúdo.

### Exportar o painel (apresentação)
No topo do painel há o botão discreto **⤓ Exportar**. Ele abre um menu com **PDF** e **Excel**, cada um com **Fundo branco** ou **Fundo escuro**. A exportação usa o filtro de grupo e de dia que estiver escolhido e os mesmos números da tela.
- **PDF (apresentação):** slides em paisagem 16:9: capa, indicadores com o medidor de aproveitamento, motivo (rosca com a tabela), máquina e turno, mapa de calor, paradas por hora, maiores paradas e um anexo com todas as paradas (dia, máquina, motivo, início, fim, duração, operador e observação).
- **Excel:** a primeira aba ("Apresentação") traz os mesmos slides como imagens; as outras são tabelas formatadas no mesmo tema (cabeçalho colorido, barras de dados e escala de cor no mapa de calor): Resumo, Por motivo, Por máquina, Por turno, Por hora, Mapa de calor e Paradas (com filtro e observação).
- **Gráficos editáveis no Excel:** as abas Por motivo (rosca), Por máquina (barras), Por turno (colunas) e Por hora (área) trazem um gráfico nativo do Excel ao lado da tabela, ligado aos números da própria aba: dá para mudar cores, títulos e tipo, e ele acompanha se você editar os valores. Os gráficos são escritos no arquivo por `src/xlsxcharts.js` (a biblioteca `exceljs` não cria gráficos). O Excel usa `exceljs`, baixada só quando se exporta (arquivo separado).

### Visualizar: tudo, só RAW ou só usinagem
Quando há folhas de RAW **e** de usinagem na leitura, aparece abaixo das abas a barra **Visualizar: Tudo · RAW · Usinagem** (com o número de folhas de cada). A escolha vale para as três abas e fica lembrada:
- **Conferência:** só as folhas do grupo escolhido ficam na lista, e os números do topo (folhas, produção, paradas, a conferir) passam a contar só elas.
- **Análise:** só os cards das máquinas do grupo; os filtros de máquina e de tipo mostram só o que existe nele.
- **Painel:** todos os gráficos, tabelas de detalhes e exportações (PDF/Excel) usam só o grupo, com um selo "Só RAW" ou "Só usinagem" no título.
Isso só muda o que é **mostrado**. O OK e a análise continuam sendo feitos com todas as folhas selecionadas, e os botões de baixar Excel mantêm as suas próprias opções ("selecionadas", "com todas", "só RAW", "só usinagem"). Se só houver um tipo de folha, a barra não aparece.

### Campos de horário sempre em HH:MM
Nos campos INÍCIO e FIM (produção e paradas, na conferência e na revisão rápida) só entram números e os dois pontos aparecem sozinhos: digitar 1,1,1,1 dá **11:11**; digitar 9,3,0 dá 9:30 e, ao sair do campo, **09:30**. Ao apagar com Backspace os dois pontos não travam o cursor. Ao sair do campo o horário vira sempre HH:MM (só a hora vira HH:00; um dígito de minuto vira 09:03). Hora acima de 23 ou minuto acima de 59 (por exemplo 12:60) fica marcado como dúvida e não entra na análise até ser corrigido. Letras são ignoradas.

## Base de dados e BI (aba "3 · Painel BI")
- **Subir para a base de dados**: depois do OK aparece o botão. Ele confere (sem dúvidas pendentes, máquina escolhida), mostra o que vai entrar (produções e paradas) e só envia depois de a pessoa marcar que está tudo certo. Folha enviada ganha o selo "✓ na base"; reenviar não duplica; cada envio pode ser desfeito.
- **Importar histórico (Excel)** (menu ⋮ → "Base de dados"): lê as abas PRODUÇÃO e PARADAS do arquivo de controle (RAW ou usinagem), mostra a prévia e só grava depois da confirmação. Mantém os valores de TEMPO/DEC do Excel; linhas idênticas repetidas entram todas.
- **BI**: reproduz os relatórios do Power BI (RAW e usinagem) sobre essa base: mesmas medidas (disponibilidade = horas produzidas ÷ (18,58 h × dias de cada máquina), meta 88%, ganho sobre o tempo padrão, Pareto com % acumulado), mesmas relações (a parada só aparece com a produção da mesma data, máquina e chapa final) e mesmas cores. Clicar numa barra filtra os outros gráficos.
- Diferenças conhecidas: título dos cartões corrigido ("HORAS PRODUZIDAS" etc.); meses em ordem do calendário; se o Excel tem TEMPO/DEC vazio, o app usa a soma dos horários.
- Uma só aba, **Painel BI**: primeiro os **Indicadores** (relatórios do Power BI sobre a base) e, no final da mesma aba, **Folhas de hoje** (o Painel de antes, com todos os gráficos). Visual (cores, cartões) segue o Painel.
- **Todo gráfico e tabela do BI tem filtro próprio por máquina e por data (De/Até)**, além dos filtros laterais.
- **Indicadores: controles e avisos.** Barra de período no topo (Tudo, último dia, 7 dias, 30 dias, mês do último dia, De/Até), que vale para toda a página; cartões com meta, diferença em pontos e comparação com o período anterior; faixa de destaques (pior e melhor disponibilidade, maior motivo de parada); aviso de registros suspeitos (mais de 24 h no mesmo dia e máquina, ou um registro com mais de 16 h) com lista para conferir; "Ver registros" depois de clicar numa barra; botão "⬇ Excel" em cada gráfico e tabela. Os rótulos de horas paradas dizem de onde vem o número ("todas do dia e máquina" ou "das chapas filtradas").
- **Filtros de cada gráfico seguem o primeiro que você mexer:** ao escolher máquina ou data em um gráfico, os outros da página copiam a escolha. Depois, qualquer outro gráfico pode ser alterado sozinho e deixa de acompanhar; o gráfico que começou continua mandando nos que não foram mexidos. "Limpar" no gráfico que começou volta tudo ao padrão.
- **Filtros laterais (Dia, Mês, máquina, peça, turno) funcionam como no Power BI:** um clique seleciona só aquele item (clicar de novo limpa); Ctrl ou ⌘ + clique soma ou tira itens. No celular, o botão "Vários" faz o mesmo. A escolha vale para todos os gráficos da página.
- **Legenda dos gráficos são botões:** clicar em uma cor (por exemplo RAW06) mostra só aquela série naquele gráfico; clicar de novo volta a mostrar todas; Ctrl/⌘ + clique soma ou tira séries.
- **"Só dias úteis"** na barra de período: tira sábados e domingos (feriados não são tirados) e vale para toda a página, junto com os botões de período. Desligar volta à seleção que existia antes.
- **Clique nos gráficos segue a mesma regra dos filtros laterais:** um clique seleciona só aquela barra (de novo = limpa); Ctrl/⌘ + clique soma ou tira barras. O botão "Seleção múltipla" na barra de período liga isso para o toque (celular), nos gráficos e nos filtros.
- **Auditoria de 24 h:** uma máquina não passa de 24 h por dia somando produção e paradas. Ao subir folhas, se a máquina e o dia (junto com o que já está na base) passarem de 24 h, o envio é barrado com a lista dos dias e do motivo (só a produção passa; só as paradas passam; produção e parada no mesmo horário, contadas duas vezes). Nos Indicadores, o botão "⚠ N dia(s) acima de 24 h" mostra o que já está na base (segue os filtros de dia, mês e máquina). O histórico importado do Excel não é corrigido pelo app: quem corrige é a pessoa, no Excel.
- **Cards nos Indicadores (mesmo conceito dos cards da Análise):** no topo de cada página, cards com a máquina, a etiqueta do assunto, os operadores (nome e chapa), o número grande, uma frase curta e "Abrir ⤢" (abre a tabela por trás: disponibilidade por máquina, paradas por motivo, dias acima de 24 h, registros suspeitos). Cor da borda: vermelho = ruim, amarelo = atenção, verde = bom.
- **Entrega (horas padrão)** — primeira página dos Indicadores. Pedido do supervisor: mostrar quanto a máquina **entregou** pelo tempo padrão (peças feitas × tempo padrão da MATRIZ TEMPO / BAAN) ao lado do tempo **real** gasto. Uma linha da folha = uma peça. Exemplo: 10 peças de 5 h padrão = 50 h entregues; se gastou 60 h reais, a eficiência é 50 ÷ 60 = 83%. A conta de eficiência usa só as peças que têm tempo padrão (real e entregue das mesmas peças). Quando a matriz não tem a peça naquela máquina, usa o tempo da mesma peça e modelo em outra máquina (marcado como "padrão de outra máquina"); peças sem nenhum padrão ficam fora da conta e aparecem na tabela "Peças sem tempo padrão" para completar a matriz. As cores da eficiência (verde ≥100%, amarelo ≥85%, vermelho abaixo) são provisórias até o supervisor definir a regra.

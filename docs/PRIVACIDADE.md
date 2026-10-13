# Privacidade e proteção de dados (LGPD)

Este documento explica, em linguagem simples, quais dados o Maple Tapping trata, para onde eles vão e onde ficam.
Ele **documenta** o funcionamento do app; não substitui a avaliação do jurídico ou do encarregado de dados (DPO) da empresa.

## Que dados aparecem nas folhas

| Dado | É dado pessoal? | Observação |
|---|---|---|
| Chapa (matrícula) do funcionário | Sim | Identifica o colaborador. |
| Horários de produção e de parada | Indiretamente | Ligados à chapa, mostram a jornada de quem operou. |
| Máquina, peça, modelo, motivo da parada | Não | Dados de processo. |
| Comentários escritos à mão (descrição, observações) | Pode ser | Dependendo do que o colaborador escreveu. |

Os **nomes** dos operadores ficam numa variável protegida do projeto na Vercel (`OPERADORES_JSON` para o robô e `OPERADORES_USINAGEM_JSON` para a usinagem), **fora do repositório**. O servidor só os entrega a quem tem o código de acesso, e o navegador os guarda localmente para mostrar nos cards. Eles nunca vão ao Gemini. Para atualizar a lista, troque o valor da variável (ou importe a aba REFERENCIAS em Listas de conferência → Operadores). A tabela chapa → turno (sem nomes) faz parte do código.

## Caminho dos dados

1. **No navegador de quem usa.** A folha (PDF ou foto) é aberta no próprio navegador, que prepara as imagens.
2. **Servidor do app (Vercel).** As imagens são enviadas à função `/api/extract`, que as repassa ao Google. O app não grava essas imagens em banco de dados nem em arquivo.
3. **Google Gemini.** O Google lê a imagem e devolve o texto em formato estruturado. Aqui os dados saem do controle do app.
4. **De volta ao navegador.** O resultado aparece na tela para conferência. Para o resumo da análise, só números e descrições curtas (sem imagens) vão ao Gemini pela função `/api/analyze`.

## Onde os dados ficam guardados

- **Navegador do usuário** (IndexedDB e armazenamento local): a leitura em andamento, para não se perder ao recarregar a página. É apagada com "Limpar tudo", ao subir um novo arquivo, ou ao limpar os dados do navegador.
- **Servidor do app:** nada é guardado. Não há banco de dados.
- **Registros técnicos da hospedagem (Vercel):** a plataforma pode manter logs de acesso (endereço IP, horário, rota). Esses logs não incluem o conteúdo das folhas.
- **Google:** conforme a política do plano da chave de API usada (ver abaixo).

## Pontos de atenção

1. **Plano do Gemini.** No plano **gratuito** da API, o Google pode usar o conteúdo enviado para melhorar seus produtos e permitir revisão humana. Para dados de funcionários, o recomendado é usar a API com **faturamento ativado** (plano pago), em que o conteúdo enviado não é usado para treinar modelos. Confirme sempre os termos vigentes do Google.
2. **Acesso ao app.** O app é protegido por um código de acesso (variável `ACCESS_CODE` na Vercel). Use um código forte, troque quando alguém sair da equipe e não o compartilhe fora de quem precisa.
3. **Repositório de código.** O repositório não deve conter folhas reais nem exemplos com chapas verdadeiras. Se o repositório for público, qualquer pessoa pode ler o que estiver nele, inclusive no histórico.
4. **Exportações.** Os arquivos Excel e o texto copiado contêm chapas. Trate-os como dados pessoais: guarde em local com acesso controlado.
5. **Minimização.** Suba apenas as folhas necessárias e apague a leitura ("Limpar tudo") depois de exportar.

## Quem responde pelo quê (sugestão para a empresa preencher)

- Controlador dos dados: ______________________
- Encarregado (DPO) / contato: ______________________
- Base legal usada para tratar os dados das folhas: ______________________
- Prazo de guarda das planilhas exportadas: ______________________

## Direitos dos titulares

Colaboradores podem pedir à empresa informação sobre seus dados, correção ou eliminação. Como o app não guarda dados em servidor, a eliminação no app é feita limpando a leitura no navegador; já os arquivos exportados precisam ser tratados pela empresa.


## Sincronização com a equipe (opcional)

Ligada pelo menu, ela envia a leitura (dados e imagens das folhas) para um armazenamento privado da Vercel (Blob), acessível só pelas funções do app com o código de acesso. Fica guardada até alguém enviar outro arquivo ou limpar tudo. Desligada, nada disso é enviado.

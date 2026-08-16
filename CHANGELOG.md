# Changelog

Registro de mudanças do NanaWallet. Segue [versionamento semântico](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH` (ex: `1.0.0`, `1.1.0`, `1.1.1`, `2.0.0`).

- **MAJOR** (`X.0.0`): mudanças que quebram compatibilidade com dados antigos ou reformulações grandes.
- **MINOR** (`1.X.0`): novas funcionalidades, sem quebrar o que já existe.
- **PATCH** (`1.1.X`): correções de bugs e ajustes pequenos.

A versão exibida no app (Configurações → Sobre o aplicativo) vem de `src-tauri/tauri.conf.json` — é a fonte única da verdade. Para lançar uma nova versão: mude o campo `"version"` nesse arquivo e rode `npm run tauri dev` ou `npm run tauri build` — `scripts/preparar-build.js` sincroniza automaticamente `package.json` e `Cargo.toml`, e regrava a data da build. Depois, adicione uma entrada aqui descrevendo o que mudou.

## [Não lançado]

_(as próximas mudanças entram aqui, antes de virar uma versão)_

## [1.12.0] - 2026-08-15

- **Auditoria e correção de responsividade mobile** (foco no iPhone 11, 390×844): a versão Web (GitHub Pages) agora se comporta como um app pensado para celular, não um desktop espremido.
  - **Navegação inferior fixa** (≤560px) substitui a barra de ícones horizontal (que exigia arrastar pra ver os itens fora da tela, sem nenhuma pista visual de que havia mais): Dashboard/Gastos/Ganhos/Histórico sempre visíveis + "Mais" abre uma folha com Ticket Alimentação/Lembretes/Metas/Exportação/Configurações.
  - **Modais viram folha inferior** ("bottom sheet") no celular — ancorados embaixo, largura cheia, cantos superiores arredondados, mais fáceis de alcançar com o polegar. Continuam com scroll interno e botões de ação sempre visíveis (herdado da etapa anterior). Não fecham mais ao tocar fora *nos formulários* (gasto, ganho, parcelamento, lembrete, meta) — só um toque sem querer não descarta mais o que já foi digitado.
  - **Tabelas (Gastos, Ganhos, Histórico, Ticket Alimentação) viram cartões empilhados** em telas estreitas (≤700px), em vez de rolar na horizontal.
  - **Campos de formulário em 16px no mobile** — evita o zoom automático do iOS Safari ao focar um input.
  - **Gráficos legíveis sem dar zoom**: o texto dos 6 gráficos SVG do Dashboard é redimensionado no mobile pra compensar a escala do `viewBox`, que antes deixava os rótulos ilegíveis (~6px na tela) num card estreito.
  - `100vh` → `100dvh` (com fallback) e uso de `env(safe-area-inset-*)` na navegação inferior, no rodapé dos modais e no toast — evita cortes/vãos causados pela barra de endereço retrátil e pelo notch/indicador de home do iPhone.
  - Alvo de toque ampliado nos ícones de editar/excluir (mobile) e no painel do seletor de categoria (1 coluna abaixo de 400px).
  - **Bug real corrigido**: a tabela de Ganhos não tinha o wrapper `.tabela-scroll` que as outras 3 tabelas já tinham — podia vazar para fora do cartão e causar scroll horizontal da página inteira em telas estreitas.
  - Testado nos breakpoints 320/360/375/390/414/768/1024/desktop com dados reais (mock temporário de Supabase só para a sessão de auditoria, sem sobrar no código) — sem nenhum scroll horizontal de página em nenhuma largura, e o desktop (sidebar, tabelas, modais centralizados) sem nenhuma mudança de comportamento.

## [1.11.0] - 2026-08-09

- **Correção de bugs da auditoria de QA** (10 bugs, 2 altos/2 médios/6 baixos — ver relatório completo da auditoria): Dashboard e o gráfico "Evolução do saldo" divergiam no mesmo mês (fórmulas diferentes, unificadas em `utils/calculosFinanceiros.js`); restaurar um backup/exportação aceitava itens com id duplicado, valor não numérico ou data inválida sem nenhuma validação (novo `dados/validacao.js`); excluir dois itens fixos/parcelados em sequência rápida deixava a primeira exclusão pendurada para sempre; título só com espaços em 5 formulários (Ganhos, Gastos, Lembretes, Metas, Parcelamento) falhava em silêncio; texto desatualizado na página Ticket Alimentação; modais sem `role="dialog"`/foco preso (novo `utils/focoModal.js`); operações longas de Exportação sem indicador de carregamento; busca do Histórico sem debounce; parcelamento sem limite de quantidade/confirmação prévia; parcelamento sem seletor de carteira (agora aceita Ticket Alimentação também).
- **Novo**: suíte de testes automatizados (`npm test`, `node --test` nativo — sem framework externo) com 58 testes cobrindo os 10 bugs corrigidos como testes de regressão, mais cobertura adicional de recorrência de itens fixos, saldo de carteira de benefício e migração automática de dados antigos. `jsdom` adicionado como dependência de desenvolvimento (só para os testes, não entra no app empacotado) para testes que exercitam formulários/modais reais a partir do próprio `src/index.html`.

## [1.10.0] - 2026-08-09

- **Novo**: card "Próximo recebimento" na página Ticket Alimentação — valor, data prevista e dias restantes, só aparece para um benefício ativo e recorrente (nunca mostra uma previsão falsa).
- **Novo**: indicador de ritmo de consumo (🟢 dentro do ritmo / 🟡 gastando acima do esperado / 🔴 saldo pode acabar antes do próximo crédito), com gasto médio diário e valor disponível por dia. Fica oculto quando não há dados suficientes para um cálculo confiável.
- Fecha o sistema de Ticket Alimentação/benefícios (4 etapas): carteiras separadas do dinheiro principal, página com saldo/histórico/configuração, recorrência automática do crédito, saldo acumulado entre meses, e agora ritmo de consumo + próximo recebimento.

## [1.9.0] - 2026-08-09

- **Novo**: geração automática do crédito mensal do Ticket Alimentação (quando "Recorrente" está ativo) — gera sozinha a entrada de cada mês que ainda não tiver nenhuma (manual ou automática), sem duplicar nada, ajustando o dia de recebimento para o último dia válido do mês quando necessário.
- **Novo**: saldo acumulado de verdade entre os meses (quando "Acumula saldo" está ativo) — o que sobrar de um mês passa para o seguinte, com a composição ("vindo do mês anterior" + "recebido este mês") mostrada claramente na página Ticket Alimentação. O card "Benefícios" do Dashboard usa o mesmo cálculo.

## [1.8.0] - 2026-08-09

- **Novo**: sistema de carteiras (Etapa 1) — gastos agora podem ser atribuídos a uma carteira (Conta bancária, Dinheiro, ou uma carteira de benefício como Ticket Alimentação). Um gasto pago com uma carteira de benefício **nunca** conta como despesa financeira principal: fica de fora do total/tabela de Gastos, do Dashboard (total gasto, saldo do salário, diagnósticos), dos 6 gráficos, do Histórico e do resumo de texto para IA.
- **Novo**: página "Ticket Alimentação" (Etapa 2) — saldo atual, recebido no mês, gasto no mês, percentual utilizado (com barra de progresso), gastos por categoria, lista de movimentações do mês (recebimentos e gastos), configuração do benefício (valor mensal, dia de recebimento, recorrente, acumula saldo, ativo) e lançamento manual de recebimentos. Card "Benefícios" novo no Dashboard principal, mostrando o saldo de cada benefício ativo, sempre separado dos totais financeiros.
- Ainda não implementado (próximas etapas): geração automática do crédito mensal, saldo acumulado entre meses, indicador de ritmo de consumo e previsão do próximo recebimento.

## [1.7.0] - 2026-07-27

- **Alterado**: os dois dias de salário usados em todo o app (Ganhos, Gastos, Dashboard, gráfico "Comparação entre salários" e exportação em texto) mudaram de **dia 10 / dia 25** para **dia 15 / dia 30**. Gastos salvos antes desta versão com o salário responsável antigo (`"dia10"`/`"dia25"`) são convertidos automaticamente ao carregar (`"dia15"`/`"dia30"`), sem precisar editar nada manualmente. Ganhos continuam agrupados pelo dia real da própria data (não por um campo salvo) — um ganho recorrente cadastrado com data no dia 10/25 não migra sozinho para o dia 15/30; para continuar aparecendo no grupo certo, a data dele precisa ser ajustada manualmente (ou a próxima ocorrência gerada automaticamente já no novo dia).

## [1.6.1] - 2026-07-25

- **Novo**: campo "Observações" também em Lembretes (já existia em ganhos, gastos e parcelamentos desde a 1.6.0).
- **Alterado**: o checkbox "Gasto fixo (gerado automaticamente todo mês)" virou só "Gasto fixo", com o texto extra num tooltip ao passar o mouse — mesmo ajuste já feito em "Ganho fixo" na 1.6.0.

## [1.6.0] - 2026-07-25

- **Novo**: campo "Observações" em ganhos, gastos e parcelamentos (parcelamento aplica a mesma observação a todas as parcelas geradas). Ao editar um item de uma série fixa, "aplicar edições às próximas ocorrências" também propaga as observações, junto com título/valor (e, em gastos, categoria/salário responsável).
- **Alterado**: o checkbox "Ganho fixo (gerado automaticamente todo mês)" virou só "Ganho fixo", com o texto extra num tooltip ao passar o mouse. Os labels de "Aplicar título/valor/categoria/salário responsável às próximas ocorrências..." (ganhos e gastos) foram simplificados para "Aplicar edições às próximas ocorrências desta série".
- **Removido**: Metas virou uma wishlist simples — os campos "Valor já guardado" e "Aporte mensal automático" (e, junto com eles, a barra de progresso, porcentagem e o selo "Concluída") saíram da tela. Uma meta agora só tem nome, valor desejado, prioridade e observações.

## [1.5.0] - 2026-07-24

- **Novo**: excluir um gasto/ganho fixo ou uma parcela agora pergunta o escopo — "somente esta ocorrência", "esta e as futuras da série" ou "todas". Um gasto/ganho avulso continua com a confirmação simples de sempre.
- **Novo**: categoria (opcional) no cadastro de parcelamento — aplicada a todas as parcelas geradas.
- **Corrigido**: o modal de criar/editar gasto podia ficar maior que a tela (principalmente com o campo de categoria); agora tem altura máxima e rola internamente, com os botões Cancelar/Salvar sempre acessíveis. Vale para todos os modais do app (ganho, gasto, parcelamento, lembrete, meta).

## [1.4.0] - 2026-07-24

- **Corrigido (alto impacto)**: nas páginas Gastos e Ganhos, os botões de "mês anterior"/"próximo mês" só atualizavam a tela quando a troca de mês, por coincidência, gerava uma nova ocorrência de item fixo (o que dispara uma notificação de dados) — navegando para um mês sem nada a gerar, o rótulo e a lista ficavam travados no mês antigo, dando a impressão de navegação "travada" ou "sem volta". As duas páginas agora reagem diretamente à troca de mês, como o Dashboard já fazia.
- **Novo**: botão "Mês atual" ao lado das setas de navegação de mês em Dashboard, Gastos e Ganhos, para voltar rapidamente ao mês corrente.

## [1.3.0] - 2026-07-24

Sistema de categorias de despesas — categorias pensadas para como as pessoas realmente encaram os próprios gastos no dia a dia (Delivery, Mimos, Hobbies...), não a lista genérica de "Alimentação/Transporte/Outros". Implementado em 4 etapas pequenas, cada uma testada e aprovada antes da próxima.

- **Novo**: 18 categorias padrão (Delivery, Mercado, Comer fora, Hobbies, Lazer, Assinaturas, Comprinhas, Beleza, Saúde, Transporte, Casa, Contas, Presentes, Pets, Trabalho, Viagens, Imprevistos, Mimos), cada uma com nome, emoji e cor pastel própria, carregadas automaticamente na primeira inicialização.
- **Novo**: seletor de categoria (opcional) no formulário de criar/editar gasto — painel customizado com chip colorido por categoria (emoji + nome + cor), não um `<select>` nativo.
- **Novo**: coluna "Categoria" nas tabelas de Gastos e Histórico, com o mesmo selo colorido.
- **Novo**: filtro por categoria em Gastos e Histórico.
- **Novo**: card "Gastos por categoria" no Dashboard (gráfico de barras horizontais, uma por categoria, do mês selecionado), mostrando também a maior categoria do mês.
- **Novo**: card "Estatísticas por categoria" no Dashboard, com frases automáticas (maior categoria, quantidade de gastos, percentual das categorias mais relevantes do mês).
- **Arquitetura**: `CategoryService` segue o mesmo CRUD genérico já usado por metas/lembretes — categorias personalizadas (criar/editar/excluir pela interface) podem ser adicionadas numa etapa futura sem refatorar a camada de dados.

## [1.2.1] - 2026-07-20

- **Removido**: a caixinha "Mostrar histórico" das páginas Gastos e Ganhos. Itens já pagos/recebidos de datas passadas continuam saindo da lista do mês por padrão (nada muda nisso) — só não há mais como revelá-los ali; a página Histórico já mostra todas as transações de qualquer mês/status.

## [1.2.0] - 2026-07-20

Três funcionalidades novas, a pedido explícito, todas sugeridas como melhoria futura na auditoria da versão anterior.

- **Novo**: as abas "Todos/Fixos/Parcelados" da página Gastos agora filtram de verdade a lista (antes eram só visuais).
- **Novo**: ao editar um gasto ou ganho que já faz parte de uma série fixa, o modal ganhou a opção "Aplicar às próximas ocorrências" — propaga título/valor (e salário responsável, no caso de gastos) para as ocorrências futuras da mesma série e para as que ainda serão geradas automaticamente, sem alterar as já passadas nem o status pago/recebido de cada uma.
- **Novo**: metas podem ter um "aporte mensal automático" — um valor creditado sozinho em `valorGuardado` a cada mês que o app for aberto (inclusive de forma retroativa aos meses em que o app ficou fechado, mas nunca antes do mês em que o aporte foi ativado). Para de creditar automaticamente assim que a meta é batida.

## [1.1.1] - 2026-07-20

Auditoria completa do projeto (funcionalidades, cálculos, persistência, migração, edge cases), com testes automatizados reais sobre a camada de armazenamento. Só correções de bugs — nenhuma funcionalidade nova.

- **Corrigido (alto impacto)**: gastos/ganhos fixos com vencimento no dia 31 (ou dia 29/30) ficavam PRESOS no dia 28 para sempre depois de atravessar fevereiro, mesmo em meses seguintes com 30 ou 31 dias — a geração automática de ocorrências (`src/js/utils/recorrencias.js`) encadeava a data de cada nova ocorrência a partir da ÚLTIMA gerada (já ajustada) em vez da primeira da série. Agora cada ocorrência é calculada a partir da data original da série, preservando o dia-do-mês verdadeiro (mesmo comportamento que os parcelamentos já tinham, corretamente, desde a Etapa 8).
- **Corrigido**: os gráficos "Evolução dos gastos", "Evolução do saldo" e "Previsões futuras" (Dashboard) agrupavam gastos por `data` (data da compra); Dashboard e a página Gastos agrupam por `mesReferencia` (mês do salário que paga a conta) desde a Etapa 13, que podem ser meses diferentes. Um gasto atribuído a um mês diferente do da compra aparecia no mês errado nos gráficos, divergindo dos totais mostrados no resto do app. Os três gráficos agora usam `mesReferencia`, como o resto do app.
- **Corrigido**: backups automáticos podiam colidir de nome quando duas gravações no mesmo arquivo (mesma coleção/mês) aconteciam dentro do mesmo segundo (ex: dois cliques rápidos de "marcar como pago"), sobrescrevendo silenciosamente um backup pelo outro e reduzindo a retenção real para menos dos 15 backups esperados. O carimbo dos nomes de arquivo de backup automático agora inclui milissegundos.
- **Corrigido**: parcelamento com uma parcela excluída individualmente mostrava "faltam X de Y" com o Y original do plano, mesmo depois de excluir uma parcela (bug documentado desde a etapa de revisão final). Agora usa a quantidade de parcelas que realmente restam.
- **Corrigido**: um arquivo de mês corrompido (ex: gravação interrompida por queda de energia) podia derrubar o carregamento de páginas inteiras que não tinham nada a ver com o problema; agora cada página inicializa isoladamente (uma falha não impede as outras) e um mês corrompido é tratado como vazio, sem perder o arquivo.
- **Corrigido**: nomes de backup automático e "Saldo restante" do texto de exportação (para IA) continham HTML não escapado / uma fórmula desatualizada, respectivamente — ambos alinhados ao restante do app.
- **Melhorado**: `salvarEmLote` (usado por parcelamentos e geração de recorrências) agora faz upsert por id em memória, evitando duplicar itens caso o mesmo id seja reenviado.

## [1.1.0] - 2026-07-19

Simplificação do projeto: o app volta a ser exclusivamente desktop (Windows, via Tauri).

- **Removido por completo**: sincronização com a nuvem (Supabase), autenticação de conta, fila offline de sincronização, e a PWA para iPhone/Safari (pasta `pwa/`). Nenhum vestígio de código, dependência, configuração ou UI relacionado a isso permanece no projeto — ver `CLAUDE.md` para o histórico de por que essas etapas existiram.
- **Novo**: botão "Apagar todos os dados" (Exportação), com dupla confirmação e backup automático completo antes de apagar.
- **Armazenamento local**: cada coleção particionada por mês (gastos/ganhos/lembretes) ganhou um arquivo de índice (`indice.json`) que evita varrer pastas de ano para descobrir quais meses existem, e a leitura de múltiplos meses passou a ser paralela — pensado para manter a inicialização rápida mesmo depois de muitos anos de uso. Migração automática e retrocompatível para instalações sem o índice ainda.

## [1.0.0] - 2026-07-19

Primeira versão "estável" do NanaWallet, reunindo tudo desenvolvido até aqui:

- Dashboard com estatísticas, alertas de saldo, diagnósticos e gráficos.
- CRUD completo de ganhos, gastos e lembretes, com gastos/ganhos fixos e parcelamentos recorrentes gerados automaticamente por mês.
- Armazenamento local em JSON, particionado por mês (ganhos/gastos/lembretes) com migração automática de dados antigos, e backups automáticos a cada gravação.
- Exportação em JSON/texto, backup manual e restauração.
- Páginas de Histórico (todas as transações, com filtros/busca/ordenação) e Metas (wishlist com prioridade e barra de progresso).
- Sistema de lembretes com indicador visual de tempo restante (meses/dias/próximo/atrasado).
- Redesign visual "girly cozy pastel goth" em dark mode.
- Sistema de versionamento automático (este changelog, versão e data da build exibidas em Configurações).

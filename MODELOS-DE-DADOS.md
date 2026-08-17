# Modelos de dados do aplicativo

Este documento descreve o formato de cada item guardado nos arquivos JSON (ganhos, gastos, lembretes, configurações). Ele existe para que qualquer tela ou lógica futura (feita por você ou por uma IA) saiba exatamente qual formato gravar e ler, sem precisar adivinhar.

Nenhum dado de exemplo abaixo foi gravado de verdade nos arquivos reais do app — são apenas ilustrações do formato. Os arquivos reais continuam vazios até você começar a cadastrar coisas pela interface.

## Onde os dados ficam no disco (a partir desta etapa)

Ganhos, gastos e lembretes crescem indefinidamente com o tempo (uma ocorrência nova todo mês, ano após ano), então, em vez de um único JSON gigante por coleção, cada uma é **particionada em um arquivo por mês**:

```
%LOCALAPPDATA%\com.financeiro.desktop\dados\
  gastos\indice.json           <- lista os meses que existem, sem precisar varrer pastas
  gastos\2026\07.json
  gastos\2026\08.json
  ganhos\indice.json
  ganhos\2026\07.json
  lembretes\indice.json
  lembretes\2026\08.json
  metas.json                   <- arquivo único (não particionado)
  configuracoes.json           <- arquivo único (não particionado)
```

- **Chave do mês de cada coleção**: gastos usam `mesReferencia`; ganhos e lembretes usam o mês da própria `data`. Ver [src/js/dados/armazenamento.js](src/js/dados/armazenamento.js).
- **`configuracoes.json` e `metas.json` não são particionados**: são coleções pequenas e sem crescimento ao longo do tempo (preferências e wishlist), então um arquivo único continua sendo a escolha certa — não seguimos a estrutura de pastas por mês aqui de propósito.
- **Migração automática**: se o app encontrar `ganhos.json`/`gastos.json`/`lembretes.json` no formato antigo (um arquivo só com tudo, de antes desta etapa), ele converte sozinho para o novo formato particionado na primeira vez que abrir, sem nenhuma ação manual. O arquivo antigo é copiado para os backups automáticos antes de ser removido, então nada se perde. Esse processo é idempotente (rodar de novo não duplica nada).
- **Índice de meses** (`indice.json`, dentro da pasta de cada coleção particionada): lista os meses ("AAAA-MM") que têm dados, para o app não precisar abrir uma pasta de ano por vez só para descobrir quais meses existem — isso faria a inicialização ficar linearmente mais lenta conforme os anos de uso se acumulam. Se o índice não existir ainda (instalação anterior a esta otimização), o app reconstrói sozinho na primeira leitura, varrendo as pastas de ano uma única vez, e passa a usar o índice dali em diante. Se o índice se perder ou corromper, o app também reconstrói sozinho — ele é só um cache do que já está em disco, nunca a fonte de verdade dos dados.
- **Leitura/escrita reutilizáveis**: `carregarColecao(colecao)` lê todos os meses **em paralelo** (não um de cada vez) e devolve um array só (usado onde o app precisa do histórico completo, ex: Histórico, Exportação, geração de recorrências); `salvarItem`/`removerItem`/`salvarItensEmLote` leem e gravam **só o(s) arquivo(s) do mês afetado**, não a coleção inteira — é isso que evita reescrever anos de dados a cada pequena edição.
- **Por que não "carregamento sob demanda só do mês visível"**: Dashboard/Gastos/Ganhos mostram um mês por vez, mas Histórico (todas as transações, de qualquer mês) e a geração automática de recorrências de itens fixos (precisa achar a última ocorrência de cada série, que pode ter sido gerada há vários meses) precisam do histórico completo de qualquer forma — carregar só o mês visível economizaria a leitura de disco na tela de Gastos/Ganhos, mas a mesma leitura completa aconteceria de novo (ou teria que ser antecipada) assim que Histórico ou a geração de recorrências rodassem, o que acontece toda vez que o app abre. Por isso a otimização desta etapa focou em tornar a leitura completa mais rápida (índice + paralelismo) em vez de evitá-la — para o volume realista de um app financeiro pessoal (milhares de itens ao longo de muitos anos), isso já é suficiente; paginar/ler sob demanda por tela é uma mudança maior, possível no futuro se o volume de dados um dia justificar.

## Decisões de modelagem (e por quê)

- **`id`**: todo item tem um `id` único gerado com `crypto.randomUUID()` (recurso nativo do navegador/WebView, sem precisar de biblioteca externa). É necessário para permitir editar/excluir um item específico depois.
- **`data`**: sempre no formato `"AAAA-MM-DD"` (ISO 8601). Esse formato ordena corretamente como texto e evita ambiguidade entre DD/MM e MM/DD.
- **`valor`**: número decimal simples (ex: `342.75`), representando reais. Ponto de atenção técnico: números decimais podem ter pequenos erros de arredondamento em operações repetidas de soma. Se isso incomodar no futuro, a alternativa é guardar valores em centavos (inteiro, ex: `34275`). Por ora mantive decimal por ser mais legível no JSON — me avise se preferir centavos.
- **"Gastos fixos" e "parcelamentos" não são arquivos separados.** Eles são representados dentro do próprio modelo de `gasto`, usando os campos `fixo`/`fixoId` e `parcela`:
  - Um **gasto fixo** (ex: aluguel) é um gasto com `"fixo": true` e um `fixoId` (uuid) compartilhado por toda a série. A partir da Etapa 13, o app **gera sozinho** uma nova ocorrência todo mês (mesmo dia, ajustado para meses mais curtos), sempre que o mês atual ou o mês que você está visualizando ainda não tiver uma. Por padrão, editar uma ocorrência afeta só ela; desmarcar "fixo" só impede novas gerações futuras, não apaga as existentes. Ao editar um gasto ou ganho que já faz parte de uma série fixa, o modal oferece a opção **"Aplicar edições às próximas ocorrências desta série"**: título, valor, observações (e, no caso de gastos, categoria e salário responsável) passam a valer para todas as ocorrências FUTURAS da mesma série (data depois da que está sendo editada) e para as novas que ainda serão geradas — as ocorrências já passadas, e a data/mesReferencia/status pago/recebido de cada uma, nunca são alterados por essa opção.
  - Um **parcelamento** (ex: uma compra em 3x) vira várias entradas em `gastos.json`, uma por parcela, todas compartilhando o mesmo `parcelamentoId` dentro do campo `parcela`. Isso permite identificar quais gastos pertencem à mesma compra parcelada. Diferente de "fixo", parcelamentos têm quantidade definida e não geram novas parcelas além das criadas na hora. `categoriaId` e `observacoes` (ambos opcionais) podem ser escolhidos uma vez, no cadastro do parcelamento — e são aplicados a todas as parcelas geradas.
  - **Excluir um gasto/ganho fixo ou uma parcela** pergunta o escopo: "somente esta ocorrência/parcela", "esta e as futuras da mesma série" (por data, incluindo a própria) ou "todas as ocorrências/parcelas". Um gasto/ganho avulso (sem `fixoId` nem `parcela`) continua com a confirmação simples de sempre.
- **`mesReferencia`** (Etapa 13, só em `gasto`): a data (`data`) de um gasto é quando ele foi feito/vence; `mesReferencia` (`"AAAA-MM"`) é **qual mês do salário** (dia 15 ou dia 30, indicado por `salarioResponsavel`) vai pagar essa conta — podem ser meses diferentes (ex: comprou dia 28/07 mas escolheu pagar com o salário de 15/08). Numa parcela, `mesReferencia` é sempre automaticamente igual ao mês da própria parcela.
- **Mês de exibição (Dashboard/Gastos/Ganhos)**: as três páginas mostram um mês por vez (controlado por `src/js/estadoMes.js`, compartilhado entre elas). Gastos são filtrados por `mesReferencia`; ganhos são filtrados pelo mês da própria `data`.
- **"Sumir quando pago/recebido"**: um gasto/ganho já marcado como pago/recebido, com data anterior a hoje, some da lista das páginas Gastos/Ganhos (mas continua no arquivo — nada é apagado). Não há como revelá-los de volta nessas duas páginas; a página Histórico mostra todas as transações de qualquer mês/status, incluindo essas.

## `ganhos.json`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `titulo` | string | nome do ganho |
| `data` | string (`AAAA-MM-DD`) | data de recebimento |
| `valor` | number | valor em reais |
| `recebido` | boolean | se já caiu na conta (Etapa 13) |
| `fixo` | boolean | se é recorrente, gerado todo mês (Etapa 13) |
| `fixoId` | `null` ou string (uuid) | agrupa as ocorrências de um mesmo ganho fixo (Etapa 13) |
| `observacoes` | string | texto livre, opcional |

```json
{
  "versao": 1,
  "ganhos": [
    {
      "id": "b3f1a2c4-1111-4a2b-9c3d-000000000001",
      "titulo": "Salário",
      "data": "2026-07-10",
      "valor": 2500.00,
      "recebido": true,
      "fixo": true,
      "fixoId": "f1a2b3c4-5555-4a2b-9c3d-000000000010",
      "observacoes": ""
    },
    {
      "id": "b3f1a2c4-1111-4a2b-9c3d-000000000002",
      "titulo": "Freela de design",
      "data": "2026-07-18",
      "valor": 450.00,
      "recebido": false,
      "fixo": false,
      "fixoId": null,
      "observacoes": "Combinado por indicação da Marina"
    }
  ]
}
```

## `gastos.json`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `titulo` | string | nome do gasto |
| `data` | string (`AAAA-MM-DD`) | data do gasto (quando foi feito/vence) |
| `valor` | number | valor em reais |
| `salarioResponsavel` | `"dia15"` \| `"dia30"` | qual salário paga essa conta |
| `mesReferencia` | string (`"AAAA-MM"`) | **mês** desse salário responsável (Etapa 13) — ex: `"dia30"` + `"2026-08"` = "salário do dia 30 de agosto" |
| `pago` | boolean | se já foi pago (não afeta mais o cálculo de saldo — ver Dashboard) |
| `fixo` | boolean | se é um gasto fixo/recorrente |
| `fixoId` | `null` ou string (uuid) | agrupa as ocorrências de um mesmo gasto fixo (Etapa 13) |
| `parcela` | `null` ou objeto | preenchido só se for parte de um parcelamento |
| `categoriaId` | `null` ou string (uuid) | referência a uma categoria em `categorias.json` (sistema de categorias) — `null` = sem categoria |
| `carteiraId` | `null` ou string (uuid) | referência a uma carteira em `carteiras.json` (sistema de carteiras/benefícios) — `null` = carteira principal, mesmo comportamento de antes |
| `observacoes` | string | texto livre, opcional |

```json
{
  "versao": 1,
  "gastos": [
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000001",
      "titulo": "Supermercado",
      "data": "2026-07-15",
      "valor": 342.75,
      "salarioResponsavel": "dia15",
      "mesReferencia": "2026-07",
      "pago": true,
      "fixo": false,
      "fixoId": null,
      "parcela": null,
      "categoriaId": "b1c2d3e4-0001-4a2b-9c3d-000000000001",
      "observacoes": ""
    },
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000002",
      "titulo": "Aluguel",
      "data": "2026-07-25",
      "valor": 1200.00,
      "salarioResponsavel": "dia30",
      "mesReferencia": "2026-07",
      "pago": true,
      "fixo": true,
      "fixoId": "d1e2f3a4-6666-4a2b-9c3d-000000000020",
      "parcela": null,
      "categoriaId": "b1c2d3e4-0002-4a2b-9c3d-000000000002",
      "observacoes": "Reajuste previsto em outubro"
    },
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000003",
      "titulo": "Notebook novo",
      "data": "2026-07-28",
      "valor": 500.00,
      "salarioResponsavel": "dia15",
      "mesReferencia": "2026-08",
      "pago": false,
      "fixo": false,
      "fixoId": null,
      "parcela": {
        "numero": 1,
        "total": 3,
        "parcelamentoId": "d8f3c6e7-3333-4a2b-9c3d-00000000000a"
      },
      "categoriaId": null,
      "observacoes": ""
    }
  ]
}
```

**Compatibilidade com dados antigos**: arquivos gravados antes da Etapa 13 não têm `mesReferencia`/`fixoId`/`recebido`/`fixo`. Ao carregar, o app preenche automaticamente: `mesReferencia` = mês da própria `data` do gasto; `fixoId` = `null`; ganhos antigos ganham `recebido: true` (preserva o comportamento anterior, já que antes todo ganho cadastrado era tratado como recebido) e `fixo: false`. Gastos gravados antes do sistema de categorias não têm `categoriaId` — ao carregar, ganham `categoriaId: null` (sem categoria, comportamento equivalente a antes). Gastos gravados antes do sistema de carteiras não têm `carteiraId` — ao carregar, ganham `carteiraId: null` (carteira principal, comportamento equivalente a antes). Itens gravados antes do campo de observações ganham `observacoes: ""` ao carregar. Nada precisa ser feito manualmente.

**Recorrências e categoria/observações**: quando uma nova ocorrência de um gasto ou ganho fixo é gerada automaticamente (ver seção acima), ela herda o `categoriaId`/`carteiraId` (só gasto) e as `observacoes` da ocorrência anterior, do mesmo jeito que já herda título e valor.

**"Aplicar edições às próximas ocorrências"**: ao editar um gasto/ganho que já faz parte de uma série fixa, o checkbox do modal propaga título, valor, observações (e, no caso de gastos, categoria, carteira e salário responsável) para as ocorrências FUTURAS da mesma série (data depois da que está sendo editada) — nunca mexe nas já passadas, nem no status pago/recebido/data/mesReferencia de cada uma.

**Gasto pago com uma carteira de benefício** (`carteiraId` aponta para uma carteira `tipo: "beneficio"` em `carteiras.json`, ex: Ticket Alimentação): esse gasto é **excluído de todo cálculo/gráfico/lista "financeiro principal"** — total gasto e saldo do Dashboard, os 6 gráficos, a página Histórico, e o resumo de "GASTOS"/"Saldo restante" da exportação em texto para IA (regra de ouro do sistema de carteiras: dinheiro de benefício não é dinheiro principal). Também não aparece na tabela/total da própria página Gastos (que mostra só financeiro principal) — só fica visível na página do benefício correspondente. Por não ter "salário responsável", `mesReferencia` é sempre igual ao mês da própria `data`, e o formulário força `fixo: false` (a recorrência de um benefício é a do crédito mensal, um conceito separado — ver `carteiras.json` abaixo).

## `lembretes.json`

Campos de cada lembrete, conforme especificado na Etapa 11:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `titulo` | string | o que precisa ser feito/lembrado |
| `data` | string (`AAAA-MM-DD`) | data prevista |
| `valor` | number | quanto dinheiro isso deve custar (valor previsto) |
| `concluido` | boolean | se o lembrete já foi resolvido |
| `observacoes` | string | texto livre, opcional |

```json
{
  "versao": 1,
  "lembretes": [
    {
      "id": "e9a4d7f8-4444-4a2b-9c3d-000000000001",
      "titulo": "Marcar psiquiatra",
      "data": "2026-08-01",
      "valor": 250.00,
      "concluido": false,
      "observacoes": "Levar carteirinha do convênio"
    },
    {
      "id": "e9a4d7f8-4444-4a2b-9c3d-000000000002",
      "titulo": "Renovar seguro do carro",
      "data": "2026-08-15",
      "valor": 480.00,
      "concluido": false,
      "observacoes": ""
    }
  ]
}
```

**Compatibilidade com dados antigos**: lembretes gravados antes do campo de observações ganham `observacoes: ""` ao carregar.

**Importante**: o `valor` de um lembrete é dinheiro que **precisará ser reservado no futuro** — ele entra no cálculo de "Previsão futura" do dashboard, mas **nunca** vira um gasto pago nem é somado ao "Total gasto". Lembretes e gastos continuam sendo coleções completamente separadas; não existe conversão automática de um para o outro.

**Indicador de "tempo restante"**: não é um campo salvo no arquivo — é calculado na tela (`calcularIndicadorTempo` em `lembretes.js`) toda vez que a lista é renderizada, a partir de `data` e da data de hoje. Por isso um lembrete de daqui a 2 meses já aparece na lista normalmente (a página nunca filtrou por mês) e o texto do indicador (`Faltam N meses` / `Faltam N dias` / `Próximo` / `Atrasado`) muda sozinho conforme os dias passam, sem precisar editar o lembrete.

## `metas.json` (página Metas)

Meta é uma **wishlist simples de produtos**, sem acompanhamento de progresso — não existe campo de "quanto já foi guardado" nem aporte automático (removidos a pedido do usuário; ver `CHANGELOG.md`).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `nome` | string | **único campo obrigatório** — nome do produto/item da wishlist |
| `valorDesejado` | number \| `null` | preço do produto — opcional; `null` = "não informado" (nunca exibido como R$ 0,00) |
| `loja` | string \| `null` | onde pretende comprar — opcional |
| `link` | string \| `null` | link da página do produto — opcional; validado como URL http(s) antes de renderizar (`urlSegura` em `utils/formatadores.js`), tanto na hora de salvar (`type="url"` do navegador) quanto na hora de exibir (defesa contra dado gravado fora da interface) |
| `imagemUrl` | string \| `null` | URL de uma imagem do produto — opcional; mesma validação de `link`. Se a imagem não carregar (URL fora do ar, 404 etc.), a tela cai num placeholder neutro em vez de mostrar um ícone de imagem quebrada |
| `prioridade` | `"alta"` \| `"media"` \| `"baixa"` \| `"sem_definida"` | usada para ordenar os cartões na tela. `"sem_definida"` é o valor padrão de uma meta nova e é uma opção distinta de `"baixa"` (selo tracejado, não confundir as duas) |
| `observacoes` | string | texto livre, opcional |

```json
{
  "versao": 1,
  "metas": [
    {
      "id": "a1b2c3d4-7777-4a2b-9c3d-000000000001",
      "nome": "Fone de ouvido sem fio",
      "valorDesejado": 350.00,
      "loja": "Amazon",
      "link": "https://exemplo.com/produto",
      "imagemUrl": "https://exemplo.com/produto.jpg",
      "prioridade": "media",
      "observacoes": "Esperar a Black Friday"
    }
  ]
}
```

**Não é particionado por mês** (diferente de ganhos/gastos/lembretes): uma meta não tem uma data/ocorrência mensal, é um item que o usuário edita diretamente ao longo do tempo — continua sendo um arquivo único, como `configuracoes.json`.

**Visualização (Cards/Lista)**: não é um campo do item — é uma preferência de interface só, guardada em `localStorage` (chave `nanawallet:metas:visualizacao`), não em `metas.json`/Supabase. Cada aparelho lembra sua própria escolha.

**Compatibilidade com dados antigos**: metas salvas antes desta etapa podem ter `valorGuardado`/`aporteMensal`/`ultimoAporteAplicado` no arquivo (funcionalidade removida) — esses campos ficam inofensivamente ali sem uso, nada é migrado/apagado automaticamente, e o app nunca mais lê nem grava neles. Metas salvas antes dos campos de produto (`loja`/`link`/`imagemUrl`) simplesmente não têm essas colunas preenchidas (`null`) — continuam funcionando normalmente, só sem essas informações extras até serem editadas.

## `categorias.json` (sistema de categorias de despesas)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único, referenciado por `gasto.categoriaId` |
| `nome` | string | nome da categoria |
| `emoji` | string | emoji usado como elemento visual principal |
| `cor` | string (hex, ex: `"#F2A65A"`) | cor pastel personalizada da categoria |

```json
{
  "versao": 1,
  "categorias": [
    { "id": "b1c2d3e4-0001-4a2b-9c3d-000000000001", "nome": "Delivery", "emoji": "🍔", "cor": "#F2A65A" },
    { "id": "b1c2d3e4-0002-4a2b-9c3d-000000000002", "nome": "Mercado", "emoji": "🛒", "cor": "#8FD694" }
  ]
}
```

**Não é particionado por mês** (mesmo motivo de `metas.json`/`configuracoes.json`): uma categoria não tem data/ocorrência mensal, é uma lista pequena e estável ao longo do tempo.

**18 categorias padrão carregadas automaticamente na primeira inicialização** (arquivo `categorias.json` ainda não existe): Delivery, Mercado, Comer fora, Hobbies, Lazer, Assinaturas, Comprinhas, Beleza, Saúde, Transporte, Casa, Contas, Presentes, Pets, Trabalho, Viagens, Imprevistos e Mimos — pensadas para refletir como as pessoas realmente encaram os próprios gastos no dia a dia, não a lista genérica de "Alimentação/Transporte/Outros" de apps financeiros tradicionais. Instalações já existentes (arquivo já presente, mesmo vazio) não são afetadas — o seed só acontece uma vez, na criação do arquivo.

**Preparado para categorias personalizadas numa etapa futura**: `CategoryService` (em `src/js/servicos/CategoryService.js`) já herda o CRUD genérico completo de `ColecaoService` (`salvar`/`remover`/`salvarEmLote`/`listar`) — criar uma tela de "gerenciar categorias" no futuro não vai exigir nenhuma mudança na camada de dados/serviços, só a interface.

**Onde a categoria aparece na interface** (implementado): seletor customizado no formulário de gasto (criar/editar), coluna "Categoria" nas tabelas de Gastos e Histórico, filtro por categoria em Gastos e Histórico, e um card "Gastos por categoria" + "Estatísticas por categoria" no Dashboard — todos referentes ao **mês selecionado** (mesmo critério de `mesReferencia` usado no resto do Dashboard/Gastos), não ao histórico completo. Gastos sem `categoriaId` entram nesses cálculos como "Sem categoria" (não são ignorados) — assim os totais mostrados batem com o "Total gasto" do mês.

## `carteiras.json` (sistema de carteiras/benefícios — Ticket Alimentação e futuros benefícios)

Uma carteira representa de onde o dinheiro de um gasto saiu. Carteiras do tipo `"dinheiro"` (ex: Conta bancária, Dinheiro) são só uma forma de organizar/rotular — continuam contando normalmente em "financeiro principal", exatamente como antes deste sistema existir. Carteiras do tipo `"beneficio"` (ex: Ticket Alimentação) são **isoladas por completo** do dinheiro principal: um gasto pago com uma carteira de benefício nunca soma em salário, renda, saldo bancário, gráficos, histórico ou exportação (ver nota na seção `gastos.json` acima) — regra de ouro do sistema, para não confundir dinheiro de benefício com dinheiro de verdade.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único, referenciado por `gasto.carteiraId` |
| `nome` | string | nome da carteira |
| `tipo` | `"dinheiro"` \| `"beneficio"` | `"dinheiro"` conta como financeiro principal; `"beneficio"` é isolada |
| `emoji` | string | emoji usado como elemento visual (mesmo padrão de categoria) |
| `cor` | string (hex) | cor da carteira |
| `ativa` | boolean | carteiras inativas não aparecem no seletor do formulário de gasto |
| `beneficio` | `null` ou objeto | só preenchido quando `tipo === "beneficio"` — configuração de recorrência (ver abaixo) |

Quando `tipo === "beneficio"`, o objeto `beneficio` tem:

| Campo | Tipo | Descrição |
|---|---|---|
| `valorMensal` | number | valor do crédito mensal (ex: 990.00) |
| `diaRecebimento` | number (1-31) | dia do mês em que o benefício é creditado |
| `recorrente` | boolean | se o crédito mensal é gerado automaticamente todo mês |
| `acumulaSaldo` | boolean | se o saldo não utilizado passa para o mês seguinte |
| `ativoDesde` | `null` ou string (`AAAA-MM-DD`) | a partir de quando a recorrência automática gera créditos — gravado sozinho na primeira vez que "recorrente" é ligado, nunca creditando retroativamente meses anteriores a essa data |

```json
{
  "versao": 1,
  "carteiras": [
    { "id": "...", "nome": "Conta bancária", "tipo": "dinheiro", "emoji": "🏦", "cor": "#9EC5FE", "ativa": true, "beneficio": null },
    { "id": "...", "nome": "Dinheiro", "tipo": "dinheiro", "emoji": "💵", "cor": "#8FD694", "ativa": true, "beneficio": null },
    {
      "id": "...",
      "nome": "Ticket Alimentação",
      "tipo": "beneficio",
      "emoji": "🍽️",
      "cor": "#F7C873",
      "ativa": false,
      "beneficio": { "valorMensal": 990.0, "diaRecebimento": 1, "recorrente": true, "acumulaSaldo": true, "ativoDesde": "2026-08-01" }
    }
  ]
}
```

**Não é particionado por mês** (mesmo motivo de `metas.json`/`categorias.json`): lista pequena e estável, editada diretamente pelo usuário.

**3 carteiras padrão carregadas automaticamente na primeira inicialização** (arquivo `carteiras.json` ainda não existe): "Conta bancária" e "Dinheiro" (`tipo: "dinheiro"`, ativas) e "Ticket Alimentação" (`tipo: "beneficio"`, criada **inativa** — só passa a aparecer no seletor de carteira do formulário de gasto depois de configurada e ativada na página própria "Ticket Alimentação", implementada na Etapa 2). Instalações já existentes não são afetadas.

**Onde a carteira aparece na interface**: página própria "Ticket Alimentação" (menu lateral) com card de configuração (edita `nome` — fixo —, `beneficio.valorMensal`, `beneficio.diaRecebimento`, `beneficio.recorrente`, `beneficio.acumulaSaldo` e `ativa`), saldo/recebido/gasto do mês selecionado (Etapa 2), barra de progresso de utilização, gastos por categoria e a lista de movimentações do mês (entradas e gastos combinados), geração automática do crédito mensal e saldo acumulado entre meses (Etapa 3), e os cards "Próximo recebimento" e "Ritmo de consumo" (Etapa 4, ver abaixo). O seletor de carteira do formulário de gasto (Etapa 1) só lista carteiras `ativa: true`, repopulado a cada abertura do modal — necessário porque `carteiraId` pode ser ativado depois do app já ter iniciado, na própria página do benefício. Também aparece um card "Benefícios" no Dashboard principal, com o saldo de cada carteira de benefício ativa, claramente separado dos totais de financeiro principal.

**Próximo recebimento e ritmo de consumo (Etapa 4)**: `calcularProximoRecebimento`/`calcularRitmoConsumo` (em `src/js/carteiras.js`) sempre calculam a partir de **hoje** (não do mês navegado na tela — a previsão é sobre o momento real, independente de qual mês está sendo visualizado). "Próximo recebimento" só aparece para uma carteira `ativa` e `recorrente` (sem isso não existe uma data prevista confiável — nunca mostra uma previsão falsa). "Ritmo de consumo" (🟢 dentro do ritmo / 🟡 gastando acima do esperado / 🔴 saldo pode acabar antes do próximo crédito) fica oculto quando não há dados suficientes: benefício não recorrente/inativo, hoje é o próprio dia do crédito (evita divisão por zero), ou ainda não existe nenhuma entrada registrada para servir de início do período de gasto. O "gasto médio diário" é calculado desde a última entrada registrada até hoje; o "valor disponível por dia" usa o saldo **atual** (já considerando acumulado, se houver) dividido pelos dias restantes até o próximo crédito — nunca o valor do próximo crédito, que ainda não chegou.

**Preparado para outros tipos de benefício no futuro** (Vale Cultura, Vale Refeição separado, etc.): `CarteiraService` (em `src/js/servicos/CarteiraService.js`) só herda o CRUD genérico de `ColecaoService`, sem nenhuma lógica específica de Ticket Alimentação — nenhum código do app verifica `nome === "Ticket Alimentação"`, só `tipo === "beneficio"`. Adicionar um novo benefício no futuro é criar uma nova carteira com esse tipo, sem mudar a camada de dados/serviços.

## `carteira_movimentacoes.json` (entradas/créditos de carteiras de benefício)

Guarda só as **entradas** (créditos) de uma carteira de benefício — por exemplo, o crédito mensal do Ticket Alimentação. **Nunca é tratado como um ganho** (regra de ouro do sistema de carteiras: dinheiro de benefício não é renda) — por isso é uma coleção separada de `ganhos.json`, não um `ganho` com uma flag. Gastos feitos com uma carteira de benefício continuam em `gastos.json` normalmente (só marcados com `carteiraId`) — não são duplicados aqui.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `carteiraId` | string (uuid) | referência à carteira de benefício creditada |
| `valor` | number | valor do crédito |
| `data` | string (`AAAA-MM-DD`) | data do crédito |
| `automatica` | boolean | se foi gerada sozinha pela recorrência mensal, ou lançada manualmente |
| `observacoes` | string | texto livre, opcional |

**Não é particionado por mês**: o volume é pequeno (poucos créditos por ano, por carteira de benefício) — mesmo raciocínio de `metas.json`/`categorias.json`.

**Lançamento manual** (card "Lançar recebimento manualmente" na página Ticket Alimentação, Etapa 2) — todo registro criado por essa tela tem `automatica: false`.

**Geração automática (Etapa 3)**: para cada carteira de benefício `ativa` com `beneficio.recorrente: true`, `CarteiraEntradaService.sincronizarEntradas(carteiras, mesAlvo)` (chamado ao abrir a página e sempre que o mês navegado muda, mesmo padrão de `sincronizarRecorrencias` em gastos.js/ganhos.js) gera uma entrada com `automatica: true` para cada mês entre `beneficio.ativoDesde` e `mesAlvo` que ainda não tenha NENHUMA entrada (nem manual, nem automática) — evita duplicar o crédito caso a usuária já tenha lançado manualmente aquele mês. `beneficio.diaRecebimento` é ajustado para o último dia válido do mês quando não existir (ex: dia 31 num mês de 30 dias ou fevereiro) — implementado em `src/js/utils/recorrenciaCarteira.js`, calculado do zero a cada mês (não encadeado a partir da ocorrência anterior), então não sofre do bug de "ficar preso no dia 28" já corrigido na recorrência de gastos/ganhos fixos.

**Saldo acumulado (Etapa 3)**: `calcularSaldoCarteira` (em `src/js/carteiras.js`) decide, a partir de `beneficio.acumulaSaldo`, se o saldo de meses anteriores (tudo antes do mês selecionado) soma ao recebido do mês antes de descontar o gasto (`acumulaSaldo: true`) ou se cada mês começa zerado (`acumulaSaldo: false`, padrão se o campo estiver ausente). Usada tanto pela página Ticket Alimentação quanto pelo card "Benefícios" do Dashboard, para os dois nunca divergirem.

## `configuracoes.json`

Você não pediu nenhuma configuração específica ainda, então mantive vazio — este arquivo só ganha campos quando houver uma necessidade concreta (ex: dia do mês do salário, tema, etc.):

```json
{
  "versao": 1,
  "configuracoes": {}
}
```

## Apagar todos os dados

Página Exportação → "Apagar todos os dados": zera gastos, ganhos, lembretes, metas e movimentações de carteira de benefício (`carteira_movimentacoes.json`, todos os meses), mantendo `configuracoes.json`, `categorias.json` e `carteiras.json` intactos (categorias e carteiras são taxonomia/configuração, não um registro financeiro do usuário — mesmo raciocínio de não apagar configurações). Pede confirmação dupla e cria um backup automático completo antes de apagar (mesmo mecanismo de `dados/backup.js`), então é reversível pela tela de Exportação → "Backups automáticos recentes" logo em seguida.

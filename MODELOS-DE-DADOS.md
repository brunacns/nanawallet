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
  - Um **gasto fixo** (ex: aluguel) é um gasto com `"fixo": true` e um `fixoId` (uuid) compartilhado por toda a série. A partir da Etapa 13, o app **gera sozinho** uma nova ocorrência todo mês (mesmo dia, ajustado para meses mais curtos), sempre que o mês atual ou o mês que você está visualizando ainda não tiver uma. Por padrão, editar uma ocorrência afeta só ela; desmarcar "fixo" só impede novas gerações futuras, não apaga as existentes. Ao editar um gasto ou ganho que já faz parte de uma série fixa, o modal oferece a opção **"Aplicar às próximas ocorrências"**: título, valor (e, no caso de gastos, o salário responsável) passam a valer para todas as ocorrências FUTURAS da mesma série (data depois da que está sendo editada) e para as novas que ainda serão geradas — as ocorrências já passadas, e o status pago/recebido de cada uma, nunca são alterados por essa opção.
  - Um **parcelamento** (ex: uma compra em 3x) vira várias entradas em `gastos.json`, uma por parcela, todas compartilhando o mesmo `parcelamentoId` dentro do campo `parcela`. Isso permite identificar quais gastos pertencem à mesma compra parcelada. Diferente de "fixo", parcelamentos têm quantidade definida e não geram novas parcelas além das criadas na hora.
- **`mesReferencia`** (Etapa 13, só em `gasto`): a data (`data`) de um gasto é quando ele foi feito/vence; `mesReferencia` (`"AAAA-MM"`) é **qual mês do salário** (dia 10 ou dia 25, indicado por `salarioResponsavel`) vai pagar essa conta — podem ser meses diferentes (ex: comprou dia 28/07 mas escolheu pagar com o salário de 10/08). Numa parcela, `mesReferencia` é sempre automaticamente igual ao mês da própria parcela.
- **Mês de exibição (Dashboard/Gastos/Ganhos)**: as três páginas mostram um mês por vez (controlado por `src/js/estadoMes.js`, compartilhado entre elas). Gastos são filtrados por `mesReferencia`; ganhos são filtrados pelo mês da própria `data`.
- **"Sumir quando pago/recebido"**: um gasto/ganho já marcado como pago/recebido, com data anterior a hoje, some da lista por padrão (mas continua no arquivo — nada é apagado). Uma caixinha "Mostrar histórico" no topo da página revela esses itens de novo.

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
      "fixoId": "f1a2b3c4-5555-4a2b-9c3d-000000000010"
    },
    {
      "id": "b3f1a2c4-1111-4a2b-9c3d-000000000002",
      "titulo": "Freela de design",
      "data": "2026-07-18",
      "valor": 450.00,
      "recebido": false,
      "fixo": false,
      "fixoId": null
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
| `salarioResponsavel` | `"dia10"` \| `"dia25"` | qual salário paga essa conta |
| `mesReferencia` | string (`"AAAA-MM"`) | **mês** desse salário responsável (Etapa 13) — ex: `"dia25"` + `"2026-08"` = "salário do dia 25 de agosto" |
| `pago` | boolean | se já foi pago (não afeta mais o cálculo de saldo — ver Dashboard) |
| `fixo` | boolean | se é um gasto fixo/recorrente |
| `fixoId` | `null` ou string (uuid) | agrupa as ocorrências de um mesmo gasto fixo (Etapa 13) |
| `parcela` | `null` ou objeto | preenchido só se for parte de um parcelamento |

```json
{
  "versao": 1,
  "gastos": [
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000001",
      "titulo": "Supermercado",
      "data": "2026-07-15",
      "valor": 342.75,
      "salarioResponsavel": "dia10",
      "mesReferencia": "2026-07",
      "pago": true,
      "fixo": false,
      "fixoId": null,
      "parcela": null
    },
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000002",
      "titulo": "Aluguel",
      "data": "2026-07-25",
      "valor": 1200.00,
      "salarioResponsavel": "dia25",
      "mesReferencia": "2026-07",
      "pago": true,
      "fixo": true,
      "fixoId": "d1e2f3a4-6666-4a2b-9c3d-000000000020",
      "parcela": null
    },
    {
      "id": "c7e2b5d6-2222-4a2b-9c3d-000000000003",
      "titulo": "Notebook novo",
      "data": "2026-07-28",
      "valor": 500.00,
      "salarioResponsavel": "dia10",
      "mesReferencia": "2026-08",
      "pago": false,
      "fixo": false,
      "fixoId": null,
      "parcela": {
        "numero": 1,
        "total": 3,
        "parcelamentoId": "d8f3c6e7-3333-4a2b-9c3d-00000000000a"
      }
    }
  ]
}
```

**Compatibilidade com dados antigos**: arquivos gravados antes da Etapa 13 não têm `mesReferencia`/`fixoId`/`recebido`/`fixo`. Ao carregar, o app preenche automaticamente: `mesReferencia` = mês da própria `data` do gasto; `fixoId` = `null`; ganhos antigos ganham `recebido: true` (preserva o comportamento anterior, já que antes todo ganho cadastrado era tratado como recebido) e `fixo: false`. Nada precisa ser feito manualmente.

## `lembretes.json`

Campos de cada lembrete, conforme especificado na Etapa 11:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `titulo` | string | o que precisa ser feito/lembrado |
| `data` | string (`AAAA-MM-DD`) | data prevista |
| `valor` | number | quanto dinheiro isso deve custar (valor previsto) |
| `concluido` | boolean | se o lembrete já foi resolvido |

```json
{
  "versao": 1,
  "lembretes": [
    {
      "id": "e9a4d7f8-4444-4a2b-9c3d-000000000001",
      "titulo": "Marcar psiquiatra",
      "data": "2026-08-01",
      "valor": 250.00,
      "concluido": false
    },
    {
      "id": "e9a4d7f8-4444-4a2b-9c3d-000000000002",
      "titulo": "Renovar seguro do carro",
      "data": "2026-08-15",
      "valor": 480.00,
      "concluido": false
    }
  ]
}
```

**Importante**: o `valor` de um lembrete é dinheiro que **precisará ser reservado no futuro** — ele entra no cálculo de "Previsão futura" do dashboard, mas **nunca** vira um gasto pago nem é somado ao "Total gasto". Lembretes e gastos continuam sendo coleções completamente separadas; não existe conversão automática de um para o outro.

**Indicador de "tempo restante"**: não é um campo salvo no arquivo — é calculado na tela (`calcularIndicadorTempo` em `lembretes.js`) toda vez que a lista é renderizada, a partir de `data` e da data de hoje. Por isso um lembrete de daqui a 2 meses já aparece na lista normalmente (a página nunca filtrou por mês) e o texto do indicador (`Faltam N meses` / `Faltam N dias` / `Próximo` / `Atrasado`) muda sozinho conforme os dias passam, sem precisar editar o lembrete.

## `metas.json` (página Metas)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | identificador único |
| `nome` | string | nome da meta/item da wishlist |
| `valorDesejado` | number | quanto custa/quanto se quer juntar |
| `valorGuardado` | number | quanto já foi guardado até agora |
| `prioridade` | `"alta"` \| `"media"` \| `"baixa"` | usada para ordenar os cartões na tela |
| `observacoes` | string | texto livre, opcional |
| `aporteMensal` | number | valor creditado automaticamente em `valorGuardado` a cada mês; `0` = sem aporte automático |
| `ultimoAporteAplicado` | `null` ou string (`"AAAA-MM"`) | último mês em que o aporte automático já foi aplicado |

```json
{
  "versao": 1,
  "metas": [
    {
      "id": "a1b2c3d4-7777-4a2b-9c3d-000000000001",
      "nome": "Viagem para a praia",
      "valorDesejado": 2000.00,
      "valorGuardado": 500.00,
      "prioridade": "baixa",
      "observacoes": "Ir em janeiro",
      "aporteMensal": 200.00,
      "ultimoAporteAplicado": "2026-07"
    }
  ]
}
```

**Não é particionado por mês** (diferente de ganhos/gastos/lembretes): uma meta não tem uma data/ocorrência mensal, é um item que o usuário edita diretamente ao longo do tempo — continua sendo um arquivo único, como `configuracoes.json`. Porcentagem (`valorGuardado / valorDesejado`) e o selo "Concluída" são **calculados na tela**, não gravados no arquivo, para nunca ficarem desatualizados.

**Aporte mensal automático** (opcional): se `aporteMensal` for maior que zero, toda vez que a página Metas é aberta o app credita esse valor em `valorGuardado`, uma vez para cada mês real que se passou desde `ultimoAporteAplicado` (ex: app fechado por 3 meses = credita os 3 de uma vez na próxima abertura). Ativar o aporte automático (criar a meta com ele já preenchido, ou ligá-lo numa edição) **não credita nada retroativamente** — `ultimoAporteAplicado` começa no mês em que foi ativado, e o primeiro crédito automático só acontece a partir do mês seguinte. Para de creditar assim que `valorGuardado` atinge `valorDesejado` (a meta não continua crescendo indefinidamente depois de concluída). Desligar o aporte (deixar o campo em branco) zera `aporteMensal` e `ultimoAporteAplicado`; religar depois recomeça a contagem do zero, sem lembrar de quando estava ligado antes.

**Compatibilidade com dados antigos**: metas salvas antes desta funcionalidade não têm `aporteMensal`/`ultimoAporteAplicado`. Ao carregar, o app preenche automaticamente `aporteMensal: 0` e `ultimoAporteAplicado: null` (sem aporte automático, comportamento idêntico ao de antes).

## `configuracoes.json`

Você não pediu nenhuma configuração específica ainda, então mantive vazio — este arquivo só ganha campos quando houver uma necessidade concreta (ex: dia do mês do salário, tema, etc.):

```json
{
  "versao": 1,
  "configuracoes": {}
}
```

## Apagar todos os dados

Página Exportação → "Apagar todos os dados": zera gastos, ganhos, lembretes e metas (todos os meses), mantendo `configuracoes.json` intacto. Pede confirmação dupla e cria um backup automático completo antes de apagar (mesmo mecanismo de `dados/backup.js`), então é reversível pela tela de Exportação → "Backups automáticos recentes" logo em seguida.

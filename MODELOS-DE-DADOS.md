# Modelos de dados do aplicativo

Este documento descreve o formato de cada item guardado nos arquivos JSON (ganhos, gastos, lembretes, configurações). Ele existe para que qualquer tela ou lógica futura (feita por você ou por uma IA) saiba exatamente qual formato gravar e ler, sem precisar adivinhar.

Nenhum dado de exemplo abaixo foi gravado de verdade nos arquivos reais do app — são apenas ilustrações do formato. Os arquivos reais continuam vazios até você começar a cadastrar coisas pela interface.

## Onde os dados ficam no disco (a partir desta etapa)

Ganhos, gastos e lembretes crescem indefinidamente com o tempo (uma ocorrência nova todo mês, ano após ano), então, em vez de um único JSON gigante por coleção, cada uma é **particionada em um arquivo por mês**:

```
%LOCALAPPDATA%\com.financeiro.desktop\dados\
  gastos\2026\07.json
  gastos\2026\08.json
  ganhos\2026\07.json
  lembretes\2026\08.json
  configuracoes.json          <- continua um arquivo único
```

- **Chave do mês de cada coleção**: gastos usam `mesReferencia`; ganhos e lembretes usam o mês da própria `data`. Ver [src/js/dados/armazenamento.js](src/js/dados/armazenamento.js).
- **`configuracoes.json` não é particionado**: é uma coleção pequena e sem crescimento ao longo do tempo (preferências do usuário), então um arquivo único continua sendo a escolha certa — não seguimos a estrutura de pastas por mês aqui de propósito.
- **Migração automática**: se o app encontrar `ganhos.json`/`gastos.json`/`lembretes.json` no formato antigo (um arquivo só com tudo, de antes desta etapa), ele converte sozinho para o novo formato particionado na primeira vez que abrir, sem nenhuma ação manual. O arquivo antigo é copiado para os backups automáticos antes de ser removido, então nada se perde. Esse processo é idempotente (rodar de novo não duplica nada).
- **Leitura/escrita reutilizáveis**: `carregarColecao(colecao)` lê todos os meses e devolve um array só (usado onde o app precisa do histórico completo); `salvarItem`/`removerItem`/`salvarItensEmLote` leem e gravam **só o(s) arquivo(s) do mês afetado**, não a coleção inteira — é isso que evita reescrever anos de dados a cada pequena edição.

## Decisões de modelagem (e por quê)

- **`id`**: todo item tem um `id` único gerado com `crypto.randomUUID()` (recurso nativo do navegador/WebView, sem precisar de biblioteca externa). É necessário para permitir editar/excluir um item específico depois.
- **`data`**: sempre no formato `"AAAA-MM-DD"` (ISO 8601). Esse formato ordena corretamente como texto e evita ambiguidade entre DD/MM e MM/DD.
- **`valor`**: número decimal simples (ex: `342.75`), representando reais. Ponto de atenção técnico: números decimais podem ter pequenos erros de arredondamento em operações repetidas de soma. Se isso incomodar no futuro, a alternativa é guardar valores em centavos (inteiro, ex: `34275`). Por ora mantive decimal por ser mais legível no JSON — me avise se preferir centavos.
- **"Gastos fixos" e "parcelamentos" não são arquivos separados.** Eles são representados dentro do próprio modelo de `gasto`, usando os campos `fixo`/`fixoId` e `parcela`:
  - Um **gasto fixo** (ex: aluguel) é um gasto com `"fixo": true` e um `fixoId` (uuid) compartilhado por toda a série. A partir da Etapa 13, o app **gera sozinho** uma nova ocorrência todo mês (mesmo dia, ajustado para meses mais curtos), sempre que o mês atual ou o mês que você está visualizando ainda não tiver uma. Editar uma ocorrência não afeta as outras já geradas; desmarcar "fixo" só impede novas gerações futuras, não apaga as existentes.
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
| `atualizadoEm` | string (ISO com hora) | data/hora da última edição — usado pela sincronização (ver seção no fim deste documento) |

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
| `atualizadoEm` | string (ISO com hora) | data/hora da última edição — usado pela sincronização (ver seção no fim deste documento) |

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
| `atualizadoEm` | string (ISO com hora) | data/hora da última edição — usado pela sincronização (ver seção no fim deste documento) |

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
| `atualizadoEm` | string (ISO com hora) | data/hora da última edição — usado pela sincronização (ver seção no fim deste documento) |

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
      "observacoes": "Ir em janeiro"
    }
  ]
}
```

**Não é particionado por mês** (diferente de ganhos/gastos/lembretes): uma meta não tem uma data/ocorrência mensal, é um item que o usuário edita diretamente ao longo do tempo — continua sendo um arquivo único, como `configuracoes.json`. Porcentagem (`valorGuardado / valorDesejado`) e o selo "Concluída" são **calculados na tela**, não gravados no arquivo, para nunca ficarem desatualizados.

## `configuracoes.json`

Você não pediu nenhuma configuração específica ainda, então mantive vazio — este arquivo só ganha campos quando houver uma necessidade concreta (ex: dia do mês do salário, tema, etc.):

```json
{
  "versao": 1,
  "configuracoes": {}
}
```

## Sincronização com o Supabase

Desde a etapa de sincronização, ganhos/gastos/lembretes/metas também existem como linhas em tabelas no projeto Supabase "NanaWallet" (Postgres), para poder acessar os mesmos dados de outro aparelho. O armazenamento **local continua sendo a fonte de verdade do dia a dia** — o app lê/escreve localmente sempre, mesmo sem internet; a sincronização é um processo à parte que reconcilia local com nuvem em segundo plano (ver [src/js/sincronizacao/](src/js/sincronizacao/)).

- **`atualizadoEm`**: carimbado automaticamente (por `ColecaoService.salvar`/`salvarEmLote`, em `src/js/servicos/ColecaoService.js`) toda vez que a usuária cria ou edita um item — nenhuma tela precisa se preocupar com isso. É o campo usado para decidir, num conflito, qual versão é mais recente.
- **Tabelas no Supabase**: uma por coleção (`gastos`, `ganhos`, `lembretes`, `metas`), com as mesmas colunas em `snake_case` (`mes_referencia`, `fixo_id`, `valor_desejado`, etc. — ver o mapeamento em [src/js/sincronizacao/mapeamentoColunas.js](src/js/sincronizacao/mapeamentoColunas.js)), mais `user_id` (dono da linha, protegido por Row Level Security) e `excluido_em` (tombstone: marca que o item foi excluído, sem apagar a linha de verdade — necessário para uma exclusão feita num aparelho chegar ao outro numa sincronização incremental).
- **Prevenção de conflitos**: "last-write-wins" por item (não por coleção inteira), comparando `atualizadoEm`. A cada sincronização, mudanças locais ainda não enviadas (fila) sempre têm prioridade sobre o que vier do servidor para aquele mesmo item — evita que uma sincronização em segundo plano sobrescreva uma edição que a usuária acabou de fazer.
- **Fila offline**: guardada em `dados/sincronizacao.json` (local, fora das pastas de gastos/ganhos/etc.), junto com a sessão de login e a data da última sincronização. Sobrevive a fechar o app — mudanças feitas offline continuam na fila até a próxima sincronização conseguir enviá-las. Ver detalhes de implementação em [CLAUDE.md](CLAUDE.md).

## A PWA (pasta `pwa/`)

Uma segunda forma de usar o app, pelo navegador (pensada para o Safari do iPhone — "Compartilhar → Adicionar à Tela de Início"), sem depender do Tauri. Reaproveita quase 100% do JavaScript de `src/js/` (as telas, os gráficos, o histórico, os serviços de domínio) — a ÚNICA coisa que muda é de onde os dados vêm:

- **App Tauri**: lê/escreve arquivos JSON locais (`ArmazenamentoLocalService`), com sincronização em segundo plano para o Supabase.
- **PWA**: não tem acesso a arquivo nenhum (roda só no navegador), então lê/escreve **direto no Supabase** (`ArmazenamentoSupabaseService`) — sem fila, sem cache local de dados. Exige estar logada; se não houver internet, uma operação de salvar/excluir simplesmente falha (diferente do app Tauri, que nunca depende de internet para nada).

Quem decide qual dos dois usar é [src/js/servicos/index.js](src/js/servicos/index.js), detectando se `window.__TAURI__` existe. Por isso os módulos de tela (`gastos.js`, `dashboard.js`, etc.) não precisam saber em qual dos dois ambientes estão rodando.

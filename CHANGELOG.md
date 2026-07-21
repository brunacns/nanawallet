# Changelog

Registro de mudanças do NanaWallet. Segue [versionamento semântico](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH` (ex: `1.0.0`, `1.1.0`, `1.1.1`, `2.0.0`).

- **MAJOR** (`X.0.0`): mudanças que quebram compatibilidade com dados antigos ou reformulações grandes.
- **MINOR** (`1.X.0`): novas funcionalidades, sem quebrar o que já existe.
- **PATCH** (`1.1.X`): correções de bugs e ajustes pequenos.

A versão exibida no app (Configurações → Sobre o aplicativo) vem de `src-tauri/tauri.conf.json` — é a fonte única da verdade. Para lançar uma nova versão: mude o campo `"version"` nesse arquivo e rode `npm run tauri dev` ou `npm run tauri build` — `scripts/preparar-build.js` sincroniza automaticamente `package.json` e `Cargo.toml`, e regrava a data da build. Depois, adicione uma entrada aqui descrevendo o que mudou.

## [Não lançado]

_(as próximas mudanças entram aqui, antes de virar uma versão)_

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

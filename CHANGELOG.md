# Changelog

Registro de mudanças do NanaWallet. Segue [versionamento semântico](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH` (ex: `1.0.0`, `1.1.0`, `1.1.1`, `2.0.0`).

- **MAJOR** (`X.0.0`): mudanças que quebram compatibilidade com dados antigos ou reformulações grandes.
- **MINOR** (`1.X.0`): novas funcionalidades, sem quebrar o que já existe.
- **PATCH** (`1.1.X`): correções de bugs e ajustes pequenos.

A versão exibida no app (Configurações → Sobre o aplicativo) vem de `src-tauri/tauri.conf.json` — é a fonte única da verdade. Para lançar uma nova versão: mude o campo `"version"` nesse arquivo e rode `npm run tauri dev` ou `npm run tauri build` — `scripts/preparar-build.js` sincroniza automaticamente `package.json` e `Cargo.toml`, e regrava a data da build. Depois, adicione uma entrada aqui descrevendo o que mudou.

## [Não lançado]

_(as próximas mudanças entram aqui, antes de virar uma versão)_

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

# Changelog

Registro de mudanças do NanaWallet. Segue [versionamento semântico](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH` (ex: `1.0.0`, `1.1.0`, `1.1.1`, `2.0.0`).

- **MAJOR** (`X.0.0`): mudanças que quebram compatibilidade com dados antigos ou reformulações grandes.
- **MINOR** (`1.X.0`): novas funcionalidades, sem quebrar o que já existe.
- **PATCH** (`1.1.X`): correções de bugs e ajustes pequenos.

A versão exibida no app (Configurações → Sobre o aplicativo) vem de `src-tauri/tauri.conf.json` — é a fonte única da verdade. Para lançar uma nova versão: mude o campo `"version"` nesse arquivo e rode `npm run tauri dev` ou `npm run tauri build` — `scripts/preparar-build.js` sincroniza automaticamente `package.json` e `Cargo.toml`, e regrava a data da build. Depois, adicione uma entrada aqui descrevendo o que mudou.

## [Não lançado]

_(as próximas mudanças entram aqui, antes de virar uma versão)_

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

# Documentação do NanaWallet

Aplicativo financeiro pessoal para desktop, feito com Tauri + HTML/CSS/JavaScript puro (sem frameworks, sem banco de dados — tudo salvo em arquivos JSON locais).

> **Nota sobre o nome**: o app se chama "NanaWallet" desde a Etapa 13. O identificador interno (`com.financeiro.desktop`), a pasta de dados no Windows, o nome da pasta do projeto e o pacote npm continuam usando "financeiro" propositalmente — mudar isso criaria uma pasta de dados nova e faria o Windows "esquecer" os dados já salvos (ver seção 11).

---

## 1. Visão geral do projeto

O NanaWallet ajuda a controlar ganhos, gastos (incluindo fixos e parcelados), lembretes com valor previsto, e mostra tudo isso num dashboard com alertas e gráficos — tudo organizado **mês a mês**, com navegação entre meses no Dashboard, Gastos e Ganhos. Os dados nunca saem do computador do usuário a menos que ele mesmo exporte/faça backup manualmente.

**Pilha tecnológica** (regra permanente do projeto, ver `CLAUDE.md`):
- **Tauri** — empacota o app como um executável nativo do Windows, com uma janela que renderiza HTML/CSS/JS (via WebView2, o motor de navegador já embutido no Windows).
- **JavaScript puro (vanilla)** — sem React/Vue/Angular. Sem TypeScript.
- **Arquivos JSON** — persistência local, sem banco de dados.
- **Rust** — só existe na parte `src-tauri/`, é a "casca" nativa do app. Praticamente toda a lógica de verdade está em JavaScript, não em Rust.

**Como as duas partes se falam**: o `tauri.conf.json` tem `"withGlobalTauri": true`, o que expõe uma API JavaScript global chamada `window.__TAURI__` em toda página carregada pelo app. É por ela que o JavaScript do frontend lê/escreve arquivos e abre janelas nativas ("Salvar como", "Escolher pasta") — sem isso, não teria como o HTML/JS conversar com o sistema operacional.

---

## 2. Estrutura de pastas

```
financeiro/
├── CLAUDE.md                    # regras permanentes do projeto (leia antes de pedir mudanças)
├── MODELOS-DE-DADOS.md          # formato exato de cada item salvo nos JSON
├── DOCUMENTACAO.md              # este arquivo
├── package.json                 # dependência única: @tauri-apps/cli (para rodar `npm run tauri ...`)
│
├── src-tauri/                    # parte nativa (Rust) — não mexa aqui a menos que precise
│   ├── Cargo.toml                # dependências Rust (tauri, plugins de fs e dialog)
│   ├── tauri.conf.json           # configuração do app: nome, ícone, janela, empacotamento
│   ├── capabilities/default.json # permissões: o que o app pode ler/escrever/abrir
│   ├── icons/icon.ico            # ícone do app (usado no .exe e nos instaladores)
│   └── src/
│       ├── main.rs               # ponto de entrada (não tem lógica, só chama lib.rs)
│       └── lib.rs                # registra os plugins do Tauri (fs, dialog)
│
└── src/                           # frontend — 99% do código do app está aqui
    ├── index.html                 # única página HTML (as "telas" são seções que aparecem/somem)
    ├── css/
    │   ├── variaveis.css          # cores, espaçamentos, tudo que é "token de design"
    │   ├── base.css               # reset e estilos globais do documento
    │   ├── layout.css             # estrutura da sidebar + área de conteúdo, responsividade
    │   └── componentes.css        # botões, cartões, tabelas, modais, gráficos — tudo reutilizável
    └── js/
        ├── main.js                # ponto de entrada: inicializa tudo, nesta ordem
        ├── config.js               # nomes dos arquivos JSON e regras de backup (fonte única)
        ├── navegacao.js             # troca de página pelo menu lateral (puramente visual)
        ├── estadoMes.js             # mês selecionado, compartilhado por Dashboard/Gastos/Ganhos
        ├── dados/
        │   ├── armazenamento.js     # ler()/salvar() — único lugar que toca os arquivos JSON
        │   └── backup.js            # cria backup automático a cada salvar()
        ├── modulos/                 # uma "funcionalidade" por arquivo
        │   ├── ganhos.js
        │   ├── gastos.js
        │   ├── parcelamentos.js
        │   ├── lembretes.js
        │   ├── dashboard.js
        │   ├── graficos.js
        │   └── exportacao.js
        └── utils/                   # funções puras reaproveitáveis, sem estado
            ├── formatadores.js       # moeda, data, escapar HTML, carimbo de data/hora
            ├── datas.js              # mês atual/seguinte/anterior, dia do mês, hoje, somar meses
            ├── icones.js             # SVGs de editar/excluir usados nas listas
            └── recorrencias.js       # gera ocorrências que faltam de gastos/ganhos fixos
```

---

## 3. Explicação de cada módulo

| Arquivo | Responsabilidade |
|---|---|
| `dados/armazenamento.js` | Único módulo que sabe onde os arquivos JSON ficam e como ler/gravar. Toda gravação (`salvar`) aciona um backup automático antes de sobrescrever. |
| `dados/backup.js` | Copia o arquivo atual para `backups/` com carimbo de data/hora, e apaga os mais antigos além do limite (15 por arquivo, configurável em `config.js`). |
| `modulos/ganhos.js` | CRUD de ganhos, filtrado pelo mês selecionado. Agrupa visualmente por dia do recebimento (dia 15 / dia 30 / outras datas). Gera automaticamente a ocorrência do mês para ganhos fixos. Caixinha na lista alterna "recebido" sem abrir modal. |
| `modulos/gastos.js` | CRUD de gastos, filtrado pelo mês selecionado (por `mesReferencia`, não pela `data`). Ordena fixos primeiro, depois por data. Gera automaticamente a ocorrência do mês para gastos fixos. Caixinha na lista alterna "pago" sem abrir modal. |
| `modulos/parcelamentos.js` | Não é uma coleção própria — gera vários gastos de uma vez (um por parcela) dentro de `gastos.json`, usando `gastos.js` por baixo. Cada parcela já nasce com `mesReferencia` = seu próprio mês. Mostra o resumo "Parcelamentos ativos". |
| `modulos/lembretes.js` | CRUD de lembretes com valor previsto. O valor nunca vira gasto pago — só entra na "Previsão futura" do dashboard enquanto não estiver concluído. |
| `modulos/dashboard.js` | Calcula todos os totais/saldos/alertas/diagnósticos **do mês selecionado** a partir dos dados de ganhos, gastos e lembretes (não guarda estado próprio). |
| `modulos/graficos.js` | Desenha os 5 gráficos SVG do dashboard (sem biblioteca externa) — estes continuam mostrando a evolução ao longo de vários meses, não só o mês selecionado. |
| `modulos/exportacao.js` | Exportar JSON/texto, fazer backup manual, restaurar backups — a única parte do app que abre diálogos nativos do Windows. |
| `navegacao.js` | Troca qual `<section class="pagina">` fica visível quando se clica no menu — não sabe nada sobre dados. |
| `estadoMes.js` | Guarda qual mês está selecionado (começa no mês atual) e avisa Dashboard/Gastos/Ganhos quando muda — é o que mantém os três seletores de mês sincronizados. |
| `utils/recorrencias.js` | Função compartilhada que, dado um `fixoId`, gera as ocorrências que faltam até um mês alvo (usada por `gastos.js` e `ganhos.js`, não duplicada entre os dois). |

**Como os módulos se avisam de mudanças**: `ganhos.js`, `gastos.js` e `lembretes.js` cada um expõe `obterX()` (retorna a lista atual em memória) e `aoAtualizarX(callback)` (registra uma função para ser chamada sempre que a lista mudar). É assim que `dashboard.js`, `graficos.js`, `parcelamentos.js` e `exportacao.js` conseguem reagir a mudanças feitas em outra tela sem duplicar o estado nem precisar reler o disco toda hora. O mês selecionado segue o mesmo padrão através de `estadoMes.js` (`aoAtualizarMes`).

---

## 4. Localização dos arquivos JSON

Os dados **não ficam dentro da pasta do projeto**. Ficam em uma pasta padrão do Windows para dados de aplicativos:

```
C:\Users\<seu-usuário>\AppData\Local\com.financeiro.desktop\
├── dados\
│   ├── ganhos.json
│   ├── gastos.json
│   ├── lembretes.json
│   └── configuracoes.json
└── backups\
    └── (cópias automáticas, uma por gravação, com data/hora no nome)
```

`com.financeiro.desktop` é o "identificador" do app (definido em `tauri.conf.json`) — cada app instalado no Windows tem sua própria pastinha assim, isolada dos outros.

O formato de cada arquivo está documentado em detalhe em [MODELOS-DE-DADOS.md](MODELOS-DE-DADOS.md).

---

## 5. Funcionamento do sistema de backup

Há duas camadas independentes:

**a) Backup automático** (sempre ativo, não precisa fazer nada)
Toda vez que qualquer tela salva dados (`armazenamento.salvar()`), o app primeiro copia o arquivo atual para `backups/`, com um nome tipo `ganhos_2026-07-18_20-57-35.json`, e só depois grava a versão nova. Mantém os **15 backups mais recentes por arquivo** — os mais antigos são apagados automaticamente.

**b) Backup manual** (Exportação → "Criar backup manual agora")
Você escolhe uma pasta (pendrive, OneDrive, Desktop, etc.) e o app cria ali uma subpasta com os 4 arquivos de dados, sem depender da pasta interna do app.

**Restauração** (Exportação → lista "Backups automáticos recentes", botão "Restaurar", ou "Restaurar de um arquivo"):
Sempre passa por `armazenamento.salvar()` — ou seja, mesmo restaurar cria um backup do estado atual antes de sobrescrever. É praticamente impossível perder dados por engano usando as telas do próprio app.

---

## 6. Como adicionar, remover ou modificar funcionalidades no futuro

**Para adicionar um campo novo a algo que já existe** (ex: uma "categoria" em gastos):
1. Atualize o modelo em `MODELOS-DE-DADOS.md`.
2. No módulo correspondente (`gastos.js`), adicione o campo no objeto criado em `salvarFormulario` e leia-o de um novo `<input>` no modal (`index.html`).
3. Mostre o campo na renderização (`linhaGasto`).
Dados antigos sem o campo novo continuam funcionando (JavaScript não reclama de propriedade ausente) — mas trate o valor como `undefined`/opcional no código até decidir um valor padrão.

**Para adicionar uma tela/funcionalidade nova inteira**:
1. Crie `src/js/modulos/nome-da-coisa.js` seguindo o padrão dos módulos existentes (estado em memória, `obterX()`/`aoAtualizarX()` se outros módulos precisarem ler, `iniciarX()` como ponto de entrada).
2. Adicione a seção HTML em `index.html` (copie a estrutura de uma página parecida).
3. Registre um novo arquivo em `config.js` (`CONFIG.arquivos`) se precisar de um JSON próprio.
4. Chame `iniciarX()` em `main.js`, dentro do bloco `try` já existente.

**Para remover uma funcionalidade**: apague o módulo, sua seção no `index.html`, e a chamada em `main.js`. Como cada módulo só mexe nos próprios elementos (`getElementById`), remover um não quebra os outros.

**Onde ajustar os "números mágicos"** (limites de alerta, % de diagnóstico, quantidade de backups): estão isolados em constantes no topo dos arquivos (`dashboard.js` tem `LIMITE_SALDO_LARANJA` etc; `config.js` tem `maxBackupsPorArquivo`) — mude ali, não espalhado pelo código.

---

## 7. Arquivos que podem ser editados com segurança

- **`src/css/*.css`** — cores, espaçamentos, aparência. Baixo risco de quebrar algo.
- **`src/js/modulos/*.js`** — lógica de cada tela. Risco médio: siga o padrão dos outros módulos.
- **`src/js/utils/*.js`** — funções auxiliares puras. Só cuidado ao mudar `escaparHtml`/formatos de data, pois vários módulos dependem deles.
- **`src/index.html`** — pode adicionar seções/campos, desde que preserve os `id`s que o JavaScript usa (procure o `id` no JS correspondente antes de renomear).
- **`MODELOS-DE-DADOS.md`, `CLAUDE.md`, `DOCUMENTACAO.md`** — documentação, sempre seguro.

## 8. Arquivos que não devem ser alterados sem necessidade

- **`src-tauri/capabilities/default.json`** — controla quais pastas o app pode ler/escrever. Um erro aqui pode quebrar a exportação/backup silenciosamente (o app simplesmente falha ao tentar salvar em algum lugar).
- **`src-tauri/tauri.conf.json`** — identificador do app, ícone, config de empacotamento. Mudar o `identifier` depois de já ter dados salvos faz o Windows tratar como um app diferente e "perder" a pasta de dados antiga (ver seção 11).
- **`src-tauri/src/lib.rs` e `main.rs`** — só precisam mudar se for adicionar um novo plugin do Tauri (algo que exige acesso nativo novo, como notificações do sistema).
- **`src-tauri/Cargo.toml`, `package.json`, `package-lock.json`** — dependências. Mudar versões pode exigir recompilar tudo e pode introduzir incompatibilidades.
- **`src-tauri/gen/`, `src-tauri/target/`, `node_modules/`** — gerados automaticamente por ferramentas (Tauri/npm/cargo). Nunca edite à mão; podem ser apagados e recriados a qualquer momento (`npm install`, `npm run tauri dev`).

---

## 9. Inicialização do aplicativo (modo de desenvolvimento)

**Pré-requisitos** (só precisa instalar uma vez):
- [Node.js](https://nodejs.org) (já está instalado nesta máquina)
- [Rust](https://rustup.rs) com a toolchain MSVC (já está instalado nesta máquina, via `rustup`)
- Visual Studio Build Tools com "Desenvolvimento para desktop com C++" (já está instalado nesta máquina)

**Comandos, em ordem:**

```
npm install
```
Baixa a única dependência JavaScript do projeto (`@tauri-apps/cli`, a ferramenta de linha de comando do Tauri). Só precisa rodar de novo se `package.json` mudar.

```
npm run tauri dev
```
Compila o app em modo desenvolvimento e abre a janela. Na primeira vez, compila ~370 pacotes Rust do zero (pode levar alguns minutos); nas próximas, é rápido (segundos) porque o Cargo reaproveita o que já compilou. Fica rodando e observando mudanças nos arquivos Rust — mudanças em HTML/CSS/JS exigem fechar e abrir de novo, porque o Tauri "embute" o conteúdo do `src/` dentro do binário na hora de compilar (não existe recarregamento automático nesse projeto, já que não usamos um servidor de desenvolvimento separado).

**Importante para quem for rodar isso manualmente pelo PowerShell**: não use `2>&1` nem `*>` na frente do comando (ex: `npm run tauri dev 2>&1`) — isso aciona um bug conhecido do PowerShell 5.1 com programas nativos que derruba o processo do app pouco depois de abrir. Rode o comando puro.

---

## 10. Geração do aplicativo final

Tentei gerar automaticamente e **consegui** — o ambiente já tinha tudo que era necessário (Rust, Visual Studio Build Tools, e o Tauri baixou sozinho as ferramentas de empacotamento do Windows).

Rodei:
```
npm run tauri build
```

Isso faz duas coisas: (1) compila uma versão **release** do app (otimizada, mais rápida e menor que a de desenvolvimento) e (2) gera os instaladores para distribuição.

**Onde os arquivos finais foram criados** (confirmado no disco, com tamanho):

```
D:\Download\projetos\financeiro\src-tauri\target\release\financeiro.exe                              (10,2 MB) — executável portátil
D:\Download\projetos\financeiro\src-tauri\target\release\bundle\msi\NanaWallet_0.1.0_x64_en-US.msi    (3,1 MB)  — instalador MSI
D:\Download\projetos\financeiro\src-tauri\target\release\bundle\nsis\NanaWallet_0.1.0_x64-setup.exe   (2,1 MB)  — instalador NSIS (setup.exe)
```

> **Atenção — isso não atualiza sozinho.** O Tauri copia o conteúdo de `src/` (todo o HTML/CSS/JS) para dentro do `.exe` no momento da compilação. Depois de rodar `npm run tauri build` uma vez, o arquivo gerado é uma "foto" congelada do código daquele momento — qualquer mudança feita depois (mesmo pequena) **não aparece** nesse `.exe` nem nos instaladores até você rodar `npm run tauri build` de novo. Sempre que aprovar uma mudança e quiser testá-la no aplicativo final (não só no modo desenvolvimento), é preciso recompilar.

**Por que o primeiro build não gerou instalador**: minha primeira tentativa rodou `tauri build` sem uma seção `"bundle"` no `tauri.conf.json` — o app compilou normalmente, mas o Tauri não empacotou nada porque não havia essa configuração. Adicionei `"bundle": { "active": true, "targets": "all" }` e rodei de novo (a recompilação do Rust já estava em cache, então essa segunda vez foi bem mais rápida — 2m32s em vez de 7m15s). Nessa segunda rodada, o Tauri baixou sozinho (via internet) as ferramentas WiX (para o `.msi`) e NSIS (para o `setup.exe`), já que nenhuma das duas estava instalada nesta máquina — e gerou os dois instaladores com sucesso.

---

## 11. Dados do usuário

**Onde ficam salvos**: `C:\Users\<usuário>\AppData\Local\com.financeiro.desktop\dados\` (ver seção 4). Essa pasta é do **usuário do Windows**, não do programa — instalar, desinstalar ou reinstalar o app não mexe nela.

**Preservados após atualizações?** Sim, desde que o `identifier` em `tauri.conf.json` (`com.financeiro.desktop`) não mude entre versões — é ele que define o nome da pasta. Trocar esse identificador faz o Windows enxergar como um app diferente, com uma pasta de dados vazia (os dados antigos continuam no disco, só não aparecem mais para o app).

**Como migrar para outro computador**:
1. No computador antigo: Exportação → "Exportar em JSON" → salve o arquivo num pendrive/nuvem.
2. Instale o Financeiro no computador novo (uma vez, para ele criar a pasta de dados vazia).
3. Abra o app, vá em Exportação → "Restaurar de um arquivo" → escolha o `.json` que você salvou.

Alternativa mais direta (sem passar pela interface): copiar a pasta inteira `%LOCALAPPDATA%\com.financeiro.desktop\dados\` do computador antigo para o mesmo caminho no novo, com o app fechado nos dois.

**Como restaurar backups**: ver seção 5. Pela tela de Exportação, tanto os automáticos (por arquivo) quanto um `.json` exportado manualmente (restauração completa).

**Como evitar perda de dados**:
- Exporte um `.json` de vez em quando e guarde fora do computador (nuvem, pendrive) — é a única cópia que sobrevive a um problema no disco inteiro.
- Não delete manualmente a pasta `AppData\Local\com.financeiro.desktop` sem antes exportar.
- Os backups automáticos protegem contra erro de edição (editar/excluir algo por engano), mas **não** protegem contra o disco falhar — para isso, só uma cópia em outro lugar (exportação manual) resolve.

---

## 12. Distribuição futura: `.exe` portátil vs instalador `.msi`

O projeto pode gerar as duas coisas — são arquivos diferentes, gerados pelo mesmo comando (`npm run tauri build`):

| | `.exe` portátil | Instalador (`.msi` ou NSIS `.exe`) |
|---|---|---|
| **O que é** | O `financeiro.exe` puro, de `target/release/` | Um programa de instalação que copia os arquivos, cria atalhos e registra o app no Windows |
| **Como se usa** | Copia o arquivo e roda de qualquer lugar (pendrive, pasta qualquer) — não precisa "instalar" | Usuário clica duas vezes, segue o assistente, o app fica instalado como qualquer programa |
| **Vantagem** | Simples, não mexe no registro do Windows, fácil de levar num pendrive | Aparece no menu Iniciar, no "Adicionar ou Remover Programas", pode ter atualização automática no futuro |
| **Desvantagem** | Não cria atalho, não aparece na lista de programas instalados, desinstalar é só apagar o arquivo | Mais "pesado" para quem só quer testar rapidamente; exige permissões de instalação |
| **Quando escolher** | Uso pessoal, testar em outro PC rapidamente, não quer instalar nada | Distribuir para alguém que espera uma instalação "normal" |

**Minha recomendação para este projeto**: como é um app pessoal, o `.exe` portátil já cobre bem o caso de uso (você mesmo rodando no seu PC). Eu geraria o instalador (`.msi`/NSIS) só se algum dia for compartilhar com outra pessoa que espera um instalador convencional.

---

## Estado atual do projeto (ao final desta etapa)

- **Concluído**:
  - Revisão completa do código-fonte (todos os 15 arquivos JS lidos e analisados).
  - Quatro duplicações corrigidas (ícones SVG, cálculo de "dia do mês", duas funções quase idênticas no dashboard, lista de coleções repetida em `exportacao.js`).
  - Um bug de baixo impacto identificado e **documentado, mas não corrigido** (parcelamento com parcela excluída individualmente mostra total desatualizado — ver seção 6 do histórico em `CLAUDE.md`).
  - `DOCUMENTACAO.md` (este arquivo) e atualização final do `CLAUDE.md`.
  - Executável de produção **e os dois instaladores** gerados com sucesso (seção 10).
- **O que não pôde ser feito 100% automaticamente**: nada relacionado à geração do app — Rust, Visual Studio Build Tools, WiX e NSIS foram usados ou baixados automaticamente. A única limitação foi de ferramental desta sessão de IA: o navegador de teste que eu vinha usando para validar a interface (clicar em botões, conferir telas) desconectou no meio desta etapa, então a validação final da refatoração foi feita por leitura cuidadosa do código e checagem de sintaxe (`node --check`) em vez de testar clicando na tela.
- **O que você precisa fazer manualmente**:
  1. Abrir `financeiro.exe` (ou instalar via um dos dois instaladores) pelo menos uma vez para conferir visualmente que tudo continua funcionando depois da revisão — eu não consegui interagir com a janela nem tirar screenshot nesta sessão.
  2. Se quiser distribuir o app para alguém, decidir entre `.exe` portátil ou instalador (seção 12) — nenhuma ação é necessária se for só para uso próprio.

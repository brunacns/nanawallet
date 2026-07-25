import { lerConfiguracoes, salvarConfiguracoes, salvarMetas, salvarCategorias, salvarMes, salvarColecaoCompleta, apagarTodosOsDados } from "../dados/armazenamento.js";
import { obterGanhos, recarregarGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, recarregarGastos, aoAtualizarGastos } from "./gastos.js";
import { obterLembretes, recarregarLembretes, aoAtualizarLembretes } from "./lembretes.js";
import { obterMetas, recarregarMetas, aoAtualizarMetas } from "./metas.js";
import { categoriasService } from "../servicos/index.js";
import { formatarMoeda, formatarData, carimboDataHora, escaparHtml } from "../utils/formatadores.js";
import { rotuloMesLongo } from "../utils/datas.js";

export async function iniciarExportacao() {
  document.getElementById("botao-exportar-json").addEventListener("click", exportarJson);
  document.getElementById("botao-exportar-texto").addEventListener("click", exportarTexto);
  document.getElementById("botao-backup-manual").addEventListener("click", criarBackupManual);
  document.getElementById("botao-restaurar-arquivo").addEventListener("click", restaurarDeArquivo);
  document.getElementById("exportacao-backups-conteudo").addEventListener("click", tratarCliqueBackups);
  document.getElementById("botao-apagar-tudo").addEventListener("click", tratarApagarTudo);

  // Toda gravação em ganhos/gastos/lembretes cria um backup automático novo
  // (Etapa 3) — mantém esta lista sempre em dia, mesmo gravado a partir de outra página.
  aoAtualizarGanhos(listarBackupsAutomaticos);
  aoAtualizarGastos(listarBackupsAutomaticos);
  aoAtualizarLembretes(listarBackupsAutomaticos);
  aoAtualizarMetas(listarBackupsAutomaticos);
  categoriasService.aoAtualizar(listarBackupsAutomaticos);

  await listarBackupsAutomaticos();
}

function mostrarStatus(texto, ehErro = false) {
  const el = document.getElementById("exportacao-status");
  el.textContent = texto;
  el.style.color = ehErro ? "var(--cor-negativo)" : "var(--cor-positivo)";
  el.hidden = false;
}

// ==================== 1. Exportação em JSON ====================

async function exportarJson() {
  const { dialog, fs } = window.__TAURI__;

  const caminho = await dialog.save({
    defaultPath: `financeiro-exportado_${carimboDataHora()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!caminho) return;

  const dadosConfiguracoes = await lerConfiguracoes();
  const conteudo = {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    ganhos: obterGanhos(),
    gastos: obterGastos(),
    lembretes: obterLembretes(),
    metas: obterMetas(),
    categorias: categoriasService.obterTodos(),
    configuracoes: dadosConfiguracoes.configuracoes,
  };

  await fs.writeTextFile(caminho, JSON.stringify(conteudo, null, 2));
  mostrarStatus(`Exportado com sucesso em: ${caminho}`);
}

// ==================== 2. Exportação em texto (para IA) ====================

async function exportarTexto() {
  const { dialog, fs } = window.__TAURI__;

  const caminho = await dialog.save({
    defaultPath: `financeiro-resumo_${carimboDataHora()}.txt`,
    filters: [{ name: "Texto", extensions: ["txt"] }],
  });
  if (!caminho) return;

  const texto = gerarTextoParaIA(obterGanhos(), obterGastos(), obterLembretes(), obterMetas());
  await fs.writeTextFile(caminho, texto);
  mostrarStatus(`Exportado com sucesso em: ${caminho}`);
}

function somarValor(lista) {
  return lista.reduce((soma, item) => soma + item.valor, 0);
}

function gerarTextoParaIA(ganhos, gastos, lembretes, metas) {
  const linhas = [];
  const agora = new Date();

  linhas.push("RESUMO FINANCEIRO");
  linhas.push(`Exportado em: ${formatarData(agora.toISOString().slice(0, 10))}`);
  linhas.push("");
  linhas.push(
    "Este arquivo é um resumo em texto simples dos dados financeiros pessoais do usuário, gerado para ser colado em uma IA e pedir análise, conselhos ou identificação de padrões."
  );
  linhas.push("");

  const totalGanhos = somarValor(ganhos);
  linhas.push(`=== GANHOS (total: ${formatarMoeda(totalGanhos)}) ===`);
  if (ganhos.length === 0) {
    linhas.push("(nenhum ganho cadastrado)");
  } else {
    [...ganhos]
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach((g) => linhas.push(`- ${formatarData(g.data)} | ${g.titulo} | ${formatarMoeda(g.valor)}`));
  }
  linhas.push("");

  const totalGastos = somarValor(gastos);
  const totalPago = somarValor(gastos.filter((g) => g.pago));
  const totalPendente = totalGastos - totalPago;
  linhas.push(
    `=== GASTOS (total: ${formatarMoeda(totalGastos)} | pago: ${formatarMoeda(totalPago)} | pendente: ${formatarMoeda(totalPendente)}) ===`
  );
  if (gastos.length === 0) {
    linhas.push("(nenhum gasto cadastrado)");
  } else {
    [...gastos]
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach((g) => {
        const tipo = g.fixo ? "fixo" : g.parcela ? `parcela ${g.parcela.numero}/${g.parcela.total}` : "único";
        const salario = g.salarioResponsavel === "dia25" ? "salário dia 25" : "salário dia 10";
        const status = g.pago ? "pago" : "pendente";
        linhas.push(`- ${formatarData(g.data)} | ${g.titulo} | ${formatarMoeda(g.valor)} | ${status} | ${tipo} | ${salario}`);
      });
  }
  linhas.push("");

  const totalLembretes = somarValor(lembretes);
  const totalLembretesPendentes = somarValor(lembretes.filter((l) => !l.concluido));
  linhas.push(
    `=== LEMBRETES (valor previsto total: ${formatarMoeda(totalLembretes)} | ainda não concluído: ${formatarMoeda(totalLembretesPendentes)}) ===`
  );
  if (lembretes.length === 0) {
    linhas.push("(nenhum lembrete cadastrado)");
  } else {
    [...lembretes]
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach((l) => linhas.push(`- ${formatarData(l.data)} | ${l.titulo} | ${formatarMoeda(l.valor)} | ${l.concluido ? "concluído" : "pendente"}`));
  }
  linhas.push("");

  const ROTULOS_PRIORIDADE_TEXTO = { alta: "alta", media: "média", baixa: "baixa" };
  linhas.push(`=== METAS/WISHLIST (${metas.length} cadastrada${metas.length === 1 ? "" : "s"}) ===`);
  if (metas.length === 0) {
    linhas.push("(nenhuma meta cadastrada)");
  } else {
    metas.forEach((m) => {
      const pct = m.valorDesejado > 0 ? Math.round((m.valorGuardado / m.valorDesejado) * 100) : 0;
      const status = m.valorGuardado >= m.valorDesejado ? "concluída" : `prioridade ${ROTULOS_PRIORIDADE_TEXTO[m.prioridade]}`;
      linhas.push(
        `- ${m.nome} | guardado: ${formatarMoeda(m.valorGuardado)} de ${formatarMoeda(m.valorDesejado)} (${pct}%) | ${status}${
          m.observacoes ? ` | obs: ${m.observacoes}` : ""
        }`
      );
    });
  }
  linhas.push("");

  linhas.push("=== RESUMO GERAL ===");
  linhas.push(`Total recebido: ${formatarMoeda(totalGanhos)}`);
  linhas.push(`Total gasto (já pago): ${formatarMoeda(totalPago)}`);
  linhas.push(`Total gasto pendente: ${formatarMoeda(totalPendente)}`);
  // Mesma fórmula do "Saldo restante" do Dashboard (Etapa 13): desconta TODOS
  // os gastos atribuídos, pagos ou não — não só os já pagos. Aqui é a soma de
  // todo o histórico (o Dashboard mostra por mês selecionado), mas o conceito
  // de "saldo restante" precisa ser o mesmo nos dois lugares.
  linhas.push(`Saldo restante: ${formatarMoeda(totalGanhos - totalGastos)}`);
  linhas.push(`Reservado para lembretes ainda não concluídos: ${formatarMoeda(totalLembretesPendentes)}`);

  return linhas.join("\n");
}

// ==================== 3. Sistema de backup ====================

async function criarBackupManual() {
  const { dialog, fs, path } = window.__TAURI__;

  const pastaDestino = await dialog.open({ directory: true, title: "Escolha onde salvar o backup" });
  if (!pastaDestino) return;

  const nomePasta = `financeiro-backup_${carimboDataHora()}`;
  const caminhoBackup = await path.join(pastaDestino, nomePasta);
  await fs.mkdir(caminhoBackup, { recursive: true });

  // O backup manual continua sendo um arquivo único e legível por coleção
  // (independente de como os dados estão particionados em disco), a partir
  // do que já está carregado em memória — evita reler tudo do disco de novo.
  const colecoes = {
    ganhos: obterGanhos(),
    gastos: obterGastos(),
    lembretes: obterLembretes(),
    metas: obterMetas(),
    categorias: categoriasService.obterTodos(),
  };
  for (const [chave, itens] of Object.entries(colecoes)) {
    const destino = await path.join(caminhoBackup, `${chave}.json`);
    await fs.writeTextFile(destino, JSON.stringify({ versao: 1, [chave]: itens }, null, 2));
  }

  const configuracoes = await lerConfiguracoes();
  const destinoConfig = await path.join(caminhoBackup, "configuracoes.json");
  await fs.writeTextFile(destinoConfig, JSON.stringify(configuracoes, null, 2));

  mostrarStatus(`Backup criado em: ${caminhoBackup}`);
}

async function listarBackupsAutomaticos() {
  const { fs, path } = window.__TAURI__;
  const container = document.getElementById("exportacao-backups-conteudo");

  const raiz = await path.appLocalDataDir();
  const pastaBackups = await path.join(raiz, "backups");

  if (!(await fs.exists(pastaBackups))) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">Nenhum backup automático ainda.</li>`;
    return;
  }

  const entradas = await fs.readDir(pastaBackups);
  const arquivos = entradas
    .filter((e) => e.name && e.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20);

  if (arquivos.length === 0) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">Nenhum backup automático ainda.</li>`;
    return;
  }

  container.innerHTML = arquivos
    .map(
      (a) => `
    <li class="lista-simples__item" data-nome="${escaparHtml(a.name)}">
      <span class="lista-simples__titulo">${escaparHtml(a.name)}</span>
      <button type="button" class="botao botao--secundario" data-acao="restaurar-backup" style="padding: 4px 10px; font-size: 12px;">Restaurar</button>
    </li>
  `
    )
    .join("");
}

function tratarCliqueBackups(evento) {
  const botao = evento.target.closest("[data-acao='restaurar-backup']");
  if (!botao) return;
  const nome = botao.closest("[data-nome]").dataset.nome;
  restaurarBackupAutomatico(nome);
}

// ==================== 4. Sistema de restauração ====================

const ROTULOS_COLECAO = {
  ganhos: "Ganhos",
  gastos: "Gastos",
  lembretes: "Lembretes",
  metas: "Metas",
  categorias: "Categorias",
  configuracoes: "Configurações",
};
const COLECOES_VALIDAS = Object.keys(ROTULOS_COLECAO);
const COLECOES_ARQUIVO_UNICO = ["configuracoes", "metas", "categorias"];

// Nome do arquivo de backup automático: "<identificador>__<carimbo>.json",
// onde identificador é "configuracoes" (arquivo único) ou "<colecao>-<AAAA-MM>"
// (um mês específico de uma coleção particionada, ex: "gastos-2026-07") —
// ver `criarBackup` em dados/backup.js.
function interpretarIdentificadorBackup(identificador) {
  const partes = identificador.split("-");
  const colecao = partes[0];
  const anoValido = /^\d{4}$/.test(partes[1] || "");
  const mesValido = /^\d{2}$/.test(partes[2] || "");
  return anoValido && mesValido ? { colecao, anoMes: `${partes[1]}-${partes[2]}` } : { colecao, anoMes: null };
}

async function restaurarBackupAutomatico(nomeArquivo) {
  const [identificador] = nomeArquivo.split("__");
  const { colecao, anoMes } = interpretarIdentificadorBackup(identificador);

  const ehArquivoUnico = COLECOES_ARQUIVO_UNICO.includes(colecao);
  if (!COLECOES_VALIDAS.includes(colecao) || (!ehArquivoUnico && !anoMes)) {
    mostrarStatus(`Arquivo de backup não reconhecido: "${nomeArquivo}".`, true);
    return;
  }

  const rotulo = ROTULOS_COLECAO[colecao];
  // Como os dados agora são particionados por mês, restaurar um backup
  // automático afeta só o mês daquele backup, não a coleção inteira.
  const descricaoEscopo = anoMes ? ` de ${rotuloMesLongo(anoMes)}` : "";

  const confirmou = confirm(
    `Restaurar "${nomeArquivo}"?\n\nIsso vai SUBSTITUIR os dados atuais de ${rotulo}${descricaoEscopo} pelos dados desse backup. Um backup do estado atual antes da restauração será criado automaticamente.`
  );
  if (!confirmou) return;

  const { fs, path } = window.__TAURI__;
  const raiz = await path.appLocalDataDir();
  const caminho = await path.join(raiz, "backups", nomeArquivo);
  const conteudo = JSON.parse(await fs.readTextFile(caminho));

  if (colecao === "configuracoes") {
    await salvarConfiguracoes(conteudo);
  } else if (colecao === "metas") {
    await salvarMetas(conteudo);
  } else if (colecao === "categorias") {
    await salvarCategorias(conteudo);
  } else {
    await salvarMes(colecao, anoMes, conteudo[colecao] || []);
  }

  await recarregarModulo(colecao);
  await listarBackupsAutomaticos();
  mostrarStatus(`${rotulo}${descricaoEscopo} restaurado com sucesso a partir de "${nomeArquivo}".`);
}

async function restaurarDeArquivo() {
  const { dialog, fs } = window.__TAURI__;

  const caminho = await dialog.open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
    title: "Escolha o arquivo exportado para restaurar",
  });
  if (!caminho) return;

  let dados;
  try {
    dados = JSON.parse(await fs.readTextFile(caminho));
  } catch (erro) {
    mostrarStatus("Não foi possível ler esse arquivo. Verifique se é um arquivo exportado pelo próprio app.", true);
    return;
  }

  const valido = ["ganhos", "gastos", "lembretes"].every((chave) => Array.isArray(dados[chave]));
  if (!valido) {
    mostrarStatus("Esse arquivo não parece ser uma exportação válida do Financeiro.", true);
    return;
  }

  const confirmou = confirm(
    "Restaurar este arquivo vai SUBSTITUIR todos os seus dados atuais (ganhos, gastos, lembretes e configurações) pelos dados desse arquivo.\n\nUm backup do estado atual será criado automaticamente antes. Deseja continuar?"
  );
  if (!confirmou) return;

  await salvarColecaoCompleta("ganhos", dados.ganhos);
  await salvarColecaoCompleta("gastos", dados.gastos);
  await salvarColecaoCompleta("lembretes", dados.lembretes);
  if (dados.configuracoes) {
    await salvarConfiguracoes({ versao: 1, configuracoes: dados.configuracoes });
  }
  // "metas" e "categorias" são opcionais na validação acima: exportações
  // feitas antes de cada funcionalidade existir não têm esses campos, e
  // restaurá-las não deve apagar os dados atuais do usuário nessas coleções.
  if (Array.isArray(dados.metas)) {
    await salvarMetas({ versao: 1, metas: dados.metas });
  }
  if (Array.isArray(dados.categorias)) {
    await salvarCategorias({ versao: 1, categorias: dados.categorias });
  }

  await recarregarGanhos();
  await recarregarGastos();
  await recarregarLembretes();
  await recarregarMetas();
  await categoriasService.recarregar();

  mostrarStatus("Restauração concluída com sucesso.");
}

// ==================== 5. Apagar todos os dados ====================

async function tratarApagarTudo() {
  const primeiraConfirmacao = confirm(
    "Isso vai apagar PERMANENTEMENTE todos os ganhos, gastos, lembretes e metas cadastrados (de todos os meses). As configurações não são afetadas.\n\nUm backup completo é criado automaticamente antes, mas essa ação não pode ser desfeita pela interface. Deseja continuar?"
  );
  if (!primeiraConfirmacao) return;

  const segundaConfirmacao = confirm('Tem certeza mesmo? Digite mentalmente "sim" e confirme para apagar todos os dados agora.');
  if (!segundaConfirmacao) return;

  await apagarTodosOsDados();

  await recarregarGanhos();
  await recarregarGastos();
  await recarregarLembretes();
  await recarregarMetas();
  await listarBackupsAutomaticos();

  mostrarStatus("Todos os dados foram apagados. Um backup do estado anterior está disponível em \"Backups automáticos recentes\".");
}

async function recarregarModulo(chave) {
  if (chave === "ganhos") await recarregarGanhos();
  else if (chave === "gastos") await recarregarGastos();
  else if (chave === "lembretes") await recarregarLembretes();
  else if (chave === "metas") await recarregarMetas();
  else if (chave === "categorias") await categoriasService.recarregar();
  // "configuracoes" ainda não tem tela própria (Etapa 4 manteve vazio).
}

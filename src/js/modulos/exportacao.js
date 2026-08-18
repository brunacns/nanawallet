import { validarESanearItens } from "../dados/validacao.js";
import { obterGanhos, recarregarGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, recarregarGastos, aoAtualizarGastos } from "./gastos.js";
import { obterLembretes, recarregarLembretes, aoAtualizarLembretes } from "./lembretes.js";
import { obterMetas, recarregarMetas, aoAtualizarMetas } from "./metas.js";
import { armazenamentoAtivo, categoriasService } from "../servicos/index.js";
import { formatarMoeda, formatarData, carimboDataHora } from "../utils/formatadores.js";
import { estaNoTauri } from "../utils/plataforma.js";

// Exportar/backup/restaurar em ARQUIVO local (diálogo nativo do SO) só faz
// sentido no Desktop (Tauri) — a Web não tem acesso ao sistema de arquivos
// do jeito que essas ações precisam. "Apagar todos os dados" não depende de
// arquivo nenhum (só fala com o Supabase), então continua disponível nos
// dois. Ver Fase 6 da migração (CLAUDE.md).
const MENSAGEM_SO_DESKTOP = "Disponível só na versão Desktop (precisa de acesso ao sistema de arquivos).";

// Correção (auditoria 2026-08-09, BUG-07): "Apagar tudo", exportar,
// restaurar e fazer backup manual podiam levar vários segundos com uma base
// de dados grande, sem nenhum indício visual de que algo estava acontecendo
// — o botão continuava clicável, sem spinner nem texto de "processando".
// `comCarregando` desabilita o botão e troca o texto durante a operação
// (sempre restaurando no `finally`, mesmo se a operação falhar) — genérico o
// suficiente para envolver qualquer uma das ações abaixo sem duplicar lógica.
function comCarregando(botao, textoCarregando, fn) {
  return async (...args) => {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = textoCarregando;
    try {
      await fn(...args);
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  };
}

export async function iniciarExportacao() {
  const botaoExportarJson = document.getElementById("botao-exportar-json");
  const botaoExportarTexto = document.getElementById("botao-exportar-texto");
  const botaoBackupManual = document.getElementById("botao-backup-manual");
  const botaoRestaurarArquivo = document.getElementById("botao-restaurar-arquivo");
  const botaoApagarTudo = document.getElementById("botao-apagar-tudo");

  if (estaNoTauri()) {
    botaoExportarJson.addEventListener("click", comCarregando(botaoExportarJson, "Exportando…", exportarJson));
    botaoExportarTexto.addEventListener("click", comCarregando(botaoExportarTexto, "Exportando…", exportarTexto));
    botaoBackupManual.addEventListener("click", comCarregando(botaoBackupManual, "Criando backup…", criarBackupManual));
    botaoRestaurarArquivo.addEventListener("click", comCarregando(botaoRestaurarArquivo, "Restaurando…", restaurarDeArquivo));
  } else {
    // Web: sem acesso a diálogo nativo/sistema de arquivos — desabilita em
    // vez de esconder, para ficar claro que a função existe (só não aqui).
    for (const botao of [botaoExportarJson, botaoExportarTexto, botaoBackupManual, botaoRestaurarArquivo]) {
      botao.disabled = true;
      botao.title = MENSAGEM_SO_DESKTOP;
    }
  }
  botaoApagarTudo.addEventListener("click", comCarregando(botaoApagarTudo, "Apagando…", tratarApagarTudo));
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

  const dadosConfiguracoes = await armazenamentoAtivo.lerConfig("configuracoes");
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
        const salario = g.salarioResponsavel === "dia30" ? "salário dia 30" : "salário dia 15";
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

  const ROTULOS_PRIORIDADE_TEXTO = { alta: "alta", media: "média", baixa: "baixa", sem_definida: "sem prioridade definida" };
  linhas.push(`=== METAS/WISHLIST (${metas.length} cadastrada${metas.length === 1 ? "" : "s"}) ===`);
  if (metas.length === 0) {
    linhas.push("(nenhuma meta cadastrada)");
  } else {
    metas.forEach((m) => {
      // Preço é opcional (Wishlist) — omitido do texto quando não informado,
      // em vez de aparecer como "R$ 0,00".
      const partes = [
        m.nome,
        m.valorDesejado != null ? `preço: ${formatarMoeda(m.valorDesejado)}` : null,
        m.loja ? `loja: ${m.loja}` : null,
        `prioridade ${ROTULOS_PRIORIDADE_TEXTO[m.prioridade] || ROTULOS_PRIORIDADE_TEXTO.sem_definida}`,
        m.link ? `link: ${m.link}` : null,
        m.observacoes ? `obs: ${m.observacoes}` : null,
      ].filter(Boolean);
      linhas.push(`- ${partes.join(" | ")}`);
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

  const configuracoes = await armazenamentoAtivo.lerConfig("configuracoes");
  const destinoConfig = await path.join(caminhoBackup, "configuracoes.json");
  await fs.writeTextFile(destinoConfig, JSON.stringify(configuracoes, null, 2));

  mostrarStatus(`Backup criado em: ${caminhoBackup}`);
}

// ==================== 4. Sistema de restauração ====================

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

  // Correção (auditoria 2026-08-09, BUG-02): antes, qualquer item de
  // ganhos/gastos/lembretes era aceito sem checar o formato — um `valor` em
  // texto, uma `data` inválida ou um `id` duplicado entravam sem aviso e
  // corrompiam cálculos daquele mês silenciosamente. Agora cada item passa
  // por `validarESanearItens` antes de ser gravado; itens descartados são
  // contados e informados no status final, em vez de sumirem sem explicação.
  const ganhosValidados = validarESanearItens("ganhos", dados.ganhos);
  const gastosValidados = validarESanearItens("gastos", dados.gastos);
  const lembretesValidados = validarESanearItens("lembretes", dados.lembretes);
  const totalDescartados = ganhosValidados.descartados.length + gastosValidados.descartados.length + lembretesValidados.descartados.length;

  const avisoDescarte =
    totalDescartados > 0
      ? `\n\nAtenção: ${totalDescartados} item(ns) desse arquivo têm um formato inválido (id, título, valor ou data ausente/incorreto) e serão IGNORADOS na restauração.`
      : "";

  const confirmou = confirm(
    `Restaurar este arquivo vai SUBSTITUIR todos os seus dados atuais (ganhos, gastos, lembretes e configurações) pelos dados desse arquivo.\n\nEsta ação não pode ser desfeita pela interface — se quiser poder voltar atrás, exporte/faça backup dos dados atuais primeiro. Deseja continuar?${avisoDescarte}`
  );
  if (!confirmou) return;

  await armazenamentoAtivo.substituirTudo("ganhos", ganhosValidados.validos);
  await armazenamentoAtivo.substituirTudo("gastos", gastosValidados.validos);
  await armazenamentoAtivo.substituirTudo("lembretes", lembretesValidados.validos);
  if (dados.configuracoes) {
    await armazenamentoAtivo.salvarConfig("configuracoes", { configuracoes: dados.configuracoes });
  }
  // "metas" e "categorias" são opcionais na validação acima: exportações
  // feitas antes de cada funcionalidade existir não têm esses campos, e
  // restaurá-las não deve apagar os dados atuais do usuário nessas coleções.
  if (Array.isArray(dados.metas)) {
    await armazenamentoAtivo.substituirTudo("metas", dados.metas);
  }
  if (Array.isArray(dados.categorias)) {
    await armazenamentoAtivo.substituirTudo("categorias", dados.categorias);
  }

  await recarregarGanhos();
  await recarregarGastos();
  await recarregarLembretes();
  await recarregarMetas();
  await categoriasService.recarregar();

  mostrarStatus(
    totalDescartados > 0
      ? `Restauração concluída, mas ${totalDescartados} item(ns) inválido(s) foram ignorados (não entraram nos dados restaurados).`
      : "Restauração concluída com sucesso."
  );
}

// ==================== 5. Apagar todos os dados ====================

// Zera gastos/ganhos/lembretes/metas no Supabase — mesmo escopo de
// dados/armazenamento.js#apagarTodosOsDados (a versão local, usada só pela
// ArmazenamentoLocalService/testes). "configuracoes" nunca é apagado de
// propósito (não é dado financeiro do usuário, é config).
async function apagarTodosOsDadosSupabase() {
  for (const colecao of ["gastos", "ganhos", "lembretes", "metas"]) {
    await armazenamentoAtivo.substituirTudo(colecao, []);
  }
}

async function tratarApagarTudo() {
  const primeiraConfirmacao = confirm(
    "Isso vai apagar PERMANENTEMENTE todos os ganhos, gastos, lembretes e metas cadastrados (de todos os meses). As configurações não são afetadas.\n\nEsta ação não pode ser desfeita pela interface — se quiser poder voltar atrás, exporte/faça backup dos dados atuais primeiro (só no Desktop). Deseja continuar?"
  );
  if (!primeiraConfirmacao) return;

  const segundaConfirmacao = confirm('Tem certeza mesmo? Digite mentalmente "sim" e confirme para apagar todos os dados agora.');
  if (!segundaConfirmacao) return;

  await apagarTodosOsDadosSupabase();

  await recarregarGanhos();
  await recarregarGastos();
  await recarregarLembretes();
  await recarregarMetas();

  mostrarStatus("Todos os dados foram apagados.");
}

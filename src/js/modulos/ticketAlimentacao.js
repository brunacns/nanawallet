// Página do Ticket Alimentação/benefícios — Etapa 4 (última planejada) do
// sistema de carteiras (Etapa 1: fundação/exclusão do financeiro principal.
// Etapa 2: página, saldo e histórico do benefício. Etapa 3: recorrência
// automática do crédito + saldo acumulado). Esta etapa entrega o indicador
// de ritmo de consumo e a previsão do próximo recebimento.
import { transacoesGastos, carteirasService, carteiraEntradasService } from "../servicos/index.js";
import { abrirModalNovoGasto, abrirModalEdicaoGasto, excluirGastoInterativo } from "./gastos.js";
import { chipCategoria, obterCategoriaPorId } from "../categorias.js";
import { obterCarteiraBeneficioPrincipal, calcularSaldoCarteira, calcularProximoRecebimento, calcularRitmoConsumo } from "../carteiras.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { hojeISO, mesDeData, chaveMesAtual, rotuloMesLongo } from "../utils/datas.js";
import { obterMesSelecionado, avancarMes, retrocederMes, irParaMesAtual, aoAtualizarMes } from "../estadoMes.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";
import { mostrarToast } from "../utils/toast.js";

export async function iniciarPaginaTicketAlimentacao() {
  document.getElementById("ticket-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("ticket-mes-seguinte").addEventListener("click", avancarMes);
  document.getElementById("ticket-mes-atual").addEventListener("click", irParaMesAtual);
  document.getElementById("botao-novo-gasto-ticket").addEventListener("click", () => {
    const carteira = obterCarteiraBeneficioPrincipal();
    if (carteira) abrirModalNovoGasto(carteira.id);
  });
  document.getElementById("formulario-config-ticket").addEventListener("submit", salvarConfiguracao);
  document.getElementById("formulario-recebimento-ticket").addEventListener("submit", lancarRecebimento);
  document.getElementById("ticket-corpo-tabela").addEventListener("click", tratarCliqueTabela);

  aoAtualizarMes(renderizar);
  aoAtualizarMes(sincronizarEntradas);
  transacoesGastos.aoAtualizar(renderizar);
  carteirasService.aoAtualizar(renderizar);
  carteiraEntradasService.aoAtualizar(renderizar);

  await sincronizarEntradas();
  renderizar();
}

// Garante que toda carteira de benefício ativa e recorrente tenha a entrada
// automática gerada até o mês atual (real) e até o mês que estiver sendo
// visualizado, o que for mais tarde — mesmo padrão de sincronizarRecorrencias
// em gastos.js/ganhos.js para itens fixos.
async function sincronizarEntradas() {
  const mesAtual = chaveMesAtual();
  const mesVisto = obterMesSelecionado();
  const mesAlvo = mesVisto > mesAtual ? mesVisto : mesAtual;
  await carteiraEntradasService.sincronizarEntradas(carteirasService.obterTodos(), mesAlvo);
}

function renderizar() {
  const carteira = obterCarteiraBeneficioPrincipal();
  if (!carteira) return; // não deveria acontecer — a carteira é seedada na inicialização.

  const mes = obterMesSelecionado();
  document.getElementById("ticket-mes-rotulo").textContent = rotuloMesLongo(mes);

  renderizarConfiguracao(carteira);

  const todasEntradas = carteiraEntradasService.obterTodos();
  const todosGastos = transacoesGastos.obterTodos();
  const { recebidoMes, gastoMes, saldoAnterior, disponivel, saldoAtual, acumula } = calcularSaldoCarteira(carteira, todasEntradas, todosGastos, mes);

  const entradasDoMes = todasEntradas.filter((e) => e.carteiraId === carteira.id && mesDeData(e.data) === mes);
  const gastosDoMes = todosGastos.filter((g) => g.carteiraId === carteira.id && mesDeData(g.data) === mes);

  document.getElementById("ticket-saldo-atual").textContent = formatarMoeda(saldoAtual);
  document.getElementById("ticket-saldo-atual").classList.toggle("cartao-estatistica__valor--positivo", saldoAtual > 0);
  document.getElementById("ticket-saldo-atual").classList.toggle("cartao-estatistica__valor--negativo", saldoAtual <= 0);
  document.getElementById("ticket-recebido-mes").textContent = formatarMoeda(recebidoMes);
  document.getElementById("ticket-gasto-mes").textContent = formatarMoeda(gastoMes);

  renderizarComposicaoSaldo(acumula, saldoAnterior, recebidoMes);
  renderizarBarraProgresso(disponivel, gastoMes);
  renderizarGastosPorCategoria(gastosDoMes, gastoMes);
  renderizarTabela(entradasDoMes, gastosDoMes);
  renderizarProximoRecebimento(carteira);
  renderizarRitmoConsumo(carteira, todasEntradas, todosGastos);
}

// "Próximo Ticket Alimentação: R$ 990,00 / Recebimento em 01/09/2026 / Faltam
// 24 dias" — só aparece para um benefício ativo e recorrente; sem isso não
// existe uma data confiável para prever (pedido explícito: não mostrar uma
// previsão falsa quando o benefício não é recorrente).
function renderizarProximoRecebimento(carteira) {
  const cartao = document.getElementById("ticket-cartao-proximo");
  const proximo = calcularProximoRecebimento(carteira, hojeISO());

  if (!proximo) {
    cartao.hidden = true;
    return;
  }

  cartao.hidden = false;
  document.getElementById("ticket-proximo-valor").textContent = formatarMoeda(proximo.valor);
  const dias = proximo.diasRestantes;
  const rotuloDias = dias === 0 ? "É hoje!" : dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`;
  document.getElementById("ticket-proximo-detalhe").textContent = `Recebimento em ${formatarData(proximo.data)} · ${rotuloDias}`;
}

const TEXTO_STATUS_RITMO = {
  verde: "🟢 Dentro do ritmo esperado",
  amarelo: "🟡 Gastando acima do ritmo esperado",
  vermelho: "🔴 O saldo pode acabar antes do próximo crédito",
};

// Indicador de ritmo de consumo — fica oculto sempre que não houver dados
// suficientes para um cálculo confiável (`calcularRitmoConsumo` devolve
// `null` nesses casos: benefício não recorrente/inativo, hoje é o próprio
// dia do crédito, ou ainda não existe nenhuma entrada registrada).
function renderizarRitmoConsumo(carteira, todasEntradas, todosGastos) {
  const cartao = document.getElementById("ticket-cartao-ritmo");
  const ritmo = calcularRitmoConsumo(carteira, todasEntradas, todosGastos, hojeISO());

  if (!ritmo) {
    cartao.hidden = true;
    return;
  }

  cartao.hidden = false;
  const statusEl = document.getElementById("ticket-ritmo-status");
  statusEl.textContent = TEXTO_STATUS_RITMO[ritmo.status];
  statusEl.className = `ritmo-status--${ritmo.status}`;

  document.getElementById("ticket-ritmo-detalhe").textContent =
    `Gasto médio diário: ${formatarMoeda(ritmo.gastoMedioDiario)} · ` +
    `Disponível por dia: ${formatarMoeda(ritmo.valorDisponivelPorDia)} · ` +
    `Faltam ${ritmo.diasRestantes} dia${ritmo.diasRestantes === 1 ? "" : "s"}`;
}

// "Se houver saldo acumulado, deixar claro quanto veio do mês anterior e
// quanto foi recebido no mês atual" — só aparece quando "acumula saldo"
// está ligado (sem isso, não existe saldo vindo de outro mês para explicar).
function renderizarComposicaoSaldo(acumula, saldoAnterior, recebidoMes) {
  const el = document.getElementById("ticket-composicao-saldo");
  if (!acumula) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `Saldo vindo do mês anterior: ${formatarMoeda(saldoAnterior)} · Recebido este mês: ${formatarMoeda(recebidoMes)}`;
}

function renderizarConfiguracao(carteira) {
  // Evita sobrescrever o que a usuária está digitando caso um evento de
  // atualização chegue com o formulário de configuração em foco (ex: outra
  // aba salvando um gasto ao mesmo tempo).
  if (document.activeElement && document.getElementById("formulario-config-ticket").contains(document.activeElement)) return;

  document.getElementById("ticket-config-nome").value = carteira.nome;
  document.getElementById("ticket-config-valor-mensal").value = carteira.beneficio?.valorMensal || 0;
  document.getElementById("ticket-config-dia-recebimento").value = carteira.beneficio?.diaRecebimento || 1;
  document.getElementById("ticket-config-recorrente").checked = !!carteira.beneficio?.recorrente;
  document.getElementById("ticket-config-acumula-saldo").checked = carteira.beneficio?.acumulaSaldo !== false;
  document.getElementById("ticket-config-ativo").checked = !!carteira.ativa;
}

async function salvarConfiguracao(evento) {
  evento.preventDefault();
  const carteira = obterCarteiraBeneficioPrincipal();
  if (!carteira) return;

  const valorMensal = Number(document.getElementById("ticket-config-valor-mensal").value) || 0;
  const diaRecebimento = Math.min(31, Math.max(1, Number(document.getElementById("ticket-config-dia-recebimento").value) || 1));
  const recorrente = document.getElementById("ticket-config-recorrente").checked;
  const acumulaSaldo = document.getElementById("ticket-config-acumula-saldo").checked;
  const ativa = document.getElementById("ticket-config-ativo").checked;

  // `ativoDesde` marca a partir de quando a recorrência automática (Etapa 3)
  // deve gerar créditos — grava só na primeira vez que "recorrente" é ligado,
  // nunca retroage automaticamente para não creditar meses que já passaram.
  const ativoDesde = recorrente && !carteira.beneficio?.ativoDesde ? hojeISO() : carteira.beneficio?.ativoDesde || null;

  carteira.ativa = ativa;
  carteira.beneficio = { valorMensal, diaRecebimento, recorrente, acumulaSaldo, ativoDesde };
  await carteirasService.salvar(carteira);
}

async function lancarRecebimento(evento) {
  evento.preventDefault();
  const carteira = obterCarteiraBeneficioPrincipal();
  if (!carteira) return;

  const valor = Number(document.getElementById("ticket-recebimento-valor").value);
  const data = document.getElementById("ticket-recebimento-data").value;
  const observacoes = document.getElementById("ticket-recebimento-observacoes").value.trim();
  if (!(valor > 0) || !data) return;

  await carteiraEntradasService.salvar({
    id: crypto.randomUUID(),
    carteiraId: carteira.id,
    valor,
    data,
    automatica: false,
    observacoes,
  });

  document.getElementById("formulario-recebimento-ticket").reset();
  mostrarToast("Recebimento lançado");
}

// `disponivel` = saldo do mês anterior (se "acumula saldo") + recebido deste
// mês — a base sobre a qual o percentual utilizado é calculado. Sem
// acumular, `disponivel` é só o recebido deste mês (mesmo cálculo da Etapa 2).
function renderizarBarraProgresso(disponivel, gastoMes) {
  const preenchimento = document.getElementById("ticket-barra-preenchimento");
  const legenda = document.getElementById("ticket-barra-legenda");
  const percentualEl = document.getElementById("ticket-percentual-utilizado");

  if (disponivel <= 0) {
    preenchimento.style.width = gastoMes > 0 ? "100%" : "0%";
    preenchimento.classList.toggle("barra-progresso__preenchimento--excedido", gastoMes > 0);
    percentualEl.textContent = "—";
    legenda.textContent = gastoMes > 0 ? `${formatarMoeda(gastoMes)} gastos sem nenhum saldo disponível neste mês.` : "Nenhum saldo disponível neste mês ainda.";
    return;
  }

  const percentual = (gastoMes / disponivel) * 100;
  const excedido = percentual > 100;
  preenchimento.style.width = `${Math.min(percentual, 100)}%`;
  preenchimento.classList.toggle("barra-progresso__preenchimento--excedido", excedido);
  percentualEl.textContent = `${Math.round(percentual)}%`;
  legenda.textContent = excedido
    ? `Gastos excedem o saldo disponível neste mês em ${formatarMoeda(gastoMes - disponivel)}.`
    : `${formatarMoeda(disponivel - gastoMes)} ainda disponíveis este mês.`;
}

function renderizarGastosPorCategoria(gastosDoMes, gastoMes) {
  const container = document.getElementById("ticket-gastos-categoria");

  if (gastosDoMes.length === 0) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">Nenhum gasto com o benefício neste mês.</li>`;
    return;
  }

  const porCategoria = new Map();
  for (const gasto of gastosDoMes) {
    const chave = gasto.categoriaId || "sem";
    porCategoria.set(chave, (porCategoria.get(chave) || 0) + gasto.valor);
  }

  const ranking = [...porCategoria.entries()]
    .map(([chave, valor]) => ({
      nome: chave === "sem" ? "Sem categoria" : obterCategoriaPorId(chave)?.nome || "Sem categoria",
      emoji: chave === "sem" ? "🏷️" : obterCategoriaPorId(chave)?.emoji || "🏷️",
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);

  container.innerHTML = ranking
    .map((r) => {
      const pct = gastoMes > 0 ? Math.round((r.valor / gastoMes) * 100) : 0;
      return `
        <li class="item-diagnostico">
          <span class="item-diagnostico__ponto item-diagnostico__ponto--neutro"></span>
          <span>${escaparHtml(r.emoji)} ${escaparHtml(r.nome)}: ${formatarMoeda(r.valor)} (${pct}%)</span>
        </li>
      `;
    })
    .join("");
}

function renderizarTabela(entradasDoMes, gastosDoMes) {
  const corpo = document.getElementById("ticket-corpo-tabela");
  const estadoVazio = document.getElementById("ticket-estado-vazio");

  const movimentacoes = [
    ...entradasDoMes.map((e) => ({ tipo: "entrada", data: e.data, valor: e.valor, id: e.id, observacoes: e.observacoes })),
    ...gastosDoMes.map((g) => ({ tipo: "gasto", data: g.data, valor: g.valor, id: g.id, titulo: g.titulo, categoriaId: g.categoriaId })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  if (movimentacoes.length === 0) {
    corpo.innerHTML = "";
    estadoVazio.hidden = false;
    return;
  }

  estadoVazio.hidden = true;
  corpo.innerHTML = movimentacoes.map(linhaMovimentacao).join("");
}

function linhaMovimentacao(m) {
  if (m.tipo === "entrada") {
    const descricao = m.observacoes ? escaparHtml(m.observacoes) : "Recebimento";
    return `
      <tr data-id="${m.id}" data-tipo="entrada">
        <td data-rotulo="Data">${formatarData(m.data)}</td>
        <td class="tabela__titulo-celula" data-rotulo="Descrição">${descricao}</td>
        <td data-rotulo="Categoria">—</td>
        <td class="tabela__valor-positivo" data-rotulo="Valor">+ ${formatarMoeda(m.valor)}</td>
        <td class="tabela__acoes">
          <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir-entrada" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
        </td>
      </tr>
    `;
  }

  return `
    <tr data-id="${m.id}" data-tipo="gasto">
      <td data-rotulo="Data">${formatarData(m.data)}</td>
      <td class="tabela__titulo-celula" data-rotulo="Descrição">${escaparHtml(m.titulo)}</td>
      <td data-rotulo="Categoria">${chipCategoria(m.categoriaId)}</td>
      <td class="tabela__valor-negativo" data-rotulo="Valor">- ${formatarMoeda(m.valor)}</td>
      <td class="tabela__acoes">
        <button type="button" class="botao-icone" data-acao="editar-gasto" title="Editar" aria-label="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir-gasto" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
      </td>
    </tr>
  `;
}

function tratarCliqueTabela(evento) {
  const alvo = evento.target.closest("[data-acao]");
  if (!alvo) return;
  const id = alvo.closest("tr[data-id]").dataset.id;

  if (alvo.dataset.acao === "editar-gasto") abrirModalEdicaoGasto(id);
  else if (alvo.dataset.acao === "excluir-gasto") excluirGastoInterativo(id);
  else if (alvo.dataset.acao === "excluir-entrada") excluirEntrada(id);
}

async function excluirEntrada(id) {
  const entrada = carteiraEntradasService.obterTodos().find((e) => e.id === id);
  if (!entrada) return;
  const confirmou = confirm(`Excluir este recebimento de ${formatarMoeda(entrada.valor)}?`);
  if (!confirmou) return;
  await carteiraEntradasService.remover(id);
  mostrarToast("Recebimento excluído", "exclusao");
}

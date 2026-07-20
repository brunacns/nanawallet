import { transacoesGastos } from "../servicos/index.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";
import { chaveMesAtual, hojeISO, rotuloMesLongo } from "../utils/datas.js";
import { obterMesSelecionado, avancarMes, retrocederMes, aoAtualizarMes } from "../estadoMes.js";

let idEmEdicao = null;
let mostrarHistorico = false;

// Permite que outros módulos (ex: parcelamentos.js, dashboard.js, graficos.js)
// sejam avisados sempre que a lista de gastos mudar, sem duplicar o estado.
// Repassa direto para o serviço, que é quem realmente guarda o estado agora.
export function aoAtualizarGastos(callback) {
  transacoesGastos.aoAtualizar(callback);
}

export function obterGastos() {
  return transacoesGastos.obterTodos();
}

// Recarrega os gastos do disco e atualiza a tela (usado após uma restauração).
export async function recarregarGastos() {
  await transacoesGastos.recarregar();
}

// Adiciona vários gastos de uma vez (usado pelo gerador de parcelamentos).
export async function adicionarGastosEmLote(novosGastos) {
  await transacoesGastos.salvarEmLote(novosGastos);
}

export async function iniciarPaginaGastos() {
  document.getElementById("botao-novo-gasto").addEventListener("click", abrirModalNovo);
  document.getElementById("botao-fechar-modal-gasto").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-gasto").addEventListener("click", fecharModal);
  document.getElementById("sobreposicao-gasto").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-gasto") fecharModal();
  });
  document.getElementById("formulario-gasto").addEventListener("submit", salvarFormulario);
  document.getElementById("gastos-corpo-tabela").addEventListener("click", tratarCliqueLista);
  document.getElementById("gastos-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("gastos-mes-seguinte").addEventListener("click", avancarMes);
  document.getElementById("gastos-mostrar-historico").addEventListener("change", (evento) => {
    mostrarHistorico = evento.target.checked;
    renderizar();
  });

  // O serviço avisa sozinho sempre que os dados mudarem (carregar, salvar,
  // remover, lote) — não precisa mais chamar renderizar() manualmente depois
  // de cada operação, como antes.
  transacoesGastos.aoAtualizar(renderizar);
  aoAtualizarMes(sincronizarRecorrencias);

  await transacoesGastos.listar();
  await sincronizarRecorrencias();
}

// Garante que todo gasto fixo tenha uma ocorrência gerada até o mês atual
// (real) e até o mês que estiver sendo visualizado, o que for mais tarde.
async function sincronizarRecorrencias() {
  const mesAtual = chaveMesAtual();
  const mesVisto = obterMesSelecionado();
  const mesAlvo = mesVisto > mesAtual ? mesVisto : mesAtual;
  await transacoesGastos.sincronizarRecorrencias(mesAlvo);
}

function renderizar() {
  const gastos = transacoesGastos.obterTodos();
  const mesSelecionado = obterMesSelecionado();
  document.getElementById("gastos-mes-rotulo").textContent = rotuloMesLongo(mesSelecionado);

  const doMes = gastos.filter((g) => g.mesReferencia === mesSelecionado);
  const total = doMes.reduce((soma, g) => soma + g.valor, 0);
  document.getElementById("gastos-total").textContent = `Total: ${formatarMoeda(total)}`;

  const hoje = hojeISO();
  const visiveis = doMes.filter((g) => mostrarHistorico || !(g.pago && g.data < hoje));

  const corpo = document.getElementById("gastos-corpo-tabela");
  const estadoVazio = document.getElementById("gastos-estado-vazio");

  if (visiveis.length === 0) {
    corpo.innerHTML = "";
    estadoVazio.hidden = false;
    estadoVazio.textContent =
      doMes.length === 0 ? "Nenhum gasto neste mês." : "Todos os gastos deste mês já foram pagos (marque \"mostrar histórico\" para vê-los).";
  } else {
    estadoVazio.hidden = true;
    corpo.innerHTML = ordenarGastos(visiveis).map(linhaGasto).join("");
  }
}

// Gastos fixos sempre no topo; dentro de cada grupo, do mais antigo para o mais recente.
function ordenarGastos(lista) {
  return [...lista].sort((a, b) => {
    if (a.fixo !== b.fixo) return a.fixo ? -1 : 1;
    return a.data.localeCompare(b.data);
  });
}

function linhaGasto(gasto) {
  const rotuloSalario = gasto.salarioResponsavel === "dia25" ? "Dia 25" : "Dia 10";
  const rotuloTipo = gasto.fixo
    ? '<span class="selo selo--alerta">Fixo</span>'
    : gasto.parcela
    ? `<span class="selo selo--neutro">Parcela ${gasto.parcela.numero}/${gasto.parcela.total}</span>`
    : '<span class="selo selo--neutro">Único</span>';
  const rotuloStatus = gasto.pago
    ? '<span class="selo selo--positivo">Pago</span>'
    : '<span class="selo selo--negativo">Pendente</span>';

  return `
    <tr data-id="${gasto.id}" class="${gasto.pago ? "linha-paga" : ""}">
      <td>
        <div class="caixa-toggle ${gasto.pago ? "marcada" : ""}" data-acao="alternar-pago" title="Marcar como pago" style="cursor: pointer;"></div>
      </td>
      <td>${escaparHtml(gasto.titulo)}</td>
      <td>${formatarData(gasto.data)}</td>
      <td class="tabela__valor-negativo">${formatarMoeda(gasto.valor)}</td>
      <td>${rotuloSalario} (${rotuloMesLongo(gasto.mesReferencia)})</td>
      <td>${rotuloStatus}</td>
      <td>${rotuloTipo}</td>
      <td class="tabela__acoes">
        <button type="button" class="botao-icone" data-acao="editar" title="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir">${svgExcluir}</button>
      </td>
    </tr>
  `;
}

function tratarCliqueLista(evento) {
  const alvo = evento.target.closest("[data-acao]");
  if (!alvo) return;
  const id = alvo.closest("tr[data-id]").dataset.id;

  if (alvo.dataset.acao === "editar") abrirModalEdicao(id);
  else if (alvo.dataset.acao === "excluir") excluirGasto(id);
  else if (alvo.dataset.acao === "alternar-pago") alternarPago(id);
}

async function alternarPago(id) {
  const gasto = transacoesGastos.obterTodos().find((g) => g.id === id);
  if (!gasto) return;
  gasto.pago = !gasto.pago;
  await transacoesGastos.salvar(gasto);
}

function abrirModalNovo() {
  idEmEdicao = null;
  document.getElementById("modal-gasto-titulo").textContent = "Novo gasto";
  document.getElementById("formulario-gasto").reset();
  document.getElementById("campo-mes-referencia-gasto").value = obterMesSelecionado();
  abrirModal();
}

function abrirModalEdicao(id) {
  const gasto = transacoesGastos.obterTodos().find((g) => g.id === id);
  if (!gasto) return;

  idEmEdicao = id;
  document.getElementById("modal-gasto-titulo").textContent = "Editar gasto";
  document.getElementById("campo-titulo-gasto").value = gasto.titulo;
  document.getElementById("campo-valor-gasto").value = gasto.valor;
  document.getElementById("campo-data-gasto").value = gasto.data;
  document.getElementById("campo-mes-referencia-gasto").value = gasto.mesReferencia;
  document.getElementById("campo-salario-gasto").value = gasto.salarioResponsavel;
  document.getElementById("campo-fixo-gasto").checked = gasto.fixo;
  document.getElementById("campo-pago-gasto").checked = gasto.pago;
  abrirModal();
}

function abrirModal() {
  document.getElementById("sobreposicao-gasto").hidden = false;
  document.getElementById("campo-titulo-gasto").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-gasto").hidden = true;
  idEmEdicao = null;
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const titulo = document.getElementById("campo-titulo-gasto").value.trim();
  const valor = Number(document.getElementById("campo-valor-gasto").value);
  const data = document.getElementById("campo-data-gasto").value;
  const mesReferencia = document.getElementById("campo-mes-referencia-gasto").value;
  const salarioResponsavel = document.getElementById("campo-salario-gasto").value;
  const fixo = document.getElementById("campo-fixo-gasto").checked;
  const pago = document.getElementById("campo-pago-gasto").checked;

  if (!titulo || !data || !mesReferencia || !(valor > 0)) return;

  let gastoSalvo;

  if (idEmEdicao) {
    gastoSalvo = transacoesGastos.obterTodos().find((g) => g.id === idEmEdicao);
    gastoSalvo.titulo = titulo;
    gastoSalvo.valor = valor;
    gastoSalvo.data = data;
    gastoSalvo.mesReferencia = mesReferencia;
    gastoSalvo.salarioResponsavel = salarioResponsavel;
    gastoSalvo.pago = pago;
    // Ativar "fixo" pela primeira vez cria a série; desativar interrompe
    // a geração de novas ocorrências, mas não apaga as já criadas.
    if (fixo && !gastoSalvo.fixoId) gastoSalvo.fixoId = crypto.randomUUID();
    if (!fixo) gastoSalvo.fixoId = null;
    gastoSalvo.fixo = fixo;
  } else {
    gastoSalvo = {
      id: crypto.randomUUID(),
      titulo,
      valor,
      data,
      mesReferencia,
      salarioResponsavel,
      fixo,
      fixoId: fixo ? crypto.randomUUID() : null,
      pago,
      parcela: null,
    };
  }

  await transacoesGastos.salvar(gastoSalvo);
  fecharModal();
}

async function excluirGasto(id) {
  const gasto = transacoesGastos.obterTodos().find((g) => g.id === id);
  if (!gasto) return;

  const confirmou = confirm(`Excluir o gasto "${gasto.titulo}"?`);
  if (!confirmou) return;

  await transacoesGastos.remover(id);
}

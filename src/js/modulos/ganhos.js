import { transacoesGanhos } from "../servicos/index.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";
import { diaDoMes, mesDeData, chaveMesAtual, hojeISO, rotuloMesLongo } from "../utils/datas.js";
import { obterMesSelecionado, avancarMes, retrocederMes, aoAtualizarMes } from "../estadoMes.js";

let idEmEdicao = null;
let mostrarHistorico = false;

// Permite que outros módulos (ex: dashboard.js, graficos.js) sejam avisados
// sempre que a lista de ganhos mudar, sem duplicar o estado. Repassa direto
// para o serviço, que é quem realmente guarda o estado agora.
export function aoAtualizarGanhos(callback) {
  transacoesGanhos.aoAtualizar(callback);
}

export function obterGanhos() {
  return transacoesGanhos.obterTodos();
}

// Recarrega os ganhos do disco e atualiza a tela (usado após uma restauração).
export async function recarregarGanhos() {
  await transacoesGanhos.recarregar();
}

export async function iniciarPaginaGanhos() {
  document.getElementById("botao-novo-ganho").addEventListener("click", abrirModalNovo);
  document.getElementById("botao-fechar-modal-ganho").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-ganho").addEventListener("click", fecharModal);
  document.getElementById("sobreposicao-ganho").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-ganho") fecharModal();
  });
  document.getElementById("formulario-ganho").addEventListener("submit", salvarFormulario);
  document.getElementById("ganhos-conteudo").addEventListener("click", tratarCliqueLista);
  document.getElementById("ganhos-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("ganhos-mes-seguinte").addEventListener("click", avancarMes);
  document.getElementById("ganhos-mostrar-historico").addEventListener("change", (evento) => {
    mostrarHistorico = evento.target.checked;
    renderizar();
  });

  // O serviço avisa sozinho sempre que os dados mudarem (carregar, salvar,
  // remover, lote) — não precisa mais chamar renderizar() manualmente depois
  // de cada operação, como antes.
  transacoesGanhos.aoAtualizar(renderizar);
  aoAtualizarMes(sincronizarRecorrencias);

  await transacoesGanhos.listar();
  await sincronizarRecorrencias();
}

// Garante que todo ganho fixo tenha uma ocorrência gerada até o mês atual
// (real) e até o mês que estiver sendo visualizado, o que for mais tarde.
async function sincronizarRecorrencias() {
  const mesAtual = chaveMesAtual();
  const mesVisto = obterMesSelecionado();
  const mesAlvo = mesVisto > mesAtual ? mesVisto : mesAtual;
  await transacoesGanhos.sincronizarRecorrencias(mesAlvo);
}

function renderizar() {
  const ganhos = transacoesGanhos.obterTodos();
  const mesSelecionado = obterMesSelecionado();
  document.getElementById("ganhos-mes-rotulo").textContent = rotuloMesLongo(mesSelecionado);

  const doMes = ganhos.filter((g) => mesDeData(g.data) === mesSelecionado);
  const total = doMes.reduce((soma, g) => soma + g.valor, 0);
  document.getElementById("ganhos-total").textContent = `Total: ${formatarMoeda(total)}`;

  const hoje = hojeISO();
  const visiveis = doMes.filter((g) => mostrarHistorico || !(g.recebido && g.data < hoje));

  const container = document.getElementById("ganhos-conteudo");
  container.innerHTML = "";

  if (visiveis.length === 0) {
    const mensagem =
      doMes.length === 0 ? "Nenhum ganho neste mês." : 'Todos os ganhos deste mês já foram recebidos (marque "mostrar histórico" para vê-los).';
    container.innerHTML = `<p class="estado-vazio">${mensagem}</p>`;
  } else {
    for (const grupo of agruparPorDia(visiveis)) {
      if (grupo.itens.length > 0) {
        container.appendChild(criarCartaoGrupo(grupo));
      }
    }
  }
}

function agruparPorDia(lista) {
  const ordenarPorData = (a, b) => a.data.localeCompare(b.data);
  const dia10 = lista.filter((g) => diaDoMes(g.data) === 10).sort(ordenarPorData);
  const dia25 = lista.filter((g) => diaDoMes(g.data) === 25).sort(ordenarPorData);
  const outros = lista.filter((g) => ![10, 25].includes(diaDoMes(g.data))).sort(ordenarPorData);

  return [
    { titulo: "Recebidos no dia 10", itens: dia10 },
    { titulo: "Recebidos no dia 25", itens: dia25 },
    { titulo: "Outras datas", itens: outros },
  ];
}

function criarCartaoGrupo(grupo) {
  const subtotal = grupo.itens.reduce((soma, g) => soma + g.valor, 0);

  const cartao = document.createElement("div");
  cartao.className = "cartao";
  cartao.style.marginBottom = "var(--espaco-md)";
  cartao.innerHTML = `
    <div class="cartao__cabecalho-grupo">
      <span class="cartao__titulo" style="margin-bottom:0">${grupo.titulo}</span>
      <span class="cartao__subtotal">${formatarMoeda(subtotal)}</span>
    </div>
    <table class="tabela">
      <thead>
        <tr>
          <th></th>
          <th>Título</th>
          <th>Data</th>
          <th>Valor</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${grupo.itens.map(linhaGanho).join("")}
      </tbody>
    </table>
  `;
  return cartao;
}

function linhaGanho(ganho) {
  const rotuloTipo = ganho.fixo ? '<span class="selo selo--alerta">Fixo</span>' : "";
  return `
    <tr data-id="${ganho.id}" class="${ganho.recebido ? "linha-paga" : ""}">
      <td>
        <div class="caixa-toggle ${ganho.recebido ? "marcada" : ""}" data-acao="alternar-recebido" title="Marcar como recebido" style="cursor: pointer;"></div>
      </td>
      <td>${escaparHtml(ganho.titulo)} ${rotuloTipo}</td>
      <td>${formatarData(ganho.data)}</td>
      <td class="tabela__valor-positivo">${formatarMoeda(ganho.valor)}</td>
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
  else if (alvo.dataset.acao === "excluir") excluirGanho(id);
  else if (alvo.dataset.acao === "alternar-recebido") alternarRecebido(id);
}

async function alternarRecebido(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;
  ganho.recebido = !ganho.recebido;
  await transacoesGanhos.salvar(ganho);
}

function abrirModalNovo() {
  idEmEdicao = null;
  document.getElementById("modal-ganho-titulo").textContent = "Novo ganho";
  document.getElementById("formulario-ganho").reset();
  abrirModal();
}

function abrirModalEdicao(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;

  idEmEdicao = id;
  document.getElementById("modal-ganho-titulo").textContent = "Editar ganho";
  document.getElementById("campo-titulo-ganho").value = ganho.titulo;
  document.getElementById("campo-valor-ganho").value = ganho.valor;
  document.getElementById("campo-data-ganho").value = ganho.data;
  document.getElementById("campo-recebido-ganho").checked = ganho.recebido;
  document.getElementById("campo-fixo-ganho").checked = ganho.fixo;
  abrirModal();
}

function abrirModal() {
  document.getElementById("sobreposicao-ganho").hidden = false;
  document.getElementById("campo-titulo-ganho").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-ganho").hidden = true;
  idEmEdicao = null;
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const titulo = document.getElementById("campo-titulo-ganho").value.trim();
  const valor = Number(document.getElementById("campo-valor-ganho").value);
  const data = document.getElementById("campo-data-ganho").value;
  const recebido = document.getElementById("campo-recebido-ganho").checked;
  const fixo = document.getElementById("campo-fixo-ganho").checked;

  if (!titulo || !data || !(valor > 0)) return;

  let ganhoSalvo;

  if (idEmEdicao) {
    ganhoSalvo = transacoesGanhos.obterTodos().find((g) => g.id === idEmEdicao);
    ganhoSalvo.titulo = titulo;
    ganhoSalvo.valor = valor;
    ganhoSalvo.data = data;
    ganhoSalvo.recebido = recebido;
    if (fixo && !ganhoSalvo.fixoId) ganhoSalvo.fixoId = crypto.randomUUID();
    if (!fixo) ganhoSalvo.fixoId = null;
    ganhoSalvo.fixo = fixo;
  } else {
    ganhoSalvo = {
      id: crypto.randomUUID(),
      titulo,
      valor,
      data,
      recebido,
      fixo,
      fixoId: fixo ? crypto.randomUUID() : null,
    };
  }

  await transacoesGanhos.salvar(ganhoSalvo);
  fecharModal();
}

async function excluirGanho(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;

  const confirmou = confirm(`Excluir o ganho "${ganho.titulo}"?`);
  if (!confirmou) return;

  await transacoesGanhos.remover(id);
}

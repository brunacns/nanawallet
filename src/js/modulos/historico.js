import { obterGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, aoAtualizarGastos } from "./gastos.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { chipCategoria, opcoesFiltroCategoria } from "../categorias.js";

// Diferente de Dashboard/Gastos/Ganhos (que mostram um mês por vez), o
// Histórico mostra TODAS as transações já cadastradas, de qualquer mês.
let filtroTipo = "todos";
let filtroStatus = "todos";
let filtroCategoria = "todas"; // "todas" | "sem" | id de uma categoria
let termoBusca = "";
let ordenacao = "data-desc";

export function iniciarHistorico() {
  document.getElementById("historico-busca").addEventListener("input", (evento) => {
    termoBusca = evento.target.value.trim().toLowerCase();
    renderizar();
  });
  document.getElementById("historico-filtro-tipo").addEventListener("change", (evento) => {
    filtroTipo = evento.target.value;
    renderizar();
  });
  document.getElementById("historico-filtro-status").addEventListener("change", (evento) => {
    filtroStatus = evento.target.value;
    renderizar();
  });
  document.getElementById("historico-filtro-categoria").innerHTML = opcoesFiltroCategoria();
  document.getElementById("historico-filtro-categoria").addEventListener("change", (evento) => {
    filtroCategoria = evento.target.value;
    renderizar();
  });
  document.getElementById("historico-ordenar").addEventListener("change", (evento) => {
    ordenacao = evento.target.value;
    renderizar();
  });

  aoAtualizarGanhos(renderizar);
  aoAtualizarGastos(renderizar);
  renderizar();
}

// Junta ganhos e gastos num formato comum, só com o que a lista precisa
// mostrar/filtrar (título, data, valor, se já foi pago/recebido).
function combinarTransacoes() {
  const ganhos = obterGanhos().map((g) => ({
    tipo: "ganho",
    titulo: g.titulo,
    data: g.data,
    valor: g.valor,
    feito: g.recebido,
  }));
  const gastos = obterGastos().map((g) => ({
    tipo: "gasto",
    titulo: g.titulo,
    data: g.data,
    valor: g.valor,
    feito: g.pago,
    categoriaId: g.categoriaId,
  }));
  return [...ganhos, ...gastos];
}

function aplicarFiltros(transacoes) {
  return transacoes.filter((t) => {
    if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
    if (filtroStatus === "feito" && !t.feito) return false;
    if (filtroStatus === "pendente" && t.feito) return false;
    if (termoBusca && !t.titulo.toLowerCase().includes(termoBusca)) return false;
    // Categoria só existe em gastos — filtrar por uma categoria específica ou
    // por "sem categoria" nunca traz ganhos (eles não têm esse conceito).
    if (filtroCategoria === "sem" && !(t.tipo === "gasto" && !t.categoriaId)) return false;
    if (filtroCategoria !== "todas" && filtroCategoria !== "sem" && !(t.tipo === "gasto" && t.categoriaId === filtroCategoria)) return false;
    return true;
  });
}

function ordenar(transacoes) {
  const copia = [...transacoes];
  switch (ordenacao) {
    case "data-asc":
      return copia.sort((a, b) => a.data.localeCompare(b.data));
    case "valor-desc":
      return copia.sort((a, b) => b.valor - a.valor);
    case "valor-asc":
      return copia.sort((a, b) => a.valor - b.valor);
    case "data-desc":
    default:
      return copia.sort((a, b) => b.data.localeCompare(a.data));
  }
}

function somarPorTipo(transacoes, tipo) {
  return transacoes.filter((t) => t.tipo === tipo).reduce((soma, t) => soma + t.valor, 0);
}

function renderizar() {
  const filtradas = ordenar(aplicarFiltros(combinarTransacoes()));

  const totalRecebido = somarPorTipo(filtradas, "ganho");
  const totalGasto = somarPorTipo(filtradas, "gasto");
  const saldo = totalRecebido - totalGasto;

  document.getElementById("historico-total-recebido").textContent = formatarMoeda(totalRecebido);
  document.getElementById("historico-total-gasto").textContent = formatarMoeda(totalGasto);
  document.getElementById("historico-contagem").textContent = String(filtradas.length);

  const elSaldo = document.getElementById("historico-saldo");
  elSaldo.textContent = formatarMoeda(saldo);
  elSaldo.classList.toggle("cartao-estatistica__valor--positivo", saldo >= 0);
  elSaldo.classList.toggle("cartao-estatistica__valor--negativo", saldo < 0);

  const corpo = document.getElementById("historico-corpo-tabela");
  const estadoVazio = document.getElementById("historico-estado-vazio");

  if (filtradas.length === 0) {
    corpo.innerHTML = "";
    estadoVazio.hidden = false;
  } else {
    estadoVazio.hidden = true;
    corpo.innerHTML = filtradas.map(linhaTransacao).join("");
  }
}

function linhaTransacao(t) {
  const rotuloTipo = t.tipo === "ganho" ? '<span class="selo selo--positivo">Ganho</span>' : '<span class="selo selo--negativo">Gasto</span>';
  const rotuloStatus = t.feito
    ? `<span class="selo selo--positivo">${t.tipo === "ganho" ? "Recebido" : "Pago"}</span>`
    : '<span class="selo selo--neutro">Pendente</span>';
  const classeValor = t.tipo === "ganho" ? "tabela__valor-positivo" : "tabela__valor-negativo";
  // Categoria só existe no modelo de gasto — ganhos não têm categoria (o
  // pedido foi especificamente sobre despesas).
  const categoria = t.tipo === "gasto" ? chipCategoria(t.categoriaId) : "—";

  return `
    <tr>
      <td>${rotuloTipo}</td>
      <td>${escaparHtml(t.titulo)}</td>
      <td>${categoria}</td>
      <td>${formatarData(t.data)}</td>
      <td class="${classeValor}">${formatarMoeda(t.valor)}</td>
      <td>${rotuloStatus}</td>
    </tr>
  `;
}

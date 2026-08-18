import { obterGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, aoAtualizarGastos } from "./gastos.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { chipCategoria, opcoesFiltroCategoria } from "../categorias.js";
import { debounce } from "../utils/debounce.js";

// Diferente de Dashboard/Gastos/Ganhos (que mostram um mês por vez), o
// Histórico mostra TODAS as transações já cadastradas, de qualquer mês.
let filtroTipo = "todos";
let filtroStatus = "todos";
let filtroCategoria = "todas"; // "todas" | "sem" | id de uma categoria
let termoBusca = "";
let ordenacao = "data-desc";
let paginaAtual = 1;

// Depois de muitos anos de uso, a lista pode chegar a milhares de
// transações — renderizar todas de uma vez via innerHTML fica cada vez mais
// lento (é só HTML puro, sem virtualização). Paginar em blocos de 50 mantém
// o tempo de renderização constante independente do total cadastrado, sem
// mudar nada nos totais do topo (que continuam somando TODO o conjunto
// filtrado, não só a página visível).
const ITENS_POR_PAGINA = 50;

// Correção (auditoria 2026-08-09, BUG-08): com muitos anos de uso (milhares
// de transações), cada tecla digitada na busca refazia a tabela inteira via
// innerHTML — medido em ~108ms por tecla com ~4.800 transações. Um debounce
// de 200ms deixa de re-renderizar a cada tecla e passa a renderizar só
// quando a pessoa realmente pausa de digitar.
const ATRASO_DEBOUNCE_BUSCA_MS = 200;
const renderizarComDebounce = debounce(() => renderizar(), ATRASO_DEBOUNCE_BUSCA_MS);

export function iniciarHistorico() {
  document.getElementById("historico-busca").addEventListener("input", (evento) => {
    termoBusca = evento.target.value.trim().toLowerCase();
    paginaAtual = 1;
    renderizarComDebounce();
  });
  document.getElementById("historico-filtro-tipo").addEventListener("change", (evento) => {
    filtroTipo = evento.target.value;
    paginaAtual = 1;
    renderizar();
  });
  document.getElementById("historico-filtro-status").addEventListener("change", (evento) => {
    filtroStatus = evento.target.value;
    paginaAtual = 1;
    renderizar();
  });
  document.getElementById("historico-filtro-categoria").innerHTML = opcoesFiltroCategoria();
  document.getElementById("historico-filtro-categoria").addEventListener("change", (evento) => {
    filtroCategoria = evento.target.value;
    paginaAtual = 1;
    renderizar();
  });
  document.getElementById("historico-ordenar").addEventListener("change", (evento) => {
    ordenacao = evento.target.value;
    paginaAtual = 1;
    renderizar();
  });
  document.getElementById("historico-pagina-anterior").addEventListener("click", () => {
    paginaAtual = Math.max(1, paginaAtual - 1);
    renderizar();
  });
  document.getElementById("historico-pagina-seguinte").addEventListener("click", () => {
    paginaAtual += 1;
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
  const paginacao = document.getElementById("historico-paginacao");

  if (filtradas.length === 0) {
    corpo.innerHTML = "";
    estadoVazio.hidden = false;
    paginacao.hidden = true;
    // Distingue "nada cadastrado ainda" de "nada bate com o filtro atual" —
    // as duas coisas pareciam a mesma mensagem genérica antes.
    estadoVazio.textContent =
      combinarTransacoes().length === 0
        ? "Nenhuma transação cadastrada ainda — comece em Ganhos ou Gastos."
        : "Nenhuma transação encontrada com esse filtro.";
  } else {
    estadoVazio.hidden = true;

    // Corrige a página atual se ela ficou fora do intervalo (ex: um filtro
    // novo reduziu o total, ou um item foi excluído enquanto a pessoa via a
    // última página) — sem isso, a tabela podia renderizar vazia mesmo
    // havendo resultados nas páginas anteriores.
    const totalPaginas = Math.max(1, Math.ceil(filtradas.length / ITENS_POR_PAGINA));
    paginaAtual = Math.min(Math.max(1, paginaAtual), totalPaginas);

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const paginaDeItens = filtradas.slice(inicio, inicio + ITENS_POR_PAGINA);
    corpo.innerHTML = paginaDeItens.map(linhaTransacao).join("");

    paginacao.hidden = totalPaginas <= 1;
    document.getElementById("historico-pagina-rotulo").textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    document.getElementById("historico-pagina-anterior").disabled = paginaAtual <= 1;
    document.getElementById("historico-pagina-seguinte").disabled = paginaAtual >= totalPaginas;
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
      <td data-rotulo="Tipo">${rotuloTipo}</td>
      <td class="tabela__titulo-celula" data-rotulo="Título">${escaparHtml(t.titulo)}</td>
      <td data-rotulo="Categoria">${categoria}</td>
      <td data-rotulo="Data">${formatarData(t.data)}</td>
      <td class="${classeValor}" data-rotulo="Valor">${formatarMoeda(t.valor)}</td>
      <td data-rotulo="Status">${rotuloStatus}</td>
    </tr>
  `;
}

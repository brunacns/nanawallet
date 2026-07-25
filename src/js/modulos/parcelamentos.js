import { obterGastos, adicionarGastosEmLote, aoAtualizarGastos } from "./gastos.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { somarMeses, mesDeData } from "../utils/datas.js";
import { criarSeletorCategoria } from "../categorias.js";

const seletorCategoriaParcelamento = criarSeletorCategoria("parcelamento");

export function iniciarParcelamentos() {
  document.getElementById("botao-novo-parcelamento").addEventListener("click", abrirModal);
  document.getElementById("botao-fechar-modal-parcelamento").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-parcelamento").addEventListener("click", fecharModal);
  document.getElementById("sobreposicao-parcelamento").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-parcelamento") fecharModal();
  });
  document.getElementById("formulario-parcelamento").addEventListener("submit", salvarFormulario);
  seletorCategoriaParcelamento.inicializar();

  aoAtualizarGastos(renderizarResumo);
  renderizarResumo(obterGastos());
}

function abrirModal() {
  document.getElementById("formulario-parcelamento").reset();
  seletorCategoriaParcelamento.definir(null);
  document.getElementById("sobreposicao-parcelamento").hidden = false;
  document.getElementById("campo-titulo-parcelamento").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-parcelamento").hidden = true;
  seletorCategoriaParcelamento.fechar();
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const titulo = document.getElementById("campo-titulo-parcelamento").value.trim();
  const quantidade = Number(document.getElementById("campo-quantidade-parcelamento").value);
  const valorParcela = Number(document.getElementById("campo-valor-parcelamento").value);
  const dataPrimeiraParcela = document.getElementById("campo-data-parcelamento").value;
  const salarioResponsavel = document.getElementById("campo-salario-parcelamento").value;
  const categoriaId = seletorCategoriaParcelamento.obter();
  const observacoes = document.getElementById("campo-observacoes-parcelamento").value.trim();

  if (!titulo || !dataPrimeiraParcela || !(valorParcela > 0) || !(quantidade >= 2)) return;

  const parcelamentoId = crypto.randomUUID();
  const novosGastos = [];

  for (let numero = 1; numero <= quantidade; numero++) {
    // O mês de referência do salário de cada parcela é sempre o próprio mês
    // dela (parcela de agosto -> salário do dia 10/25 de agosto), automático.
    const data = somarMeses(dataPrimeiraParcela, numero - 1);
    novosGastos.push({
      id: crypto.randomUUID(),
      titulo,
      valor: valorParcela,
      data,
      mesReferencia: mesDeData(data),
      salarioResponsavel,
      fixo: false,
      fixoId: null,
      pago: false,
      parcela: { numero, total: quantidade, parcelamentoId },
      categoriaId,
      observacoes,
    });
  }

  await adicionarGastosEmLote(novosGastos);
  fecharModal();
}

function agruparParcelamentos(gastos) {
  const grupos = new Map();

  for (const gasto of gastos) {
    if (!gasto.parcela) continue;
    const id = gasto.parcela.parcelamentoId;
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(gasto);
  }

  return [...grupos.values()].map((itens) => {
    itens.sort((a, b) => a.parcela.numero - b.parcela.numero);
    // Usa a quantidade de parcelas que AINDA EXISTEM (itens.length), não
    // itens[0].parcela.total (tamanho original do plano) — se uma parcela for
    // excluída individualmente pela tabela de Gastos, o total original ficaria
    // desatualizado e "Faltam X de Y" mostraria um Y que não existe mais.
    const total = itens.length;
    const pagas = itens.filter((g) => g.pago).length;
    const dataUltimaParcela = itens.reduce((maior, g) => (g.data > maior ? g.data : maior), itens[0].data);

    return {
      titulo: itens[0].titulo,
      valorParcela: itens[0].valor,
      total,
      pagas,
      faltam: total - pagas,
      quitado: pagas === total,
      dataUltimaParcela,
    };
  });
}

function renderizarResumo(gastos) {
  const cartao = document.getElementById("parcelamentos-resumo-cartao");
  const container = document.getElementById("parcelamentos-conteudo");
  const grupos = agruparParcelamentos(gastos);

  if (grupos.length === 0) {
    cartao.hidden = true;
    container.innerHTML = "";
    return;
  }

  cartao.hidden = false;
  container.innerHTML = grupos.map(itemParcelamentoHtml).join("");
}

function itemParcelamentoHtml(grupo) {
  const status = grupo.quitado
    ? '<span class="selo selo--positivo">Quitado</span>'
    : `<span class="selo selo--neutro">Faltam ${grupo.faltam} de ${grupo.total}</span>`;

  return `
    <li class="item-parcelamento">
      <div>
        <div class="item-parcelamento__titulo">${escaparHtml(grupo.titulo)}</div>
        <div class="item-parcelamento__detalhe">
          ${formatarMoeda(grupo.valorParcela)} por parcela · quitação prevista: ${formatarData(grupo.dataUltimaParcela)}
        </div>
      </div>
      ${status}
    </li>
  `;
}

import { obterGastos, adicionarGastosEmLote, aoAtualizarGastos } from "./gastos.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { somarMeses, mesDeData } from "../utils/datas.js";
import { criarSeletorCategoria } from "../categorias.js";
import { avisarCampoInvalido, limparValidacao } from "../utils/validacaoFormulario.js";
import { prenderFocoNoModal } from "../utils/focoModal.js";
import { opcoesCarteiraGasto, carteiraEhBeneficio, carteiraPrincipalPadraoId } from "../carteiras.js";
import { mostrarToast } from "../utils/toast.js";

const seletorCategoriaParcelamento = criarSeletorCategoria("parcelamento");

// Acima disso, pede confirmação explícita antes de gerar as parcelas (BUG-09
// da auditoria de 2026-08-09) — sem isso, um erro de digitação (ex: "120" em
// vez de "12") criava dezenas de gastos de uma vez sem nenhum aviso prévio
// mostrando o compromisso total assumido.
const QUANTIDADE_QUE_PEDE_CONFIRMACAO = 12;

export function iniciarParcelamentos() {
  document.getElementById("botao-novo-parcelamento").addEventListener("click", abrirModal);
  document.getElementById("botao-fechar-modal-parcelamento").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-parcelamento").addEventListener("click", fecharModal);
  document.getElementById("sobreposicao-parcelamento").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-parcelamento") fecharModal();
  });
  prenderFocoNoModal(document.getElementById("sobreposicao-parcelamento"));
  document.getElementById("formulario-parcelamento").addEventListener("submit", salvarFormulario);
  document.getElementById("campo-carteira-parcelamento").addEventListener("change", atualizarCamposConformeCarteira);
  seletorCategoriaParcelamento.inicializar();

  aoAtualizarGastos(renderizarResumo);
  renderizarResumo(obterGastos());
}

// Mesmo padrão de gastos.js: repopula a cada abertura do modal (não só na
// inicialização), senão ativar uma carteira nova (ex: Ticket Alimentação) só
// apareceria como opção depois de reabrir o app.
function atualizarOpcoesCarteira() {
  document.getElementById("campo-carteira-parcelamento").innerHTML = opcoesCarteiraGasto();
}

// "Salário responsável" não faz sentido para parcelas pagas com uma carteira
// de benefício (não existe "salário" que paga o Ticket Alimentação) — mesmo
// raciocínio já aplicado ao formulário de gasto avulso.
function atualizarCamposConformeCarteira() {
  const carteiraId = document.getElementById("campo-carteira-parcelamento").value || null;
  const ehBeneficio = carteiraEhBeneficio(carteiraId);
  document.getElementById("linha-salario-parcelamento").hidden = ehBeneficio;
  document.getElementById("aviso-carteira-beneficio-parcelamento").hidden = !ehBeneficio;
}

function abrirModal() {
  document.getElementById("formulario-parcelamento").reset();
  seletorCategoriaParcelamento.definir(null);
  atualizarOpcoesCarteira();
  document.getElementById("campo-carteira-parcelamento").value = carteiraPrincipalPadraoId() || "";
  atualizarCamposConformeCarteira();
  // Começa fechado — carteira/salário/observações são opcionais e já têm
  // valor padrão sensato; só os campos essenciais para gerar as parcelas
  // ficam à vista.
  document.getElementById("parcelamento-mais-opcoes").open = false;
  document.getElementById("sobreposicao-parcelamento").hidden = false;
  document.getElementById("campo-titulo-parcelamento").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-parcelamento").hidden = true;
  seletorCategoriaParcelamento.fechar();
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const campoTitulo = document.getElementById("campo-titulo-parcelamento");
  limparValidacao(campoTitulo);

  const titulo = campoTitulo.value.trim();
  const quantidade = Number(document.getElementById("campo-quantidade-parcelamento").value);
  const valorParcela = Number(document.getElementById("campo-valor-parcelamento").value);
  const dataPrimeiraParcela = document.getElementById("campo-data-parcelamento").value;
  const carteiraId = document.getElementById("campo-carteira-parcelamento").value || null;
  // Igual ao formulário de gasto avulso: o campo "salário responsável" fica
  // escondido (não gravado como null) quando a carteira é um benefício — o
  // valor guardado nunca é lido em nenhum cálculo de carteira de benefício.
  const salarioResponsavel = document.getElementById("campo-salario-parcelamento").value;
  const categoriaId = seletorCategoriaParcelamento.obter();
  const observacoes = document.getElementById("campo-observacoes-parcelamento").value.trim();

  // Correção (auditoria 2026-08-09, BUG-04): título só com espaços passava
  // despercebido pelo `required` do HTML e falhava em silêncio.
  if (!titulo) {
    avisarCampoInvalido(campoTitulo, "Preencha o título.");
    return;
  }
  if (!dataPrimeiraParcela || !(valorParcela > 0) || !(quantidade >= 2)) return;

  // Correção (auditoria 2026-08-09, BUG-09): quantidades grandes (que agora
  // também têm um teto de 120 no próprio campo, ver index.html) pedem
  // confirmação explícita mostrando o compromisso total antes de gerar.
  if (quantidade > QUANTIDADE_QUE_PEDE_CONFIRMACAO) {
    const dataUltimaParcela = somarMeses(dataPrimeiraParcela, quantidade - 1);
    const confirmou = confirm(
      `Isso vai criar ${quantidade} parcelas de ${formatarMoeda(valorParcela)} (total: ${formatarMoeda(
        valorParcela * quantidade
      )}), a última prevista para ${formatarData(dataUltimaParcela)}. Continuar?`
    );
    if (!confirmou) return;
  }

  const parcelamentoId = crypto.randomUUID();
  const novosGastos = [];

  for (let numero = 1; numero <= quantidade; numero++) {
    // O mês de referência do salário de cada parcela é sempre o próprio mês
    // dela (parcela de agosto -> salário do dia 15/30 de agosto), automático.
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
      carteiraId,
      observacoes,
    });
  }

  await adicionarGastosEmLote(novosGastos);
  fecharModal();
  mostrarToast(`${quantidade} parcelas geradas`);
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

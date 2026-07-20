import { obterGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, aoAtualizarGastos } from "./gastos.js";
import { obterLembretes, aoAtualizarLembretes } from "./lembretes.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { diaDoMes, mesDeData, mesAnterior, rotuloMesLongo } from "../utils/datas.js";
import { obterMesSelecionado, avancarMes, retrocederMes, aoAtualizarMes } from "../estadoMes.js";

// Limites usados para decidir a cor de alerta de um saldo, em relação
// ao total recebido correspondente (geral, ou só do dia 10 / dia 25).
const LIMITE_SALDO_LARANJA = 0.1; // abaixo de 10% do recebido -> laranja
const LIMITE_SALDO_AMARELO = 0.25; // abaixo de 25% do recebido -> amarelo

// Limites dos diagnósticos simples.
const LIMITE_AUMENTO_GASTOS = 0.2; // 20% de aumento em relação ao mês anterior
const LIMITE_PARCELAMENTOS = 0.3; // parcelas pendentes >= 30% da renda do mês
const LIMITE_COMPROMETIMENTO = 0.7; // gastos totais >= 70% da renda do mês

export function iniciarDashboard() {
  document.getElementById("dash-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("dash-mes-seguinte").addEventListener("click", avancarMes);

  aoAtualizarGanhos(renderizar);
  aoAtualizarGastos(renderizar);
  aoAtualizarLembretes(renderizar);
  aoAtualizarMes(renderizar);
  renderizar();
}

function renderizar() {
  const mes = obterMesSelecionado();
  document.getElementById("dash-mes-rotulo").textContent = rotuloMesLongo(mes);

  const ganhos = obterGanhos().filter((g) => mesDeData(g.data) === mes);
  const gastos = obterGastos().filter((g) => g.mesReferencia === mes);
  const lembretes = obterLembretes().filter((l) => mesDeData(l.data) === mes);

  const totalRecebido = somar(ganhos, (g) => g.valor);
  // Todos os gastos do mês contam aqui, pagos ou não — a maioria é no cartão
  // de crédito, então o saldo precisa refletir o que ainda vai ser cobrado.
  const totalGasto = somar(gastos, (g) => g.valor);
  const totalLembretesPendentes = somar(
    lembretes.filter((l) => !l.concluido),
    (l) => l.valor
  );

  const saldoRestante = totalRecebido - totalGasto;
  const saldoPrevisto = saldoRestante - totalLembretesPendentes;

  const recebidoDia10 = somar(ganhos.filter((g) => diaDoMes(g.data) === 10), (g) => g.valor);
  const recebidoDia25 = somar(ganhos.filter((g) => diaDoMes(g.data) === 25), (g) => g.valor);
  const gastoDia10 = somar(gastos.filter((g) => g.salarioResponsavel === "dia10"), (g) => g.valor);
  const gastoDia25 = somar(gastos.filter((g) => g.salarioResponsavel === "dia25"), (g) => g.valor);
  const saldoDia10 = recebidoDia10 - gastoDia10;
  const saldoDia25 = recebidoDia25 - gastoDia25;

  document.getElementById("dash-total-recebido").textContent = formatarMoeda(totalRecebido);
  document.getElementById("dash-total-gasto").textContent = formatarMoeda(totalGasto);
  document.getElementById("dash-reservado-lembretes").textContent = formatarMoeda(totalLembretesPendentes);

  atualizarCartaoSaldo("dash-saldo-restante", saldoRestante, totalRecebido);
  atualizarCartaoSaldo("dash-saldo-dia10", saldoDia10, recebidoDia10);
  atualizarCartaoSaldo("dash-saldo-dia25", saldoDia25, recebidoDia25);
  atualizarCartaoSaldo("dash-saldo-previsto", saldoPrevisto, totalRecebido);

  renderizarDiagnosticos({ mes, gastos, totalRecebido, totalGasto });
  renderizarProximosGastos(gastos);
  renderizarProximosLembretes(lembretes);
}

function somar(lista, seletor) {
  return lista.reduce((soma, item) => soma + seletor(item), 0);
}

// Decide o nível de alerta de um saldo com base no quanto ele representa
// da respectiva base recebida. Saldo zero ou negativo é sempre vermelho,
// mesmo sem base recebida (ex: gasto atribuído a um salário que não teve
// nenhum ganho registrado ainda). Sem base, só não dá pra calcular a
// porcentagem usada nos níveis amarelo/laranja.
function nivelAlertaSaldo(saldo, baseRecebida) {
  if (saldo <= 0) return "vermelho";
  if (baseRecebida <= 0) return null;
  const proporcao = saldo / baseRecebida;
  if (proporcao < LIMITE_SALDO_LARANJA) return "laranja";
  if (proporcao < LIMITE_SALDO_AMARELO) return "amarelo";
  return null;
}

const TEXTO_ALERTA = {
  amarelo: "⚠ Saldo baixo",
  laranja: "⚠ Saldo preocupante",
  vermelho: "⚠ Saldo perto de acabar",
};

function atualizarCartaoSaldo(idBase, saldo, baseRecebida) {
  const valorEl = document.getElementById(idBase);
  const alertaEl = document.getElementById(`${idBase}-alerta`);
  const cartaoEl = document.getElementById(`dash-cartao-${idBase.replace("dash-", "")}`);

  valorEl.textContent = formatarMoeda(saldo);
  valorEl.classList.toggle("cartao-estatistica__valor--positivo", saldo > 0);
  valorEl.classList.toggle("cartao-estatistica__valor--negativo", saldo <= 0);

  const nivel = nivelAlertaSaldo(saldo, baseRecebida);

  cartaoEl.classList.remove("cartao-estatistica--amarelo", "cartao-estatistica--laranja", "cartao-estatistica--vermelho");
  alertaEl.classList.remove("cartao-estatistica__alerta--amarelo", "cartao-estatistica__alerta--laranja", "cartao-estatistica__alerta--vermelho");

  if (nivel) {
    cartaoEl.classList.add(`cartao-estatistica--${nivel}`);
    alertaEl.classList.add(`cartao-estatistica__alerta--${nivel}`);
    alertaEl.textContent = TEXTO_ALERTA[nivel];
    alertaEl.hidden = false;
  } else {
    alertaEl.hidden = true;
  }
}

function renderizarDiagnosticos({ mes, gastos, totalRecebido, totalGasto }) {
  const diagnosticos = [];

  if (totalRecebido > 0) {
    diagnosticos.push(...diagnosticoAumentoDeGastos(mes, totalGasto));
    diagnosticos.push(...diagnosticoExcessoDeParcelamentos(gastos, totalRecebido));
    diagnosticos.push(...diagnosticoComprometimentoDaRenda(totalGasto, totalRecebido));
  }

  const container = document.getElementById("dashboard-diagnosticos-conteudo");

  if (diagnosticos.length === 0) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">Nenhum diagnóstico no momento — suas finanças estão equilibradas.</li>`;
    return;
  }

  container.innerHTML = diagnosticos
    .map(
      (d) => `
    <li class="item-diagnostico">
      <span class="item-diagnostico__ponto item-diagnostico__ponto--${d.nivel}"></span>
      <span>${d.texto}</span>
    </li>
  `
    )
    .join("");
}

// Compara o mês visualizado com o mês anterior a ele (não necessariamente
// o mês anterior ao mês real de hoje — segue o mês que está sendo navegado).
function diagnosticoAumentoDeGastos(mes, gastoMesAtual) {
  const gastoMesPassado = somar(
    obterGastosDoMesGlobal(mesAnterior(mes)),
    (g) => g.valor
  );

  if (gastoMesPassado <= 0) return [];

  const variacao = (gastoMesAtual - gastoMesPassado) / gastoMesPassado;
  if (variacao < LIMITE_AUMENTO_GASTOS) return [];

  return [
    {
      nivel: variacao >= 0.5 ? "vermelho" : "laranja",
      texto: `Seus gastos aumentaram ${Math.round(variacao * 100)}% em relação ao mês anterior.`,
    },
  ];
}

function obterGastosDoMesGlobal(mes) {
  return obterGastos().filter((g) => g.mesReferencia === mes);
}

function diagnosticoExcessoDeParcelamentos(gastos, totalRecebido) {
  const parcelasPendentes = somar(
    gastos.filter((g) => g.parcela && !g.pago),
    (g) => g.valor
  );
  const proporcao = parcelasPendentes / totalRecebido;
  if (proporcao < LIMITE_PARCELAMENTOS) return [];

  return [
    {
      nivel: "laranja",
      texto: `Parcelamentos pendentes somam ${formatarMoeda(parcelasPendentes)} — ${Math.round(proporcao * 100)}% da renda deste mês.`,
    },
  ];
}

function diagnosticoComprometimentoDaRenda(totalGasto, totalRecebido) {
  const proporcao = totalGasto / totalRecebido;
  if (proporcao < LIMITE_COMPROMETIMENTO) return [];

  return [
    {
      nivel: proporcao >= 1 ? "vermelho" : "amarelo",
      texto: `${Math.round(proporcao * 100)}% da renda deste mês está comprometida com gastos.`,
    },
  ];
}

// Usada tanto para "Próximos gastos pendentes" quanto "Próximos lembretes"
// (mesmo formato de lista, só muda o que conta como "pendente" e a mensagem vazia).
function renderizarListaProxima(idContainer, itens, ehPendente, mensagemVazia) {
  const container = document.getElementById(idContainer);
  const pendentes = itens
    .filter(ehPendente)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 5);

  if (pendentes.length === 0) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">${mensagemVazia}</li>`;
    return;
  }

  container.innerHTML = pendentes
    .map(
      (item) => `
    <li class="lista-simples__item">
      <span class="lista-simples__titulo">${escaparHtml(item.titulo)}</span>
      <span class="lista-simples__legenda">${formatarData(item.data)} · ${formatarMoeda(item.valor)}</span>
    </li>
  `
    )
    .join("");
}

function renderizarProximosGastos(gastosDoMes) {
  renderizarListaProxima("dashboard-proximos-gastos", gastosDoMes, (g) => !g.pago, "Nenhum gasto pendente neste mês.");
}

function renderizarProximosLembretes(lembretesDoMes) {
  renderizarListaProxima("dashboard-proximos-lembretes", lembretesDoMes, (l) => !l.concluido, "Nenhum lembrete pendente neste mês.");
}

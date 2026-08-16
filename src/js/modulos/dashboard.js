import { obterGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, aoAtualizarGastos } from "./gastos.js";
import { obterLembretes, aoAtualizarLembretes } from "./lembretes.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { diaDoMes, mesDeData, mesAnterior, rotuloMesLongo } from "../utils/datas.js";
import { obterCategoriaPorId } from "../categorias.js";
import { filtrarGastosPrincipais, obterCarteiras, calcularSaldoCarteira } from "../carteiras.js";
import { carteirasService, carteiraEntradasService } from "../servicos/index.js";
import { obterMesSelecionado, avancarMes, retrocederMes, irParaMesAtual, aoAtualizarMes } from "../estadoMes.js";
import { somarGastosDoMes } from "../utils/calculosFinanceiros.js";

// Limites usados para decidir a cor de alerta de um saldo, em relação
// ao total recebido correspondente (geral, ou só do dia 15 / dia 30).
const LIMITE_SALDO_LARANJA = 0.1; // abaixo de 10% do recebido -> laranja
const LIMITE_SALDO_AMARELO = 0.25; // abaixo de 25% do recebido -> amarelo

// Limites dos diagnósticos simples.
const LIMITE_AUMENTO_GASTOS = 0.2; // 20% de aumento em relação ao mês anterior
const LIMITE_PARCELAMENTOS = 0.3; // parcelas pendentes >= 30% da renda do mês
const LIMITE_COMPROMETIMENTO = 0.7; // gastos totais >= 70% da renda do mês

export function iniciarDashboard() {
  document.getElementById("dash-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("dash-mes-seguinte").addEventListener("click", avancarMes);
  document.getElementById("dash-mes-atual").addEventListener("click", irParaMesAtual);

  aoAtualizarGanhos(renderizar);
  aoAtualizarGastos(renderizar);
  aoAtualizarLembretes(renderizar);
  carteirasService.aoAtualizar(renderizar);
  carteiraEntradasService.aoAtualizar(renderizar);
  aoAtualizarMes(renderizar);
  renderizar();
}

function renderizar() {
  const mes = obterMesSelecionado();
  document.getElementById("dash-mes-rotulo").textContent = rotuloMesLongo(mes);

  const ganhos = obterGanhos().filter((g) => mesDeData(g.data) === mes);
  // Gastos pagos com uma carteira de benefício (ex: Ticket Alimentação) não
  // são "financeiro principal" — excluídos de todos os totais/diagnósticos
  // deste dashboard (regra de ouro do sistema de carteiras).
  const gastos = filtrarGastosPrincipais(obterGastos().filter((g) => g.mesReferencia === mes));
  const lembretes = obterLembretes().filter((l) => mesDeData(l.data) === mes);

  const totalRecebido = somar(ganhos, (g) => g.valor);
  // Todos os gastos do mês contam aqui, pagos ou não — a maioria é no cartão
  // de crédito, então o saldo precisa refletir o que ainda vai ser cobrado.
  // Usa a mesma função compartilhada que o gráfico "Evolução do saldo"
  // (utils/calculosFinanceiros.js) — ver BUG-01 da auditoria de 2026-08-09.
  const totalGasto = somarGastosDoMes(gastos, mes);
  const totalLembretesPendentes = somar(
    lembretes.filter((l) => !l.concluido),
    (l) => l.valor
  );

  const saldoRestante = totalRecebido - totalGasto;
  const saldoPrevisto = saldoRestante - totalLembretesPendentes;

  const recebidoDia15 = somar(ganhos.filter((g) => diaDoMes(g.data) === 15), (g) => g.valor);
  const recebidoDia30 = somar(ganhos.filter((g) => diaDoMes(g.data) === 30), (g) => g.valor);
  const gastoDia15 = somar(gastos.filter((g) => g.salarioResponsavel === "dia15"), (g) => g.valor);
  const gastoDia30 = somar(gastos.filter((g) => g.salarioResponsavel === "dia30"), (g) => g.valor);
  const saldoDia15 = recebidoDia15 - gastoDia15;
  const saldoDia30 = recebidoDia30 - gastoDia30;

  document.getElementById("dash-total-recebido").textContent = formatarMoeda(totalRecebido);
  document.getElementById("dash-total-gasto").textContent = formatarMoeda(totalGasto);
  document.getElementById("dash-reservado-lembretes").textContent = formatarMoeda(totalLembretesPendentes);

  atualizarCartaoSaldo("dash-saldo-restante", saldoRestante, totalRecebido);
  atualizarCartaoSaldo("dash-saldo-dia15", saldoDia15, recebidoDia15);
  atualizarCartaoSaldo("dash-saldo-dia30", saldoDia30, recebidoDia30);
  atualizarCartaoSaldo("dash-saldo-previsto", saldoPrevisto, totalRecebido);

  renderizarDiagnosticos({ mes, gastos, totalRecebido, totalGasto });
  renderizarInsightsCategoria(gastos, totalGasto);
  renderizarProximosGastos(gastos);
  renderizarProximosLembretes(lembretes);
  renderizarBeneficios(mes);
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
  return filtrarGastosPrincipais(obterGastos().filter((g) => g.mesReferencia === mes));
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

// "Estatísticas por categoria": frases geradas a partir dos gastos categorizados
// do mês selecionado. Usa só um template genérico por tipo de frase (em vez de
// um texto escrito à mão por categoria) de propósito — assim continua
// funcionando sem alteração quando categorias personalizadas existirem no
// futuro, sem precisar de um texto novo por categoria nova.
function renderizarInsightsCategoria(gastosDoMes, totalGasto) {
  const container = document.getElementById("dashboard-insights-categoria");
  const mensagemVazia = `<li class="estado-vazio" style="padding: var(--espaco-md) 0;">Nenhum gasto categorizado neste mês ainda.</li>`;

  const porCategoria = new Map();
  for (const gasto of gastosDoMes) {
    if (!gasto.categoriaId) continue;
    const atual = porCategoria.get(gasto.categoriaId) || { valor: 0, quantidade: 0 };
    atual.valor += gasto.valor;
    atual.quantidade += 1;
    porCategoria.set(gasto.categoriaId, atual);
  }

  const ranking = [...porCategoria.entries()]
    .map(([categoriaId, dados]) => ({ categoria: obterCategoriaPorId(categoriaId), ...dados }))
    .filter((r) => r.categoria)
    .sort((a, b) => b.valor - a.valor);

  if (ranking.length === 0) {
    container.innerHTML = mensagemVazia;
    return;
  }

  const insights = [];
  const principal = ranking[0];
  const pctPrincipal = totalGasto > 0 ? Math.round((principal.valor / totalGasto) * 100) : 0;
  insights.push(
    `Sua maior categoria este mês foi ${principal.categoria.emoji} ${escaparHtml(principal.categoria.nome)}, com ${formatarMoeda(
      principal.valor
    )} (${pctPrincipal}% dos gastos).`
  );
  insights.push(
    `${principal.categoria.emoji} Você fez ${principal.quantidade} gasto${principal.quantidade > 1 ? "s" : ""} em ${escaparHtml(
      principal.categoria.nome
    )} este mês.`
  );

  ranking
    .slice(1, 3)
    .filter((r) => totalGasto > 0 && Math.round((r.valor / totalGasto) * 100) >= 1)
    .forEach((r) => {
      const pct = Math.round((r.valor / totalGasto) * 100);
      insights.push(`${r.categoria.emoji} ${escaparHtml(r.categoria.nome)} representou ${pct}% dos seus gastos este mês (${formatarMoeda(r.valor)}).`);
    });

  container.innerHTML = insights
    .map(
      (texto) => `
    <li class="item-diagnostico">
      <span class="item-diagnostico__ponto item-diagnostico__ponto--neutro"></span>
      <span>${texto}</span>
    </li>
  `
    )
    .join("");
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

// Seção "Benefícios": mostra o saldo de cada carteira de benefício ativa
// (ex: Ticket Alimentação), separado por completo do dinheiro principal —
// nunca somado a nenhum dos totais/cartões acima (regra de ouro do sistema
// de carteiras). Card inteiro fica oculto se não houver nenhuma carteira de
// benefício ativa, para não mostrar uma seção vazia a quem não usa nenhuma.
// Mesmo `calcularSaldoCarteira` usado na página própria do Ticket
// Alimentação (respeita "acumula saldo") — os dois nunca divergem no cálculo.
function renderizarBeneficios(mes) {
  const cartao = document.getElementById("dash-cartao-beneficios");
  const container = document.getElementById("dash-beneficios-conteudo");
  const beneficios = obterCarteiras().filter((c) => c.tipo === "beneficio" && c.ativa);

  if (beneficios.length === 0) {
    cartao.hidden = true;
    return;
  }

  cartao.hidden = false;
  const todosGastos = obterGastos();
  const todasEntradas = carteiraEntradasService.obterTodos();

  container.innerHTML = beneficios
    .map((carteira) => {
      const { saldoAtual } = calcularSaldoCarteira(carteira, todasEntradas, todosGastos, mes);
      return `
        <li class="lista-simples__item">
          <span class="lista-simples__titulo">${escaparHtml(carteira.emoji)} ${escaparHtml(carteira.nome)}</span>
          <span class="lista-simples__legenda">${formatarMoeda(saldoAtual)}</span>
        </li>
      `;
    })
    .join("");
}

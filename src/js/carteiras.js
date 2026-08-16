// Helpers de carteira compartilhados entre páginas (gastos, dashboard,
// gráficos, histórico, exportação, e futuramente a página do Ticket
// Alimentação) — mesmo espírito de categorias.js/estadoMes.js: um lugar só,
// fora de modulos/, para uma coisa usada por várias telas sem virar um
// serviço de domínio (a leitura/escrita de verdade continua em
// carteirasService).
//
// Regra de ouro do sistema de carteiras: uma carteira de benefício (ex:
// Ticket Alimentação) é sempre EXCLUÍDA de "financeiro principal" (salário,
// renda, saldo bancário) — em todo cálculo, gráfico, lista e exportação.
// `filtrarGastosPrincipais`/`carteiraEhBeneficio` centralizam essa checagem
// aqui, para que nenhum outro arquivo precise repetir `if (carteira.tipo ===
// "beneficio")` por conta própria.
import { carteirasService } from "./servicos/index.js";
import { escaparHtml } from "./utils/formatadores.js";
import { mesDeData, mesSeguinte, diferencaEmDias, hojeISO } from "./utils/datas.js";
import { dataDoMes } from "./utils/recorrenciaCarteira.js";

export function obterCarteiras() {
  return carteirasService.obterTodos();
}

export function obterCarteiraPorId(id) {
  if (!id) return null;
  return carteirasService.obterTodos().find((c) => c.id === id) || null;
}

// true só quando a carteira existe e é do tipo "beneficio" — um carteiraId
// desconhecido, nulo, ou de uma carteira "dinheiro" conta como financeiro
// principal (mesmo comportamento de antes do sistema de carteiras existir).
export function carteiraEhBeneficio(carteiraId) {
  const carteira = obterCarteiraPorId(carteiraId);
  return carteira?.tipo === "beneficio";
}

// Remove da lista qualquer gasto pago com uma carteira de benefício — usado
// em todo cálculo/gráfico/lista de "financeiro principal" (dashboard,
// gráficos, histórico, exportação em texto).
export function filtrarGastosPrincipais(gastos) {
  return gastos.filter((g) => !carteiraEhBeneficio(g.carteiraId));
}

// Opções de <select> para o formulário de gasto: carteiras ativas, agrupadas
// visualmente (dinheiro primeiro, benefícios depois).
export function opcoesCarteiraGasto() {
  const ativas = obterCarteiras().filter((c) => c.ativa);
  const dinheiro = ativas.filter((c) => c.tipo === "dinheiro");
  const beneficios = ativas.filter((c) => c.tipo === "beneficio");

  const opcao = (c) => `<option value="${c.id}">${escaparHtml(c.emoji)} ${escaparHtml(c.nome)}</option>`;

  return [...dinheiro.map(opcao), ...beneficios.map(opcao)].join("");
}

// Id da carteira "dinheiro" usada como seleção padrão no formulário de gasto
// (novo gasto, ou gasto antigo com carteiraId nulo — migração retrocompatível:
// null sempre significou "carteira principal", então mostrar a primeira
// carteira de dinheiro ativa aqui é só uma escolha de exibição, nunca muda o
// comportamento de cálculo do item).
export function carteiraPrincipalPadraoId() {
  return obterCarteiras().find((c) => c.tipo === "dinheiro" && c.ativa)?.id || null;
}

// Primeira carteira de benefício cadastrada (independente de estar ativa —
// a própria página do benefício precisa conseguir mostrar/editar a
// configuração mesmo antes de ativá-la). Hoje só existe o Ticket
// Alimentação, seedado na primeira inicialização; a página de benefícios usa
// esta função (em vez do nome "Ticket Alimentação") para continuar
// funcionando sem alteração se outro benefício for adicionado no futuro.
export function obterCarteiraBeneficioPrincipal() {
  return obterCarteiras().find((c) => c.tipo === "beneficio") || null;
}

function somarValor(lista) {
  return lista.reduce((soma, item) => soma + item.valor, 0);
}

// Calcula o saldo de uma carteira de benefício no mês selecionado, já
// aplicando (ou não) o acúmulo entre meses conforme `beneficio.acumulaSaldo`
// — usado pela página do Ticket Alimentação e pelo card "Benefícios" do
// Dashboard, para os dois nunca divergirem no cálculo.
// `todasEntradas`/`todosGastos` podem conter itens de QUALQUER carteira —
// esta função filtra pela carteira internamente.
//   - `acumulaSaldo: true`: saldo do mês anterior (tudo antes do mês
//     selecionado) soma ao recebido deste mês antes de descontar o gasto.
//   - `acumulaSaldo: false` (padrão se não especificado): cada mês começa
//     zerado — só o que foi recebido/gasto NESTE mês conta.
export function calcularSaldoCarteira(carteira, todasEntradas, todosGastos, mes) {
  const entradasDaCarteira = todasEntradas.filter((e) => e.carteiraId === carteira.id);
  const gastosDaCarteira = todosGastos.filter((g) => g.carteiraId === carteira.id);

  const recebidoMes = somarValor(entradasDaCarteira.filter((e) => mesDeData(e.data) === mes));
  const gastoMes = somarValor(gastosDaCarteira.filter((g) => mesDeData(g.data) === mes));

  const acumula = carteira.beneficio?.acumulaSaldo !== false;
  const saldoAnterior = acumula
    ? somarValor(entradasDaCarteira.filter((e) => mesDeData(e.data) < mes)) - somarValor(gastosDaCarteira.filter((g) => mesDeData(g.data) < mes))
    : 0;

  const disponivel = saldoAnterior + recebidoMes;
  const saldoAtual = disponivel - gastoMes;

  return { recebidoMes, gastoMes, saldoAnterior, disponivel, saldoAtual, acumula };
}

// Próxima data em que o crédito automático deve cair, a partir de hoje — só
// faz sentido para uma carteira ativa e recorrente (sem isso, não existe
// nenhuma previsão confiável para mostrar, por pedido explícito: "se o
// benefício não for recorrente, não mostrar uma previsão falsa"). Se o dia de
// recebimento deste mês ainda não passou, a próxima é este mês; senão, é o
// mês seguinte.
export function calcularProximoRecebimento(carteira, hoje = hojeISO()) {
  if (!carteira.ativa || !carteira.beneficio?.recorrente) return null;

  const mesAtual = mesDeData(hoje);
  const dataEsteMes = dataDoMes(mesAtual, carteira.beneficio.diaRecebimento);
  const data = dataEsteMes >= hoje ? dataEsteMes : dataDoMes(mesSeguinte(mesAtual), carteira.beneficio.diaRecebimento);

  return { data, valor: carteira.beneficio.valorMensal, diasRestantes: diferencaEmDias(data, hoje) };
}

// Indicador de ritmo de consumo: compara o quanto está sendo gasto por dia
// com o quanto ainda dá para gastar por dia até o próximo crédito, a partir
// do saldo ATUAL (não do próximo crédito, que ainda não chegou) — mesmo
// raciocínio do exemplo do pedido original (saldo ÷ dias restantes = valor
// disponível por dia). Devolve `null` quando não há dados suficientes para
// um cálculo confiável (benefício não recorrente/inativo, hoje é o próprio
// dia do crédito — divisão por zero — ou ainda não existe nenhuma entrada
// registrada para servir de início do período de gasto).
export function calcularRitmoConsumo(carteira, todasEntradas, todosGastos, hoje = hojeISO()) {
  const proximo = calcularProximoRecebimento(carteira, hoje);
  if (!proximo || proximo.diasRestantes <= 0) return null;

  const entradasDaCarteira = todasEntradas.filter((e) => e.carteiraId === carteira.id && e.data <= hoje);
  const ultimaEntrada = [...entradasDaCarteira].sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!ultimaEntrada) return null;

  const gastosDaCarteira = todosGastos.filter((g) => g.carteiraId === carteira.id);
  const diasDecorridos = Math.max(diferencaEmDias(hoje, ultimaEntrada.data), 1);
  const gastoNoPeriodo = somarValor(gastosDaCarteira.filter((g) => g.data >= ultimaEntrada.data && g.data <= hoje));
  const gastoMedioDiario = gastoNoPeriodo / diasDecorridos;

  const { saldoAtual } = calcularSaldoCarteira(carteira, todasEntradas, todosGastos, mesDeData(hoje));
  const valorDisponivelPorDia = saldoAtual > 0 ? saldoAtual / proximo.diasRestantes : 0;

  let status;
  if (saldoAtual <= 0) status = "vermelho";
  else if (gastoMedioDiario <= valorDisponivelPorDia * 0.9) status = "verde";
  else if (gastoMedioDiario <= valorDisponivelPorDia * 1.15) status = "amarelo";
  else status = "vermelho";

  return { diasRestantes: proximo.diasRestantes, gastoMedioDiario, valorDisponivelPorDia, saldoAtual, status, proximoRecebimento: proximo };
}

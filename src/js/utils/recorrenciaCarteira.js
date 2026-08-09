import { mesDeData, listaMeses } from "./datas.js";

// Constrói a data do crédito de um mês ("AAAA-MM" + dia), ajustando para o
// último dia válido do mês se o dia de recebimento não existir nele (ex: dia
// 31 num mês de 30 dias) — mesmo raciocínio de `somarMeses` em datas.js, mas
// aqui partindo de um mês solto, não de uma data existente sendo somada.
export function dataDoMes(mesChave, dia) {
  const [ano, mes] = mesChave.split("-").map(Number);
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMes);
  return `${mesChave}-${String(diaFinal).padStart(2, "0")}`;
}

// Para cada carteira de benefício ativa e recorrente, gera a entrada mensal
// automática que estiver faltando entre o mês de ativação
// (`beneficio.ativoDesde`) e `mesAlvo` — pulando qualquer mês que já tenha
// UMA entrada (manual ou automática) para aquela carteira, para nunca
// duplicar o crédito. Diferente da recorrência de gastos/ganhos fixos (que
// encadeia por `fixoId`), aqui a checagem é simplesmente "esse mês já tem
// alguma entrada?" — mais simples e suficiente, já que uma entrada de
// carteira não tem campos por-ocorrência (título, categoria) que precisem
// ser propagados de uma ocorrência para a próxima.
export function gerarEntradasFaltantes(carteiras, entradasExistentes, mesAlvo) {
  const novas = [];

  for (const carteira of carteiras) {
    const beneficio = carteira.beneficio;
    if (carteira.tipo !== "beneficio" || !carteira.ativa || !beneficio?.recorrente || !beneficio.ativoDesde) continue;

    const mesInicial = mesDeData(beneficio.ativoDesde);
    if (mesInicial > mesAlvo) continue;

    const mesesComEntrada = new Set(entradasExistentes.filter((e) => e.carteiraId === carteira.id).map((e) => mesDeData(e.data)));

    for (const mes of listaMeses(mesInicial, mesAlvo)) {
      if (mesesComEntrada.has(mes)) continue;
      novas.push({
        id: crypto.randomUUID(),
        carteiraId: carteira.id,
        valor: beneficio.valorMensal,
        data: dataDoMes(mes, beneficio.diaRecebimento),
        automatica: true,
        observacoes: "",
      });
      mesesComEntrada.add(mes);
    }
  }

  return novas;
}

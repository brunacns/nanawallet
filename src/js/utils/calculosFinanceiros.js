// Fórmulas financeiras compartilhadas entre telas que precisam,
// obrigatoriamente, chegar sempre ao MESMO número para o mesmo mês — extraídas
// aqui para que Dashboard e Gráficos nunca mais divirjam silenciosamente
// (ver BUG-01 da auditoria de 2026-08-09: o gráfico "Evolução do saldo" somava
// só gastos pagos, o Dashboard somava todos; cada arquivo tinha sua própria
// cópia da fórmula, e uma mudança de regra de negócio em um lugar não se
// propagou pro outro).

/** Soma o valor de uma lista de itens usando um seletor. */
export function somarValor(itens, seletor) {
  return itens.reduce((soma, item) => soma + seletor(item), 0);
}

// Total gasto de um mês, contando TODOS os gastos atribuídos àquele mês —
// pagos ou não. Decisão de negócio da Etapa 13 (histórico do projeto): a
// maioria das compras é no cartão de crédito, então "quanto eu gastei/vou
// gastar este mês" precisa incluir o que ainda não foi pago, não só o que já
// saiu da conta. `gastos` deve já vir filtrado por carteira principal
// (ver `filtrarGastosPrincipais` em carteiras.js) — esta função não decide
// isso, só agrupa por mês.
export function somarGastosDoMes(gastos, mesReferencia) {
  return somarValor(
    gastos.filter((g) => g.mesReferencia === mesReferencia),
    (g) => g.valor
  );
}

// Série de saldo acumulado mês a mês (usada pelo gráfico "Evolução do
// saldo"): para cada mês da lista, soma o que entrou (ganhos pela própria
// data) menos TODOS os gastos daquele mês (ver `somarGastosDoMes` acima) —
// nunca só os pagos, para bater exatamente com "Saldo restante" do Dashboard
// no mesmo período. `mesDeData` é injetado pelo chamador para não criar uma
// dependência circular entre utils/datas.js e utils/calculosFinanceiros.js.
export function calcularSerieSaldoAcumulado(ganhos, gastos, meses, mesDeData) {
  let acumulado = 0;
  return meses.map((chave) => {
    const ganhoMes = somarValor(
      ganhos.filter((g) => mesDeData(g.data) === chave),
      (g) => g.valor
    );
    const gastoMes = somarGastosDoMes(gastos, chave);
    acumulado += ganhoMes - gastoMes;
    return { chave, valor: acumulado };
  });
}

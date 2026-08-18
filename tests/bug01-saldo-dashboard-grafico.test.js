// BUG-01 (Alto, auditoria 2026-08-09): o card "Saldo restante" do Dashboard e
// o gráfico "Evolução do saldo" mostravam números diferentes para o mesmo
// mês, porque o gráfico só descontava gastos PAGOS enquanto o Dashboard
// descontava TODOS os gastos do mês (pagos ou não — regra de negócio da
// Etapa 13, já que a maioria das compras é no cartão).
//
// Cenário reproduzido da auditoria: ganho de R$1.000,00 recebido em
// 15/03/2027 + gasto de R$400,00 com mesReferencia=março/2027, NÃO pago.
//   Dashboard esperado: R$1.000 - R$400 = R$600,00
//   Gráfico (antes da correção): R$1.000 - R$0 = R$1.000,00 (ignorava o gasto pendente)
//
// Os valores esperados abaixo são calculados manualmente (reduce puro), NUNCA
// chamando `somarGastosDoMes`/`calcularSerieSaldoAcumulado` — se a função de
// produção estiver errada, o teste tem que continuar certo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { somarGastosDoMes, calcularSerieSaldoAcumulado } from "../src/js/utils/calculosFinanceiros.js";
import { mesDeData, listaMeses } from "../src/js/utils/datas.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

function somaIndependente(itens) {
  let total = 0;
  for (const item of itens) total += item.valor;
  return total;
}

describe("BUG-01 — Dashboard e gráfico 'Evolução do saldo' devem sempre bater", () => {
  test("somarGastosDoMes soma TODOS os gastos do mês, pagos ou não (não só os pagos)", () => {
    const gastos = [
      { mesReferencia: "2027-03", valor: 400, pago: false },
      { mesReferencia: "2027-03", valor: 150.5, pago: true },
      { mesReferencia: "2027-04", valor: 999, pago: false }, // mês diferente, não deve entrar
    ];
    const esperado = somaIndependente(gastos.filter((g) => g.mesReferencia === "2027-03"));
    assert.equal(esperado, 550.5); // conferência manual do valor esperado
    assert.equal(somarGastosDoMes(gastos, "2027-03"), esperado);
  });

  test("comportamento incorreto original: somar só gastos pagos NÃO reproduz mais o total do mês", () => {
    // Documenta o bug original para que fique óbvio, na leitura do teste, o
    // que estava errado: a soma "só pagos" (fórmula antiga do gráfico) é
    // diferente da soma correta quando existe gasto pendente.
    const gastos = [
      { mesReferencia: "2027-03", valor: 400, pago: false },
      { mesReferencia: "2027-03", valor: 150.5, pago: true },
    ];
    const somaSoPagos = somaIndependente(gastos.filter((g) => g.mesReferencia === "2027-03" && g.pago));
    assert.equal(somaSoPagos, 150.5);
    assert.notEqual(somarGastosDoMes(gastos, "2027-03"), somaSoPagos);
  });

  test("cenário real da auditoria: saldo do Dashboard e ponto final do gráfico batem exatamente", async () => {
    const { limpar } = await criarAmbienteTauri();
    try {
      const { armazenamentoAtivo } = await import("../src/js/servicos/index.js");
      const { TransactionService } = await import("../src/js/servicos/TransactionService.js");
      await armazenamentoAtivo.inicializar();

      const transacoesGanhos = new TransactionService({
        colecao: "ganhos",
        storage: armazenamentoAtivo,
        criarProximaOcorrencia: () => {
          throw new Error("não usado neste teste");
        },
      });
      const transacoesGastos = new TransactionService({
        colecao: "gastos",
        storage: armazenamentoAtivo,
        criarProximaOcorrencia: () => {
          throw new Error("não usado neste teste");
        },
      });
      await transacoesGanhos.listar();
      await transacoesGastos.listar();

      await transacoesGanhos.salvar({
        id: crypto.randomUUID(),
        titulo: "Ganho teste",
        valor: 1000,
        data: "2027-03-15",
        recebido: true,
        fixo: false,
        fixoId: null,
        observacoes: "",
      });
      await transacoesGastos.salvar({
        id: crypto.randomUUID(),
        titulo: "Gasto pendente teste",
        valor: 400,
        data: "2027-03-10",
        mesReferencia: "2027-03",
        salarioResponsavel: "dia15",
        fixo: false,
        fixoId: null,
        pago: false, // ainda não pago — é isso que o gráfico antigo ignorava
        parcela: null,
        categoriaId: null,
        observacoes: "",
      });

      const ganhos = transacoesGanhos.obterTodos();
      const gastos = transacoesGastos.obterTodos();

      // "Saldo restante" do Dashboard para março/2027.
      const totalRecebidoDashboard = somaIndependente(ganhos.filter((g) => mesDeData(g.data) === "2027-03"));
      const totalGastoDashboard = somarGastosDoMes(gastos, "2027-03");
      const saldoDashboard = totalRecebidoDashboard - totalGastoDashboard;
      assert.equal(saldoDashboard, 600); // 1000 - 400, valor esperado calculado à mão

      // Ponto de março/2027 no gráfico "Evolução do saldo".
      const meses = listaMeses("2027-03", "2027-03");
      const serie = calcularSerieSaldoAcumulado(ganhos, gastos, meses, mesDeData);
      const pontoMarco = serie.find((p) => p.chave === "2027-03");

      assert.equal(pontoMarco.valor, 600); // tinha que ser 600, o bug original devolvia 1000
      assert.equal(pontoMarco.valor, saldoDashboard, "Dashboard e gráfico precisam mostrar exatamente o mesmo saldo para o mesmo mês");
    } finally {
      await limpar();
    }
  });

  test("caso de borda: mês sem nenhum gasto pago ainda tem o saldo corretamente reduzido pelos pendentes", () => {
    const ganhos = [{ data: "2026-01-05" }].map((g) => ({ ...g, valor: 500 }));
    const gastos = [
      { mesReferencia: "2026-01", valor: 0.01, pago: false },
      { mesReferencia: "2026-01", valor: 499.98, pago: false },
    ];
    const meses = listaMeses("2026-01", "2026-01");
    const serie = calcularSerieSaldoAcumulado(ganhos, gastos, meses, mesDeData);
    assert.equal(serie[0].valor, 500 - 0.01 - 499.98);
  });

  test("caso de borda: gastos de meses diferentes não vazam para o total de um mês", () => {
    const gastos = [
      { mesReferencia: "2026-12", valor: 100 },
      { mesReferencia: "2027-01", valor: 250 },
    ];
    assert.equal(somarGastosDoMes(gastos, "2026-12"), 100);
    assert.equal(somarGastosDoMes(gastos, "2027-01"), 250);
    assert.equal(somarGastosDoMes(gastos, "2027-02"), 0);
  });
});

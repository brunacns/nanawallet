// Cobertura adicional para áreas financeiras críticas que a auditoria de
// 2026-08-09 verificou manualmente (via harness descartável), mas que não
// tinham NENHUM teste permanente protegendo o comportamento — se uma
// regressão futura reintroduzir algum desses bugs já corrigidos em etapas
// anteriores do projeto, nada acusaria automaticamente. Não é um teste de um
// "bug novo"; é fechar a lacuna de "auditado uma vez, nunca mais verificado".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gerarOcorrenciasFaltantes } from "../src/js/utils/recorrencias.js";
import { dataDoMes, gerarEntradasFaltantes } from "../src/js/utils/recorrenciaCarteira.js";
import { somarMeses } from "../src/js/utils/datas.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

function somaIndependente(itens, campo = "valor") {
  let total = 0;
  for (const item of itens) total += item[campo];
  return total;
}

describe("Cobertura — recorrência de item fixo no dia 31 (vencimento no fim do mês)", () => {
  test("atravessando fevereiro (não bissexto), depois março: nunca fica preso no dia 28", () => {
    const primeiro = { id: "a", data: "2027-01-31", fixoId: "serie-1" };
    const criarProximo = (ultimo, novaData) => ({ id: crypto.randomUUID(), fixoId: "serie-1", data: novaData });

    const novos = gerarOcorrenciasFaltantes([primeiro], "2027-04", criarProximo);
    const datas = [primeiro.data, ...novos.map((n) => n.data)];

    assert.deepEqual(datas, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  test("atravessando um ano bissexto (2028): fevereiro tem 29 dias, e o dia 31 volta corretamente em março", () => {
    const primeiro = { id: "a", data: "2027-12-31", fixoId: "serie-2" };
    const criarProximo = (ultimo, novaData) => ({ id: crypto.randomUUID(), fixoId: "serie-2", data: novaData });

    const novos = gerarOcorrenciasFaltantes([primeiro], "2028-03", criarProximo);
    const datas = [primeiro.data, ...novos.map((n) => n.data)];

    assert.deepEqual(datas, ["2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  test("não gera nada além do necessário quando a série já está em dia com o mês alvo", () => {
    const primeiro = { id: "a", data: "2027-05-31", fixoId: "serie-3" };
    const novos = gerarOcorrenciasFaltantes([primeiro], "2027-05", () => {
      throw new Error("não deveria gerar nada — o mês alvo já é o mês da própria ocorrência");
    });
    assert.deepEqual(novos, []);
  });

  test("séries diferentes (fixoId diferente) não se misturam", () => {
    const itens = [
      { id: "a1", data: "2027-01-10", fixoId: "aluguel" },
      { id: "b1", data: "2027-01-15", fixoId: "internet" },
    ];
    const criarProximo = (ultimo, novaData) => ({ id: crypto.randomUUID(), fixoId: ultimo.fixoId, data: novaData });
    const novos = gerarOcorrenciasFaltantes(itens, "2027-03", criarProximo);

    const deAluguel = novos.filter((n) => n.fixoId === "aluguel");
    const deInternet = novos.filter((n) => n.fixoId === "internet");
    assert.equal(deAluguel.length, 2); // fev, mar
    assert.equal(deInternet.length, 2);
    assert.ok(deAluguel.every((n) => n.data.endsWith("-10")));
    assert.ok(deInternet.every((n) => n.data.endsWith("-15")));
  });
});

describe("Cobertura — recorrência de crédito de carteira de benefício (Ticket Alimentação)", () => {
  test("gera um crédito por mês entre a ativação e o mês alvo, sem duplicar um mês que já tem lançamento manual", () => {
    const carteira = {
      id: "ticket",
      tipo: "beneficio",
      ativa: true,
      beneficio: { valorMensal: 600, diaRecebimento: 5, recorrente: true, acumulaSaldo: true, ativoDesde: "2027-01-05" },
    };
    const entradasExistentes = [{ id: "manual-1", carteiraId: "ticket", data: "2027-02-05", valor: 600, automatica: false, observacoes: "lançado na mão" }];

    const novas = gerarEntradasFaltantes([carteira], entradasExistentes, "2027-04");
    const meses = novas.map((n) => n.data.slice(0, 7)).sort();

    // Janeiro, março e abril precisam ser gerados; fevereiro NÃO (já tem lançamento manual).
    assert.deepEqual(meses, ["2027-01", "2027-03", "2027-04"]);
    assert.ok(novas.every((n) => n.valor === 600 && n.automatica === true));
  });

  test("dia de recebimento 31 é ajustado para o último dia real de cada mês (dataDoMes)", () => {
    assert.equal(dataDoMes("2027-02", 31), "2027-02-28");
    assert.equal(dataDoMes("2028-02", 31), "2028-02-29"); // bissexto
    assert.equal(dataDoMes("2027-04", 31), "2027-04-30");
    assert.equal(dataDoMes("2027-01", 31), "2027-01-31");
  });

  test("carteira inativa ou não recorrente não gera nenhuma entrada automática", () => {
    const inativa = { id: "x", tipo: "beneficio", ativa: false, beneficio: { valorMensal: 500, diaRecebimento: 1, recorrente: true, ativoDesde: "2027-01-01" } };
    const naoRecorrente = { id: "y", tipo: "beneficio", ativa: true, beneficio: { valorMensal: 500, diaRecebimento: 1, recorrente: false, ativoDesde: "2027-01-01" } };
    assert.deepEqual(gerarEntradasFaltantes([inativa, naoRecorrente], [], "2027-06"), []);
  });
});

describe("Cobertura — cálculo de saldo acumulado de carteira de benefício", () => {
  test("com acumulaSaldo=true, o saldo não gasto num mês soma ao mês seguinte (verificação independente)", async () => {
    const { calcularSaldoCarteira } = await import("../src/js/carteiras.js");
    const carteira = { id: "ticket", beneficio: { acumulaSaldo: true } };
    const entradas = [
      { carteiraId: "ticket", data: "2027-01-05", valor: 600 },
      { carteiraId: "ticket", data: "2027-02-05", valor: 600 },
    ];
    const gastos = [{ carteiraId: "ticket", data: "2027-01-10", valor: 450 }];

    const resultado = calcularSaldoCarteira(carteira, entradas, gastos, "2027-02");

    // Cálculo independente: saldo de janeiro = 600 - 450 = 150.
    // Fevereiro: 150 (anterior) + 600 (recebido) - 0 (gasto) = 750.
    const saldoJaneiroEsperado = somaIndependente(entradas.filter((e) => e.data < "2027-02")) - somaIndependente(gastos.filter((g) => g.data < "2027-02"));
    assert.equal(saldoJaneiroEsperado, 150);
    assert.equal(resultado.saldoAnterior, 150);
    assert.equal(resultado.saldoAtual, 750);
  });

  test("com acumulaSaldo=false, cada mês começa zerado (saldo do mês anterior nunca soma)", async () => {
    const { calcularSaldoCarteira } = await import("../src/js/carteiras.js");
    const carteira = { id: "ticket", beneficio: { acumulaSaldo: false } };
    const entradas = [
      { carteiraId: "ticket", data: "2027-01-05", valor: 600 },
      { carteiraId: "ticket", data: "2027-02-05", valor: 600 },
    ];
    const gastos = [{ carteiraId: "ticket", data: "2027-01-10", valor: 100 }];

    const resultado = calcularSaldoCarteira(carteira, entradas, gastos, "2027-02");
    assert.equal(resultado.saldoAnterior, 0);
    assert.equal(resultado.saldoAtual, 600); // só o recebido de fevereiro, gasto de janeiro não conta
  });
});

describe("Cobertura — migração automática de campos antigos (retrocompatibilidade)", () => {
  test("gasto salvo antes da mudança de dia de salário (dia10/dia25) migra para dia15/dia30 ao carregar", async () => {
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      // Grava diretamente no formato ANTIGO (sem passar pelo serviço, que já migraria na escrita).
      await armazenamento.salvarMes("gastos", "2026-03", [
        { id: "antigo-1", titulo: "Aluguel", valor: 1200, data: "2026-03-10", mesReferencia: "2026-03", salarioResponsavel: "dia10", fixo: true, fixoId: "f1", pago: false, parcela: null },
      ]);

      const { transacoesGastos } = await import("../src/js/servicos/index.js");
      const itens = await transacoesGastos.listar();
      const migrado = itens.find((g) => g.id === "antigo-1");

      assert.equal(migrado.salarioResponsavel, "dia15", "salarioResponsavel antigo 'dia10' deveria virar 'dia15'");
      assert.equal(migrado.categoriaId, null, "campo categoriaId ausente deveria migrar para null, não undefined");
      assert.equal(migrado.carteiraId, null, "campo carteiraId ausente deveria migrar para null (carteira principal)");
      assert.equal(migrado.observacoes, "", "campo observacoes ausente deveria migrar para string vazia");
    } finally {
      await limpar();
    }
  });

  test("ganho salvo antes do campo 'recebido' existir migra como recebido:true (preserva o comportamento antigo)", async () => {
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      await armazenamento.salvarMes("ganhos", "2026-03", [{ id: "antigo-2", titulo: "Salário", valor: 3000, data: "2026-03-05" }]);

      const { transacoesGanhos } = await import("../src/js/servicos/index.js");
      const itens = await transacoesGanhos.listar();
      const migrado = itens.find((g) => g.id === "antigo-2");

      assert.equal(migrado.recebido, true);
      assert.equal(migrado.fixo, false);
      assert.equal(migrado.fixoId, null);
    } finally {
      await limpar();
    }
  });
});

describe("Cobertura — parcelamento: total e data da última parcela em cenários de borda", () => {
  test("1 parcela não é permitido pela regra de negócio (parcelamento exige no mínimo 2) — somarMeses isolado ainda assim soma corretamente 0 meses", () => {
    assert.equal(somarMeses("2027-06-15", 0), "2027-06-15");
  });

  test("12 parcelas mensais a partir de janeiro terminam em dezembro do mesmo ano", () => {
    const ultima = somarMeses("2027-01-31", 11);
    assert.equal(ultima, "2027-12-31");
  });

  test("parcelamento atravessando a virada do ano (out/2027 a mar/2028)", () => {
    const datas = [];
    for (let i = 0; i < 6; i++) datas.push(somarMeses("2027-10-15", i));
    assert.deepEqual(datas, ["2027-10-15", "2027-11-15", "2027-12-15", "2028-01-15", "2028-02-15", "2028-03-15"]);
  });

  test("parcela iniciando dia 31 atravessando fevereiro não fica presa no dia 28 (mesma proteção da recorrência fixa)", () => {
    const datas = [];
    for (let i = 0; i < 4; i++) datas.push(somarMeses("2027-01-31", i));
    assert.deepEqual(datas, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

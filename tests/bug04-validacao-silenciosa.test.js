// BUG-04 (Médio, auditoria 2026-08-09): título/nome preenchido só com
// espaços em branco fazia 5 formulários diferentes (Ganhos, Gastos,
// Lembretes, Metas, Parcelamento) falharem SEM NENHUMA mensagem — o
// atributo HTML `required` não pega isso (espaços não são uma string vazia
// para o navegador), e o `return` no meio da função de salvar não avisava
// nada. Confirmado na auditoria: o modal continuava aberto com o campo
// intacto, sem qualquer indício do que precisava ser corrigido.
//
// Comportamento esperado depois da correção: o mesmo balão nativo de
// validação já usado para "Preencha este campo"/"O valor deve ser maior ou
// igual a 0,01" aparece também para este caso — e o item continua NÃO sendo
// salvo (o comportamento correto de "não salvar lixo" foi preservado, só o
// feedback que estava faltando).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar, preencher, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

async function prepararAmbiente() {
  montarDom();
  const ambiente = await criarAmbienteTauri();
  const armazenamento = await import("../src/js/dados/armazenamento.js");
  await armazenamento.inicializar();
  return ambiente;
}

describe("BUG-04 — Ganhos: título só com espaços não salva e avisa a usuária", () => {
  test("reprodução + correção", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGanhos, obterGanhos } = await import("../src/js/modulos/ganhos.js");
      await iniciarPaginaGanhos();

      clicar(document.getElementById("botao-novo-ganho"));
      const campoTitulo = document.getElementById("campo-titulo-ganho");
      preencher(campoTitulo, "   ");
      preencher(document.getElementById("campo-valor-ganho"), "150");
      preencher(document.getElementById("campo-data-ganho"), "2027-05-10");

      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));

      // Comportamento incorreto original: nada — sem mensagem, sem salvar,
      // sem pista nenhuma. Agora precisa ter uma mensagem de validação E
      // continuar sem salvar (as duas coisas ao mesmo tempo).
      assert.equal(campoTitulo.validationMessage.length > 0, true, "o campo precisa mostrar uma mensagem de validação");
      assert.equal(campoTitulo.checkValidity(), false);
      assert.equal(obterGanhos().length, 0, "nenhum ganho deve ter sido salvo com título em branco");
      assert.equal(document.getElementById("sobreposicao-ganho").hidden, false, "o modal deve continuar aberto");

      // Corrigindo o título, o formulário salva normalmente.
      preencher(campoTitulo, "Freela de design");
      assert.equal(campoTitulo.checkValidity(), true, "corrigir o título deve limpar a mensagem de validação anterior");
      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-ganho").hidden, { mensagem: "modal de ganho fechar após salvar" });
      assert.equal(obterGanhos().length, 1);
      assert.equal(obterGanhos()[0].titulo, "Freela de design");
    } finally {
      await limpar();
    }
  });
});

describe("BUG-04 — Gastos: título só com espaços não salva e avisa a usuária", () => {
  test("reprodução + correção", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();

      clicar(document.getElementById("botao-novo-gasto"));
      const campoTitulo = document.getElementById("campo-titulo-gasto");
      preencher(campoTitulo, "\t\t");
      preencher(document.getElementById("campo-valor-gasto"), "89.9");
      preencher(document.getElementById("campo-data-gasto"), "2027-05-12");
      preencher(document.getElementById("campo-mes-referencia-gasto"), "2027-05");

      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));

      assert.equal(campoTitulo.validationMessage.length > 0, true);
      assert.equal(obterGastos().length, 0, "nenhum gasto deve ter sido salvo com título em branco");
      assert.equal(document.getElementById("sobreposicao-gasto").hidden, false);

      preencher(campoTitulo, "Mercado");
      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-gasto").hidden, { mensagem: "modal de gasto fechar após salvar" });
      assert.equal(obterGastos().length, 1);
      assert.equal(obterGastos()[0].titulo, "Mercado");
    } finally {
      await limpar();
    }
  });
});

describe("BUG-04 — Lembretes: título só com espaços não salva e avisa a usuária", () => {
  test("reprodução + correção", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaLembretes, obterLembretes } = await import("../src/js/modulos/lembretes.js");
      await iniciarPaginaLembretes();

      clicar(document.getElementById("botao-novo-lembrete"));
      const campoTitulo = document.getElementById("campo-titulo-lembrete");
      preencher(campoTitulo, "  ");
      preencher(document.getElementById("campo-valor-lembrete"), "300");
      preencher(document.getElementById("campo-data-lembrete"), "2027-06-01");

      clicar(document.getElementById("formulario-lembrete").querySelector('button[type="submit"]'));

      assert.equal(campoTitulo.validationMessage.length > 0, true);
      assert.equal(obterLembretes().length, 0);

      preencher(campoTitulo, "Renovar seguro do carro");
      clicar(document.getElementById("formulario-lembrete").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-lembrete").hidden, { mensagem: "modal de lembrete fechar após salvar" });
      assert.equal(obterLembretes().length, 1);
    } finally {
      await limpar();
    }
  });
});

describe("BUG-04 — Metas: nome só com espaços não salva e avisa a usuária", () => {
  test("reprodução + correção", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas, obterMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      const campoNome = document.getElementById("campo-nome-meta");
      preencher(campoNome, "   ");
      preencher(document.getElementById("campo-valor-desejado-meta"), "5000");

      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));

      assert.equal(campoNome.validationMessage.length > 0, true);
      assert.equal(obterMetas().length, 0);

      preencher(campoNome, "Reserva de emergência");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden, { mensagem: "modal de meta fechar após salvar" });
      assert.equal(obterMetas().length, 1);
    } finally {
      await limpar();
    }
  });
});

describe("BUG-04 — Parcelamento: título só com espaços não salva e avisa a usuária", () => {
  test("reprodução + correção", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      const campoTitulo = document.getElementById("campo-titulo-parcelamento");
      preencher(campoTitulo, "     ");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "3");
      preencher(document.getElementById("campo-valor-parcelamento"), "199.9");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-05-15");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));

      assert.equal(campoTitulo.validationMessage.length > 0, true);
      assert.equal(obterGastos().length, 0, "nenhuma parcela deve ter sido gerada com título em branco");

      preencher(campoTitulo, "Notebook novo");
      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-parcelamento").hidden, { mensagem: "modal de parcelamento fechar após salvar" });
      assert.equal(obterGastos().length, 3, "as 3 parcelas devem ter sido geradas depois de corrigir o título");
    } finally {
      await limpar();
    }
  });
});

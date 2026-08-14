// Recomendação pendente da auditoria anterior (2026-08-13): confirmação
// visual discreta ao salvar/editar/excluir uma transação. Implementada como
// um "toast" (utils/toast.js) que aparece no rodapé da tela e some sozinho —
// sem bloquear a interface nem exigir clique. Estes testes cobrem que a
// mensagem certa aparece no momento certo, para os 3 módulos que lidam com
// transações (gastos, ganhos, parcelamento).
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

async function esperarToast(texto) {
  await esperarAte(() => [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes(texto)), {
    mensagem: `toast com o texto "${texto}"`,
  });
  return [...document.querySelectorAll(".toast")].find((t) => t.textContent.includes(texto));
}

describe("Toast de confirmação — Gastos", () => {
  test("criar um gasto mostra 'Gasto adicionado'; editar mostra 'Gasto atualizado'; excluir mostra 'Gasto excluído'", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();

      clicar(document.getElementById("botao-novo-gasto"));
      preencher(document.getElementById("campo-titulo-gasto"), "Mercado");
      preencher(document.getElementById("campo-valor-gasto"), "80");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-gasto"), hoje);
      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos().length === 1);

      const toastCriar = await esperarToast("Gasto adicionado");
      assert.ok(toastCriar.classList.contains("toast--sucesso"));
      assert.equal(toastCriar.getAttribute("role"), "status");

      const id = obterGastos()[0].id;
      clicar(document.querySelector(`tr[data-id="${id}"] [data-acao="editar"]`));
      preencher(document.getElementById("campo-valor-gasto"), "90");
      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos()[0].valor === 90);
      await esperarToast("Gasto atualizado");

      globalThis.confirm = () => true;
      clicar(document.querySelector(`tr[data-id="${id}"] [data-acao="excluir"]`));
      await esperarAte(() => obterGastos().length === 0);
      const toastExcluir = await esperarToast("Gasto excluído");
      assert.ok(toastExcluir.classList.contains("toast--exclusao"));
    } finally {
      await limpar();
    }
  });
});

describe("Toast de confirmação — Ganhos", () => {
  test("criar um ganho mostra 'Ganho adicionado'; excluir mostra 'Ganho excluído'", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGanhos, obterGanhos } = await import("../src/js/modulos/ganhos.js");
      await iniciarPaginaGanhos();

      clicar(document.getElementById("botao-novo-ganho"));
      preencher(document.getElementById("campo-titulo-ganho"), "Freela");
      preencher(document.getElementById("campo-valor-ganho"), "400");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-ganho"), hoje);
      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGanhos().length === 1);
      await esperarToast("Ganho adicionado");

      globalThis.confirm = () => true;
      const id = obterGanhos()[0].id;
      clicar(document.querySelector(`[data-id="${id}"] [data-acao="excluir"]`));
      await esperarAte(() => obterGanhos().length === 0);
      await esperarToast("Ganho excluído");
    } finally {
      await limpar();
    }
  });
});

describe("Toast de confirmação — Parcelamento", () => {
  test("gerar parcelas mostra 'N parcelas geradas'", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "Notebook");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "6");
      preencher(document.getElementById("campo-valor-parcelamento"), "200");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-03-10");
      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));

      await esperarAte(() => obterGastos().length === 6);
      await esperarToast("6 parcelas geradas");
    } finally {
      await limpar();
    }
  });
});

// BUG-06 (Baixo, auditoria 2026-08-09): nenhum modal prendia o foco do
// teclado — pressionar Tab repetidamente dentro de um modal aberto fazia o
// foco escapar para o menu lateral por trás, que continuava totalmente
// interativo mesmo com o modal visualmente por cima. Confirmado na auditoria
// via teste real: depois de poucos Tabs, `document.activeElement` passava a
// ser um item do menu lateral (`sidebar__item`), fora do modal.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

function tab(elemento, { shift = false } = {}) {
  const evento = new globalThis.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
  elemento.dispatchEvent(evento);
  return evento;
}

describe("BUG-06 — modais têm role=dialog/aria-modal e prendem o foco do teclado", () => {
  test("os 6 modais do app têm role=\"dialog\" e aria-modal=\"true\"", () => {
    montarDom();
    const ids = [
      "sobreposicao-ganho",
      "sobreposicao-gasto",
      "sobreposicao-parcelamento",
      "sobreposicao-lembrete",
      "sobreposicao-meta",
      "sobreposicao-escopo-exclusao",
    ];
    for (const id of ids) {
      const modal = document.getElementById(id).querySelector(".modal");
      assert.equal(modal.getAttribute("role"), "dialog", `${id} deveria ter role="dialog"`);
      assert.equal(modal.getAttribute("aria-modal"), "true", `${id} deveria ter aria-modal="true"`);
    }
  });

  test("Tab no último campo focável do modal de lembrete volta pro primeiro (não escapa pro menu lateral)", async () => {
    montarDom();
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      const { iniciarPaginaLembretes } = await import("../src/js/modulos/lembretes.js");
      await iniciarPaginaLembretes();

      clicar(document.getElementById("botao-novo-lembrete"));
      const overlay = document.getElementById("sobreposicao-lembrete");
      // O primeiro elemento focável do modal, na ordem do DOM, é o "×" de
      // fechar (fica no cabeçalho, antes do formulário) — não o campo de título.
      const botaoFechar = document.getElementById("botao-fechar-modal-lembrete");
      const botaoSalvar = overlay.querySelector('button[type="submit"]');

      // Reprodução do bug: foco no último elemento focável do modal, Tab.
      botaoSalvar.focus();
      assert.equal(document.activeElement, botaoSalvar);
      const evento = tab(overlay);

      assert.equal(evento.defaultPrevented, true, "o Tab que sairia do modal precisa ser interceptado");
      assert.equal(document.activeElement, botaoFechar, "o foco deve voltar pro primeiro elemento focável do modal, não escapar pro resto da página");
    } finally {
      await limpar();
    }
  });

  test("Shift+Tab no primeiro campo do modal vai pro último (ciclo na outra direção)", async () => {
    montarDom();
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      const { iniciarPaginaLembretes } = await import("../src/js/modulos/lembretes.js");
      await iniciarPaginaLembretes();

      clicar(document.getElementById("botao-novo-lembrete"));
      const overlay = document.getElementById("sobreposicao-lembrete");
      const botaoFechar = document.getElementById("botao-fechar-modal-lembrete");
      const botaoSalvar = overlay.querySelector('button[type="submit"]');

      botaoFechar.focus();
      const evento = tab(overlay, { shift: true });

      assert.equal(evento.defaultPrevented, true);
      assert.equal(document.activeElement, botaoSalvar);
    } finally {
      await limpar();
    }
  });

  test("Tab em um campo do MEIO do formulário não é interceptado (só as bordas do ciclo)", async () => {
    montarDom();
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      const { iniciarPaginaLembretes } = await import("../src/js/modulos/lembretes.js");
      await iniciarPaginaLembretes();

      clicar(document.getElementById("botao-novo-lembrete"));
      const overlay = document.getElementById("sobreposicao-lembrete");
      document.getElementById("campo-valor-lembrete").focus();
      const evento = tab(overlay);

      assert.equal(evento.defaultPrevented, false, "Tab num campo do meio deve seguir o comportamento normal do navegador");
    } finally {
      await limpar();
    }
  });
});

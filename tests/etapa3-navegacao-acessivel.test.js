// Etapa de refinamento visual/UX (2026-08-13): a sidebar recolhe para só
// ícones em janelas estreitas (<=860px) escondendo o <span> de texto de cada
// botão via `display: none`. Texto com display:none é EXCLUÍDO do cálculo de
// nome acessível — sem aria-label, um leitor de tela anunciaria só "botão",
// sem dizer qual página. Corrigido com aria-label/title fixos em cada item
// (independentes do CSS) e aria-current="page" no item ativo (sinal
// semântico de "página atual", que antes só existia visualmente via classe
// .ativo).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar } from "./helpers/appDom.js";

describe("Sidebar: nome acessível independente do CSS + página atual sinalizada por aria-current", () => {
  test("todo item do menu tem aria-label não vazio (funciona mesmo com o <span> escondido)", () => {
    montarDom();
    const itens = document.querySelectorAll(".sidebar__item");
    assert.equal(itens.length, 8, "esperava 8 itens de navegação");
    itens.forEach((item) => {
      const rotulo = item.getAttribute("aria-label");
      assert.ok(rotulo && rotulo.trim().length > 0, `item data-pagina="${item.dataset.pagina}" precisa de aria-label`);
      assert.equal(rotulo, item.querySelector("span").textContent, "aria-label deve bater com o texto visível");
    });
  });

  test("Dashboard começa marcado como página atual (aria-current=page)", () => {
    montarDom();
    const dashboard = document.querySelector('.sidebar__item[data-pagina="dashboard"]');
    assert.equal(dashboard.getAttribute("aria-current"), "page");
  });

  test("clicar em outro item move o aria-current='page' para ele (e tira do anterior)", async () => {
    montarDom();
    const { configurarNavegacao } = await import("../src/js/navegacao.js");
    configurarNavegacao();

    const dashboard = document.querySelector('.sidebar__item[data-pagina="dashboard"]');
    const gastos = document.querySelector('.sidebar__item[data-pagina="gastos"]');
    assert.equal(dashboard.getAttribute("aria-current"), "page");
    assert.equal(gastos.hasAttribute("aria-current"), false);

    clicar(gastos);

    assert.equal(gastos.getAttribute("aria-current"), "page");
    assert.equal(dashboard.hasAttribute("aria-current"), false);
    assert.equal(gastos.classList.contains("ativo"), true);
    assert.equal(dashboard.classList.contains("ativo"), false);
  });
});

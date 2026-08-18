// Recomendação pendente da auditoria anterior (2026-08-13): o Histórico
// carregava e renderizava TODAS as transações de uma vez — com muitos anos
// de uso (milhares de itens) isso deixaria de escalar bem, mesmo sendo só
// HTML (sem virtualização). Paginado em blocos de 50: os totais do topo
// continuam somando o conjunto FILTRADO inteiro (não mudou), só a tabela em
// si mostra uma página por vez.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

async function prepararComNGastos(quantidade) {
  montarDom();
  const ambiente = await criarAmbienteTauri();
  const armazenamento = await import("../src/js/dados/armazenamento.js");
  await armazenamento.inicializar();

  const { iniciarPaginaGastos, adicionarGastosEmLote } = await import("../src/js/modulos/gastos.js");
  await iniciarPaginaGastos();

  const gastos = Array.from({ length: quantidade }, (_, i) => ({
    id: crypto.randomUUID(),
    titulo: `Gasto ${String(i + 1).padStart(3, "0")}`,
    valor: 10 + i,
    data: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
    mesReferencia: "2027-01",
    salarioResponsavel: "dia15",
    fixo: false,
    fixoId: null,
    pago: false,
    parcela: null,
    categoriaId: null,
    observacoes: "",
  }));
  await adicionarGastosEmLote(gastos);

  return ambiente;
}

describe("Histórico: paginação", () => {
  test("com poucos itens (<=50), os controles de paginação ficam escondidos", async () => {
    const { limpar } = await prepararComNGastos(5);
    try {
      const { iniciarHistorico } = await import("../src/js/modulos/historico.js");
      iniciarHistorico();
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 5);

      assert.equal(document.getElementById("historico-paginacao").hidden, true);
    } finally {
      await limpar();
    }
  });

  test("com mais de 50 itens, mostra 50 por página e o rótulo 'Página 1 de 2'", async () => {
    const { limpar } = await prepararComNGastos(70);
    try {
      const { iniciarHistorico } = await import("../src/js/modulos/historico.js");
      iniciarHistorico();
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 50);

      const paginacao = document.getElementById("historico-paginacao");
      assert.equal(paginacao.hidden, false);
      assert.equal(document.getElementById("historico-pagina-rotulo").textContent, "Página 1 de 2");
      assert.equal(document.getElementById("historico-pagina-anterior").disabled, true, "não há página anterior à primeira");
      assert.equal(document.getElementById("historico-pagina-seguinte").disabled, false);

      // Os totais do topo continuam somando as 70 transações, não só as 50 visíveis.
      assert.equal(document.getElementById("historico-contagem").textContent, "70");
    } finally {
      await limpar();
    }
  });

  test("clicar em 'próxima página' mostra os 20 itens restantes e desabilita o botão de avançar", async () => {
    const { limpar } = await prepararComNGastos(70);
    try {
      const { iniciarHistorico } = await import("../src/js/modulos/historico.js");
      iniciarHistorico();
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 50);

      clicar(document.getElementById("historico-pagina-seguinte"));
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 20);

      assert.equal(document.getElementById("historico-pagina-rotulo").textContent, "Página 2 de 2");
      assert.equal(document.getElementById("historico-pagina-anterior").disabled, false);
      assert.equal(document.getElementById("historico-pagina-seguinte").disabled, true, "não há próxima página depois da última");

      clicar(document.getElementById("historico-pagina-anterior"));
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 50);
      assert.equal(document.getElementById("historico-pagina-rotulo").textContent, "Página 1 de 2");
    } finally {
      await limpar();
    }
  });

  test("mudar um filtro volta para a página 1", async () => {
    const { limpar } = await prepararComNGastos(70);
    try {
      const { iniciarHistorico } = await import("../src/js/modulos/historico.js");
      iniciarHistorico();
      await esperarAte(() => document.getElementById("historico-corpo-tabela").children.length === 50);

      clicar(document.getElementById("historico-pagina-seguinte"));
      await esperarAte(() => document.getElementById("historico-pagina-rotulo").textContent === "Página 2 de 2");

      const selectTipo = document.getElementById("historico-filtro-tipo");
      selectTipo.value = "gasto";
      selectTipo.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));

      await esperarAte(() => document.getElementById("historico-pagina-rotulo").textContent === "Página 1 de 2");
    } finally {
      await limpar();
    }
  });
});

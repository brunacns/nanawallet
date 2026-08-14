// BUG-08 (Baixo, auditoria 2026-08-09): a busca do Histórico re-renderizava
// a tabela inteira a CADA tecla digitada, sem debounce — medido em ~108ms
// por tecla com ~4.800 transações cadastradas. Um debounce evita refazer o
// trabalho completo enquanto a pessoa ainda está digitando.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { debounce } from "../src/js/utils/debounce.js";

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("BUG-08 — debounce() genérico", () => {
  test("várias chamadas rápidas em sequência resultam em UMA única execução, com os argumentos da última chamada", async () => {
    let chamadas = 0;
    let ultimoArg = null;
    const fn = debounce((valor) => {
      chamadas++;
      ultimoArg = valor;
    }, 50);

    fn("v");
    fn("vo");
    fn("vol");
    fn("volu");
    fn("volume");

    // Antes do atraso passar, nada deveria ter executado ainda.
    assert.equal(chamadas, 0);

    await esperar(80);
    assert.equal(chamadas, 1, "5 chamadas rápidas deveriam resultar em apenas 1 execução");
    assert.equal(ultimoArg, "volume", "deve executar com o argumento da ÚLTIMA chamada, não da primeira");
  });

  test("chamadas espaçadas (mais que o atraso) resultam em uma execução cada", async () => {
    let chamadas = 0;
    const fn = debounce(() => chamadas++, 30);

    fn();
    await esperar(50);
    fn();
    await esperar(50);

    assert.equal(chamadas, 2);
  });
});

describe("BUG-08 — busca do Histórico usa debounce (comportamento observável via renderização)", () => {
  test("digitar rapidamente vários caracteres re-renderiza a tabela só depois de parar de digitar, não a cada tecla", async () => {
    const { montarDom, preencher } = await import("./helpers/appDom.js");
    const { criarAmbienteTauri } = await import("./helpers/tauriFsMock.js");

    montarDom();
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      const { transacoesGastos } = await import("../src/js/servicos/index.js");
      await transacoesGastos.listar();
      await transacoesGastos.salvarEmLote([
        { id: "g1", titulo: "Mercado Extra", valor: 50, data: "2027-01-05", mesReferencia: "2027-01", salarioResponsavel: "dia15", fixo: false, fixoId: null, pago: false, parcela: null, categoriaId: null, carteiraId: null, observacoes: "" },
        { id: "g2", titulo: "Farmácia", valor: 30, data: "2027-01-06", mesReferencia: "2027-01", salarioResponsavel: "dia15", fixo: false, fixoId: null, pago: false, parcela: null, categoriaId: null, carteiraId: null, observacoes: "" },
      ]);

      const { iniciarHistorico } = await import("../src/js/modulos/historico.js");
      iniciarHistorico();

      const campoBusca = document.getElementById("historico-busca");
      const corpo = document.getElementById("historico-corpo-tabela");
      const linhasAntes = corpo.children.length;
      assert.equal(linhasAntes, 2);

      // Digita "Merc" rapidamente, uma tecla de cada vez, sem esperar entre elas.
      for (const parcial of ["M", "Me", "Mer", "Merc"]) {
        preencher(campoBusca, parcial);
      }

      // Logo depois de digitar, a tabela ainda não deveria ter sido
      // re-filtrada (o debounce ainda não passou) — continua mostrando as 2 linhas.
      assert.equal(corpo.children.length, linhasAntes, "a tabela não deveria re-renderizar antes do debounce passar");

      await esperar(300); // > que o atraso de debounce (200ms) configurado em historico.js
      assert.equal(corpo.children.length, 1, "depois do debounce, só a transação que combina com 'Merc' deve aparecer");
    } finally {
      await limpar();
    }
  });
});

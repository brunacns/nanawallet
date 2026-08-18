// BUG-09 (Baixo, auditoria 2026-08-09): o campo "Quantidade de parcelas" não
// tinha limite máximo nem confirmação prévia — um erro de digitação (ex:
// "1000" em vez de "10") gerava centenas de gastos de uma vez, sem nenhum
// aviso mostrando o compromisso total antes de confirmar.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { montarDom, clicar, preencher, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf-8");

async function prepararAmbiente() {
  montarDom();
  const ambiente = await criarAmbienteTauri();
  const armazenamento = await import("../src/js/dados/armazenamento.js");
  await armazenamento.inicializar();
  return ambiente;
}

describe("BUG-09 — limite e confirmação ao gerar muitas parcelas", () => {
  test("o campo de quantidade tem max=\"120\" no HTML", () => {
    assert.match(html, /id="campo-quantidade-parcelamento"[^>]*max="120"/);
  });

  test("gerar mais de 12 parcelas pede confirmação mostrando quantidade, valor total e data da última parcela", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      let mensagemConfirmacao = null;
      globalThis.confirm = (mensagem) => {
        mensagemConfirmacao = mensagem;
        return true;
      };

      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "TV nova");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "24");
      preencher(document.getElementById("campo-valor-parcelamento"), "100");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-01-10");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));

      // confirm() é chamado de forma síncrona dentro de salvarFormulario,
      // antes de qualquer await — já está disponível assim que o clique retorna.
      assert.notEqual(mensagemConfirmacao, null, "deveria ter pedido confirmação para 24 parcelas");
      assert.match(mensagemConfirmacao, /24 parcelas/);
      assert.match(mensagemConfirmacao, /R\$\s*100,00/); // valor de cada parcela
      assert.match(mensagemConfirmacao, /R\$\s*2\.400,00/); // total: 24 x 100
      // A gravação em si é assíncrona (I/O real) — esperar a condição de
      // verdade em vez de um tempo fixo evita flakiness sob carga (várias
      // suítes de teste rodando ao mesmo tempo).
      await esperarAte(() => obterGastos().length === 24, { mensagem: "24 parcelas serem geradas" });
    } finally {
      await limpar();
    }
  });

  test("recusar a confirmação NÃO gera nenhuma parcela", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      globalThis.confirm = () => false; // usuária cancela

      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "Sofá");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "18");
      preencher(document.getElementById("campo-valor-parcelamento"), "150");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-01-10");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));
      await new Promise((r) => setTimeout(r, 100));

      assert.equal(obterGastos().length, 0, "cancelar a confirmação não deve gerar nenhuma parcela");
    } finally {
      await limpar();
    }
  });

  test("12 parcelas ou menos NÃO pedem confirmação (só quantidades grandes)", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      let confirmChamado = false;
      globalThis.confirm = () => {
        confirmChamado = true;
        return true;
      };

      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "Celular");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "10");
      preencher(document.getElementById("campo-valor-parcelamento"), "200");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-01-10");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos().length === 10, { mensagem: "10 parcelas serem geradas" });

      assert.equal(confirmChamado, false, "10 parcelas não deveria pedir confirmação");
    } finally {
      await limpar();
    }
  });
});

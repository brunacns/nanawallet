// BUG-09 (Baixo, auditoria 2026-08-09): o campo "Quantidade de parcelas" não
// tinha limite máximo nem confirmação prévia — um erro de digitação (ex:
// "1000" em vez de "10") gerava centenas de gastos de uma vez, sem nenhum
// aviso mostrando o compromisso total antes de confirmar.
//
// BUG-10 (Baixo, auditoria 2026-08-09): o formulário de parcelamento não
// tinha seletor de carteira — sempre gravava `carteiraId: null` (carteira
// principal), então não era possível parcelar uma compra feita com o
// Ticket Alimentação (só o formulário de gasto avulso permitia escolher carteira).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { montarDom, clicar, preencher, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf-8");

async function prepararComCarteiraBeneficioAtiva() {
  montarDom();
  const ambiente = await criarAmbienteTauri();
  const armazenamento = await import("../src/js/dados/armazenamento.js");
  await armazenamento.inicializar();

  // Ativa a carteira de benefício seedada (Ticket Alimentação) para os
  // testes de BUG-10 poderem selecioná-la no formulário.
  const { carteirasService } = await import("../src/js/servicos/index.js");
  await carteirasService.listar();
  const ticket = carteirasService.obterTodos().find((c) => c.tipo === "beneficio");
  ticket.ativa = true;
  await carteirasService.salvar(ticket);

  return { ...ambiente, ticket };
}

describe("BUG-09 — limite e confirmação ao gerar muitas parcelas", () => {
  test("o campo de quantidade tem max=\"120\" no HTML", () => {
    assert.match(html, /id="campo-quantidade-parcelamento"[^>]*max="120"/);
  });

  test("gerar mais de 12 parcelas pede confirmação mostrando quantidade, valor total e data da última parcela", async () => {
    const { limpar } = await prepararComCarteiraBeneficioAtiva();
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
    const { limpar } = await prepararComCarteiraBeneficioAtiva();
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
    const { limpar } = await prepararComCarteiraBeneficioAtiva();
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

describe("BUG-10 — parcelamento pode ser vinculado a uma carteira (ex: Ticket Alimentação)", () => {
  test("existe um seletor de carteira no formulário de parcelamento", () => {
    assert.match(html, /id="campo-carteira-parcelamento"/);
  });

  test("gerar um parcelamento com a carteira do benefício selecionada grava carteiraId em todas as parcelas, e elas ficam fora do total de Gastos principal", async () => {
    const { limpar, ticket } = await prepararComCarteiraBeneficioAtiva();
    try {
      globalThis.confirm = () => true;

      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      const { filtrarGastosPrincipais } = await import("../src/js/carteiras.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "Compra grande no Ticket");
      preencher(document.getElementById("campo-carteira-parcelamento"), ticket.id);
      // Selecionar a carteira de benefício deveria esconder "salário responsável".
      document.getElementById("campo-carteira-parcelamento").dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
      assert.equal(document.getElementById("linha-salario-parcelamento").hidden, true);

      preencher(document.getElementById("campo-quantidade-parcelamento"), "3");
      preencher(document.getElementById("campo-valor-parcelamento"), "50");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-02-10");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos().filter((g) => g.titulo === "Compra grande no Ticket").length === 3);

      const todasAsParcelas = obterGastos().filter((g) => g.titulo === "Compra grande no Ticket");
      assert.equal(todasAsParcelas.length, 3);
      assert.ok(todasAsParcelas.every((g) => g.carteiraId === ticket.id), "todas as parcelas devem ter o carteiraId do benefício");

      const gastosPrincipais = filtrarGastosPrincipais(obterGastos());
      assert.equal(
        gastosPrincipais.filter((g) => g.titulo === "Compra grande no Ticket").length,
        0,
        "parcelas pagas com o benefício não podem entrar no financeiro principal"
      );
    } finally {
      await limpar();
    }
  });

  test("sem escolher carteira nenhuma, o parcelamento continua indo para a carteira principal (carteiraId aponta pra uma carteira tipo 'dinheiro')", async () => {
    const { limpar } = await prepararComCarteiraBeneficioAtiva();
    try {
      globalThis.confirm = () => true;

      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      const { filtrarGastosPrincipais, obterCarteiraPorId } = await import("../src/js/carteiras.js");
      await iniciarPaginaGastos();
      await iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      preencher(document.getElementById("campo-titulo-parcelamento"), "Geladeira");
      preencher(document.getElementById("campo-quantidade-parcelamento"), "4");
      preencher(document.getElementById("campo-valor-parcelamento"), "300");
      preencher(document.getElementById("campo-data-parcelamento"), "2027-02-10");

      clicar(document.getElementById("formulario-parcelamento").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos().filter((g) => g.titulo === "Geladeira").length === 4);

      const parcelas = obterGastos().filter((g) => g.titulo === "Geladeira");
      assert.equal(parcelas.length, 4);
      const carteira = obterCarteiraPorId(parcelas[0].carteiraId);
      assert.equal(carteira?.tipo, "dinheiro");

      const gastosPrincipais = filtrarGastosPrincipais(obterGastos());
      assert.equal(gastosPrincipais.filter((g) => g.titulo === "Geladeira").length, 4, "parcelas na carteira principal continuam no financeiro principal");
    } finally {
      await limpar();
    }
  });
});

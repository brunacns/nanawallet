// Etapa de refinamento visual/UX (2026-08-13): os formulários de gasto,
// ganho e parcelamento reordenaram os campos por prioridade (valor,
// descrição, data, categoria primeiro) e moveram os campos administrativos
// (carteira, salário responsável, recorrência, observações) para dentro de
// um <details class="divulgacao"> "Mais opções" — sem JavaScript novo de
// abrir/fechar (é nativo do HTML). Cada módulo só decide o ESTADO inicial:
// fechado ao criar um item novo (formulário simples), aberto ao editar um
// item que já pode estar usando esses campos (nada fica escondido sem querer).
// Estes testes cobrem esse comportamento nos 3 formulários, e a nova
// apresentação do valor desejado no cartão de meta (wishlist).
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

describe("Formulário de gasto: 'Mais opções' começa fechado ao criar, aberto ao editar", () => {
  test("novo gasto: <details> fechado; editar um gasto: <details> aberto", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();

      clicar(document.getElementById("botao-novo-gasto"));
      const detalhes = document.getElementById("gasto-mais-opcoes");
      assert.equal(detalhes.open, false, "deveria começar fechado num gasto novo");

      preencher(document.getElementById("campo-titulo-gasto"), "Mercado");
      preencher(document.getElementById("campo-valor-gasto"), "120");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-gasto"), hoje);
      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGastos().length === 1);

      const id = obterGastos()[0].id;
      clicar(document.querySelector(`tr[data-id="${id}"] [data-acao="editar"]`));
      assert.equal(document.getElementById("gasto-mais-opcoes").open, true, "deveria abrir sozinho ao editar");
    } finally {
      await limpar();
    }
  });
});

describe("Formulário de ganho: mesmo comportamento de 'Mais opções'", () => {
  test("novo ganho: <details> fechado; editar um ganho: <details> aberto", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGanhos, obterGanhos } = await import("../src/js/modulos/ganhos.js");
      await iniciarPaginaGanhos();

      clicar(document.getElementById("botao-novo-ganho"));
      assert.equal(document.getElementById("ganho-mais-opcoes").open, false);

      preencher(document.getElementById("campo-titulo-ganho"), "Freela");
      preencher(document.getElementById("campo-valor-ganho"), "500");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-ganho"), hoje);
      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGanhos().length === 1);

      const id = obterGanhos()[0].id;
      clicar(document.querySelector(`[data-id="${id}"] [data-acao="editar"]`));
      assert.equal(document.getElementById("ganho-mais-opcoes").open, true);
    } finally {
      await limpar();
    }
  });

  test("campos essenciais continuam salvando corretamente mesmo com 'Mais opções' fechado (valor não fica preso num campo escondido)", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGanhos, obterGanhos } = await import("../src/js/modulos/ganhos.js");
      await iniciarPaginaGanhos();

      clicar(document.getElementById("botao-novo-ganho"));
      assert.equal(document.getElementById("ganho-mais-opcoes").open, false);
      preencher(document.getElementById("campo-titulo-ganho"), "Salário");
      preencher(document.getElementById("campo-valor-ganho"), "3000");
      preencher(document.getElementById("campo-data-ganho"), "2027-07-15");
      // O campo "Ganho fixo" está dentro do <details> fechado — mesmo assim
      // precisa continuar gravável via JS (o navegador não impede leitura de
      // valor de um campo dentro de um <details> fechado, só a exibição).
      document.getElementById("campo-fixo-ganho").checked = true;
      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));
      await esperarAte(() => obterGanhos().length === 1);

      assert.equal(obterGanhos()[0].valor, 3000);
      assert.equal(obterGanhos()[0].fixo, true, "campo dentro do <details> fechado deveria salvar normalmente");
    } finally {
      await limpar();
    }
  });
});

describe("Formulário de parcelamento: 'Mais opções' começa sempre fechado", () => {
  test("abrir o modal de novo parcelamento começa com <details> fechado", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarParcelamentos } = await import("../src/js/modulos/parcelamentos.js");
      iniciarParcelamentos();

      clicar(document.getElementById("botao-novo-parcelamento"));
      assert.equal(document.getElementById("parcelamento-mais-opcoes").open, false);
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist (Metas): valor desejado como etiqueta de preço", () => {
  test("o cartão de meta mostra rótulo + número separados (não mais uma linha de texto corrida)", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Viagem para a praia");
      preencher(document.getElementById("campo-valor-desejado-meta"), "2500");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.querySelector(".cartao-meta"));

      const cartao = document.querySelector(".cartao-meta");
      const rotulo = cartao.querySelector(".cartao-meta__valor-rotulo");
      const numero = cartao.querySelector(".cartao-meta__valor-numero");
      assert.ok(rotulo, "esperava um .cartao-meta__valor-rotulo");
      assert.ok(numero, "esperava um .cartao-meta__valor-numero");
      assert.equal(rotulo.textContent.trim(), "Valor desejado");
      assert.match(numero.textContent, /2\.500,00/);
    } finally {
      await limpar();
    }
  });
});

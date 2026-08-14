// Etapa de refinamento visual/UX (2026-08-13): a caixa de marcar/desmarcar
// pago/recebido/concluído (`.caixa-toggle`) é um <div>, não um <input>, e não
// tinha nenhum atributo de acessibilidade nem manipulador de teclado — só
// respondia a clique de mouse, tornando essa ação impossível de realizar
// navegando só com o teclado (ou com leitor de tela). Corrigido em
// gastos.js/ganhos.js/lembretes.js: role="checkbox" + tabindex="0" +
// aria-checked + um handler de "keydown" para Enter/Espaço ao lado do de
// "click" já existente. Estes testes cobrem os 3 módulos.
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

function pressionar(elemento, tecla) {
  const evento = new globalThis.window.KeyboardEvent("keydown", { key: tecla, bubbles: true, cancelable: true });
  elemento.dispatchEvent(evento);
  return evento;
}

describe("Caixa de marcar/desmarcar é acessível por teclado", () => {
  test("Lembretes: a caixa tem role=checkbox/tabindex/aria-checked, e Enter alterna 'concluído'", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaLembretes, obterLembretes } = await import("../src/js/modulos/lembretes.js");
      await iniciarPaginaLembretes();

      clicar(document.getElementById("botao-novo-lembrete"));
      preencher(document.getElementById("campo-titulo-lembrete"), "Consulta médica");
      preencher(document.getElementById("campo-valor-lembrete"), "200");
      preencher(document.getElementById("campo-data-lembrete"), "2027-06-10");
      clicar(document.getElementById("formulario-lembrete").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-lembrete").hidden);
      await esperarAte(() => obterLembretes().length === 1);

      const caixa = document.querySelector('#lembretes-conteudo [data-acao="alternar"]');
      assert.equal(caixa.getAttribute("role"), "checkbox");
      assert.equal(caixa.getAttribute("tabindex"), "0");
      assert.equal(caixa.getAttribute("aria-checked"), "false");
      assert.equal(caixa.classList.contains("marcada"), false);

      const seletorCaixa = () => document.querySelector('#lembretes-conteudo [data-acao="alternar"]');

      const evento = pressionar(caixa, "Enter");
      assert.equal(evento.defaultPrevented, true, "Enter na caixa deve ser tratado (não rolar a página nem submeter nada)");
      // Espera o DOM re-renderizado (não só o dado em memória, que muda de
      // forma síncrona ANTES do salvamento assíncrono terminar — checar só o
      // dado daria um falso positivo antes da tela realmente atualizar).
      await esperarAte(() => seletorCaixa().getAttribute("aria-checked") === "true", { mensagem: "lembrete marcar como concluído após Enter" });

      const caixaAtualizada = seletorCaixa();
      assert.equal(caixaAtualizada.classList.contains("marcada"), true);
      assert.equal(obterLembretes()[0].concluido, true);

      const eventoEspaco = pressionar(caixaAtualizada, " ");
      assert.equal(eventoEspaco.defaultPrevented, true);
      await esperarAte(() => seletorCaixa().getAttribute("aria-checked") === "false", { mensagem: "lembrete desmarcar após Espaço" });
      const caixaFinal = seletorCaixa();
      assert.equal(caixaFinal.classList.contains("marcada"), false);
      assert.equal(obterLembretes()[0].concluido, false);

      // Uma tecla qualquer não deve mexer no estado nem ser interceptada.
      const eventoOutraTecla = pressionar(caixaFinal, "a");
      assert.equal(eventoOutraTecla.defaultPrevented, false);
      assert.equal(obterLembretes()[0].concluido, false);
    } finally {
      await limpar();
    }
  });

  test("Gastos: Enter na caixa de 'pago' alterna o status sem precisar de mouse", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGastos, obterGastos } = await import("../src/js/modulos/gastos.js");
      await iniciarPaginaGastos();

      clicar(document.getElementById("botao-novo-gasto"));
      preencher(document.getElementById("campo-titulo-gasto"), "Mercado");
      preencher(document.getElementById("campo-valor-gasto"), "150");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-gasto"), hoje);
      clicar(document.getElementById("formulario-gasto").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-gasto").hidden);
      await esperarAte(() => obterGastos().length === 1);

      const caixa = document.querySelector('#gastos-corpo-tabela [data-acao="alternar-pago"]');
      assert.equal(caixa.getAttribute("role"), "checkbox");
      assert.equal(caixa.getAttribute("aria-checked"), "false");

      pressionar(caixa, " ");
      await esperarAte(
        () => document.querySelector('#gastos-corpo-tabela [data-acao="alternar-pago"]').getAttribute("aria-checked") === "true"
      );
      assert.equal(obterGastos()[0].pago, true);
    } finally {
      await limpar();
    }
  });

  test("Ganhos: Enter na caixa de 'recebido' alterna o status sem precisar de mouse", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaGanhos, obterGanhos } = await import("../src/js/modulos/ganhos.js");
      await iniciarPaginaGanhos();

      clicar(document.getElementById("botao-novo-ganho"));
      preencher(document.getElementById("campo-titulo-ganho"), "Freela");
      preencher(document.getElementById("campo-valor-ganho"), "300");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-ganho"), hoje);
      clicar(document.getElementById("formulario-ganho").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-ganho").hidden);
      await esperarAte(() => obterGanhos().length === 1);

      const caixa = document.querySelector('#ganhos-conteudo [data-acao="alternar-recebido"]');
      assert.equal(caixa.getAttribute("role"), "checkbox");
      assert.equal(caixa.getAttribute("aria-checked"), "false");

      pressionar(caixa, "Enter");
      await esperarAte(
        () => document.querySelector('#ganhos-conteudo [data-acao="alternar-recebido"]').getAttribute("aria-checked") === "true"
      );
      assert.equal(obterGanhos()[0].recebido, true);
    } finally {
      await limpar();
    }
  });
});

describe("Tabelas longas rolam horizontalmente em vez de estourar a página", () => {
  test("as tabelas de Gastos, Histórico e Ticket Alimentação estão dentro de um wrapper .tabela-scroll", () => {
    montarDom();
    const ids = ["gastos-corpo-tabela", "historico-corpo-tabela", "ticket-corpo-tabela"];
    for (const id of ids) {
      const tbody = document.getElementById(id);
      const wrapper = tbody.closest(".tabela-scroll");
      assert.ok(wrapper, `#${id} deveria estar dentro de um .tabela-scroll`);
    }
  });
});

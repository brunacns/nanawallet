// Etapa de refinamento visual/UX (2026-08-13): reorganização visual do
// Dashboard — "Saldo restante" (o número que responde "quanto ainda posso
// gastar") ganhou destaque (.cartao-estatistica--destaque) em relação a
// Total recebido/Total gasto, e os 4 números de detalhe (saldo por dia de
// pagamento, previsão futura, reservado para lembretes) viraram um grupo
// visualmente mais leve (.cartao-estatistica--compacta) sob o rótulo
// "Detalhamento do mês". Nenhuma fórmula financeira mudou — só a
// apresentação. Estes testes cobrem: (1) a estrutura estática do HTML, e (2)
// que a classe de destaque convive com as classes de alerta (amarelo/
// laranja/vermelho) que dashboard.js já aplicava antes desta etapa, em vez
// de uma sobrescrever a outra.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, preencher, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

describe("Dashboard: hierarquia visual dos cartões de estatística", () => {
  test("Saldo restante tem a classe de destaque; os 4 cartões de detalhe têm a classe compacta", () => {
    montarDom();
    const saldoRestante = document.getElementById("dash-cartao-saldo-restante");
    assert.ok(saldoRestante.classList.contains("cartao-estatistica--destaque"));

    const idsDetalhe = ["dash-cartao-saldo-dia15", "dash-cartao-saldo-dia30", "dash-cartao-saldo-previsto"];
    for (const id of idsDetalhe) {
      const cartao = document.getElementById(id);
      assert.ok(cartao.classList.contains("cartao-estatistica--compacta"), `${id} deveria ter a classe compacta`);
      assert.equal(cartao.classList.contains("cartao-estatistica--destaque"), false);
    }

    // "Reservado para lembretes" não tem id no wrapper — localizado pelo
    // valor que ele contém.
    const reservado = document.getElementById("dash-reservado-lembretes").closest(".cartao-estatistica");
    assert.ok(reservado.classList.contains("cartao-estatistica--compacta"));

    // Total recebido/gasto continuam no grupo principal, sem nenhuma das
    // duas variantes (são secundários ao "Saldo restante", mas não fazem
    // parte do "Detalhamento").
    const totalRecebido = document.getElementById("dash-total-recebido").closest(".cartao-estatistica");
    assert.equal(totalRecebido.classList.contains("cartao-estatistica--destaque"), false);
    assert.equal(totalRecebido.classList.contains("cartao-estatistica--compacta"), false);
  });

  test("o rótulo 'Detalhamento do mês' existe e vem depois do grupo principal, antes do grupo compacto", () => {
    montarDom();
    const rotulo = [...document.querySelectorAll(".rotulo-secao")].find((el) => el.textContent.trim() === "Detalhamento do mês");
    assert.ok(rotulo, "rótulo 'Detalhamento do mês' não encontrado");

    const grupoPrincipal = document.getElementById("dash-cartao-saldo-restante").closest(".grade-estatisticas");
    const grupoDetalhe = document.getElementById("dash-cartao-saldo-dia15").closest(".grade-estatisticas");
    assert.notEqual(grupoPrincipal, grupoDetalhe, "os dois grupos devem ser grades separadas");

    const posicao = grupoPrincipal.compareDocumentPosition(rotulo);
    assert.ok(posicao & Node.DOCUMENT_POSITION_FOLLOWING, "o rótulo deve vir depois do grupo principal");
    const posicaoDetalhe = rotulo.compareDocumentPosition(grupoDetalhe);
    assert.ok(posicaoDetalhe & Node.DOCUMENT_POSITION_FOLLOWING, "o grupo de detalhe deve vir depois do rótulo");
  });

  test("saldo restante negativo aplica a classe de alerta JUNTO com a de destaque (uma não substitui a outra)", async () => {
    montarDom();
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();
      const { iniciarPaginaGastos } = await import("../src/js/modulos/gastos.js");
      const { iniciarDashboard } = await import("../src/js/modulos/dashboard.js");
      await iniciarPaginaGastos();
      iniciarDashboard();

      const cartao = document.getElementById("dash-cartao-saldo-restante");
      // Sem nenhum ganho cadastrado, um gasto qualquer já deixa o saldo
      // negativo (0 - valor do gasto).
      document.getElementById("botao-novo-gasto").click();
      preencher(document.getElementById("campo-titulo-gasto"), "Mercado");
      preencher(document.getElementById("campo-valor-gasto"), "150");
      const hoje = new Date().toISOString().slice(0, 10);
      preencher(document.getElementById("campo-data-gasto"), hoje);
      document.getElementById("formulario-gasto").querySelector('button[type="submit"]').click();

      await esperarAte(() => cartao.classList.contains("cartao-estatistica--vermelho"), {
        mensagem: "cartão de saldo restante ficar vermelho após o gasto",
      });
      assert.ok(cartao.classList.contains("cartao-estatistica--destaque"), "a classe de destaque não deveria sumir junto com a de alerta");
      assert.equal(document.getElementById("dash-saldo-restante-alerta").hidden, false);
    } finally {
      await limpar();
    }
  });
});

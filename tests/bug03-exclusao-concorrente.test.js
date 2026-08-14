// BUG-03 (Médio, auditoria 2026-08-09): excluir dois itens fixos/parcelados
// em sequência rápida (chamar `perguntarEscopoExclusao` uma segunda vez antes
// da primeira Promise ser resolvida) deixava a exclusão do PRIMEIRO item
// pendurada para sempre — a Promise nunca resolvia nem rejeitava, porque
// `resolverAtual` (uma única variável de módulo) era sobrescrita pela segunda
// chamada.
//
// Comportamento esperado depois da correção: abrir um segundo modal de
// escopo resolve automaticamente o pedido anterior pendente com `null`
// (mesmo resultado que cancelar produzia) — nenhuma exclusão fica "perdida"
// em silêncio.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar } from "./helpers/appDom.js";

// Timeout curto: se a promise não resolver sozinha, isso prova que o bug
// original (promise pendurada para sempre) voltou.
function comTimeout(promise, ms, mensagem) {
  let idTimeout;
  const timeout = new Promise((_resolve, reject) => {
    idTimeout = setTimeout(() => reject(new Error(mensagem)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(idTimeout));
}

describe("BUG-03 — perguntarEscopoExclusao não pode deixar uma chamada anterior pendurada", () => {
  let perguntarEscopoExclusao;

  before(async () => {
    montarDom();
    const modulo = await import("../src/js/confirmacaoExclusao.js");
    modulo.iniciarConfirmacaoExclusao();
    perguntarEscopoExclusao = modulo.perguntarEscopoExclusao;
  });

  test("reprodução exata do bug: 2 chamadas rápidas (item A, depois item B, sem responder) — a promise do item A precisa resolver", async () => {
    const promiseItemA = perguntarEscopoExclusao({ titulo: "Aluguel", tipo: "fixo" });
    // Sem esperar/responder o modal do item A, chega um segundo pedido
    // (usuária clicando "excluir" em outro gasto fixo rapidamente).
    const promiseItemB = perguntarEscopoExclusao({ titulo: "Internet", tipo: "fixo" });

    // Antes da correção, este await nunca retornava (timeout estourava).
    const resultadoItemA = await comTimeout(promiseItemA, 1000, "BUG-03 voltou: a promise do primeiro pedido de exclusão ficou pendurada");
    assert.equal(resultadoItemA, null, "o primeiro pedido, substituído pelo segundo, deve resolver como cancelado (null)");

    // O modal agora visível é o do item B — responder normalmente.
    assert.equal(document.getElementById("escopo-exclusao-titulo").textContent, 'Excluir "Internet"');
    document.querySelector('input[name="escopo-exclusao"][value="todas"]').checked = true;
    clicar(document.getElementById("botao-confirmar-escopo-exclusao"));

    const resultadoItemB = await comTimeout(promiseItemB, 1000, "a promise do segundo pedido também não resolveu");
    assert.equal(resultadoItemB, "todas");
  });

  test("3 chamadas em sequência rápida: só a última fica de pé, as 2 anteriores resolvem como canceladas", async () => {
    const p1 = perguntarEscopoExclusao({ titulo: "Um", tipo: "fixo" });
    const p2 = perguntarEscopoExclusao({ titulo: "Dois", tipo: "fixo" });
    const p3 = perguntarEscopoExclusao({ titulo: "Três", tipo: "parcela" });

    const [r1, r2] = await Promise.all([
      comTimeout(p1, 1000, "1º pedido pendurado"),
      comTimeout(p2, 1000, "2º pedido pendurado"),
    ]);
    assert.equal(r1, null);
    assert.equal(r2, null);

    assert.equal(document.getElementById("escopo-exclusao-titulo").textContent, 'Excluir "Três"');
    clicar(document.getElementById("botao-cancelar-escopo-exclusao"));
    const r3 = await comTimeout(p3, 1000, "3º pedido (o único modal de fato aberto) não resolveu ao cancelar");
    assert.equal(r3, null);
  });

  test("caminho feliz (sem concorrência) continua funcionando: escolher uma opção resolve com o valor escolhido", async () => {
    const promise = perguntarEscopoExclusao({ titulo: "Streaming", tipo: "fixo" });
    document.querySelector('input[name="escopo-exclusao"][value="somente"]').checked = true;
    clicar(document.getElementById("botao-confirmar-escopo-exclusao"));
    assert.equal(await comTimeout(promise, 1000, "caminho feliz não resolveu"), "somente");
  });

  test("caminho feliz: fechar o modal pelo X cancela (resolve null), sem pendurar nada para a próxima chamada", async () => {
    const promise = perguntarEscopoExclusao({ titulo: "Academia", tipo: "fixo" });
    clicar(document.getElementById("botao-fechar-escopo-exclusao"));
    assert.equal(await comTimeout(promise, 1000, "fechar pelo X não resolveu"), null);

    // Depois de cancelar corretamente, uma nova chamada não deve ser afetada
    // por nenhum estado deixado para trás.
    const proxima = perguntarEscopoExclusao({ titulo: "Seguro", tipo: "fixo" });
    document.querySelector('input[name="escopo-exclusao"][value="futuras"]').checked = true;
    clicar(document.getElementById("botao-confirmar-escopo-exclusao"));
    assert.equal(await comTimeout(proxima, 1000, "chamada seguinte não resolveu"), "futuras");
  });
});

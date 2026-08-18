// BUG-07 (Baixo, auditoria 2026-08-09): "Apagar todos os dados", exportar,
// restaurar e fazer backup manual podiam levar vários segundos com uma base
// de dados grande, sem NENHUM indício visual de que algo estava acontecendo
// — o botão continuava clicável, sem spinner nem texto de "processando".
//
// Para observar o estado "no meio da operação" sem depender de um volume
// grande de dados real (lento e não-determinístico), o teste injeta um
// atraso controlado no mock de `fs.writeTextFile` só para este arquivo, e
// verifica o estado do botão ENQUANTO a Promise ainda está pendente.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";

function atrasar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("BUG-07 — botões de operações longas mostram estado de carregamento", () => {
  test("'Apagar todos os dados' desabilita o botão e muda o texto enquanto a operação está em andamento", async () => {
    montarDom();
    globalThis.confirm = () => true; // as 2 confirmações de "apagar tudo"
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();

      // Atraso artificial só na escrita de arquivo, para dar tempo do teste
      // observar o estado "em andamento" antes da operação terminar.
      const escritaOriginal = globalThis.window.__TAURI__.fs.writeTextFile;
      globalThis.window.__TAURI__.fs.writeTextFile = async (...args) => {
        await atrasar(150);
        return escritaOriginal(...args);
      };

      const { iniciarExportacao } = await import("../src/js/modulos/exportacao.js");
      await iniciarExportacao();

      const botao = document.getElementById("botao-apagar-tudo");
      const textoOriginal = botao.textContent;
      assert.equal(botao.disabled, false);

      clicar(botao);

      // Ainda DENTRO da operação (antes dos 150ms de atraso terminarem).
      await atrasar(20);
      assert.equal(botao.disabled, true, "o botão precisa ficar desabilitado durante a operação");
      assert.notEqual(botao.textContent, textoOriginal, "o texto do botão precisa mudar para indicar que está processando");

      await esperarAte(() => botao.disabled === false, { timeoutMs: 3000, mensagem: "botão voltar a ficar habilitado após 'apagar tudo' terminar" });
      assert.equal(botao.textContent, textoOriginal, "o texto original deve voltar depois de terminar");
    } finally {
      await limpar();
    }
  });
});

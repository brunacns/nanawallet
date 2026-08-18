// Exportação/backup em arquivo são exclusivos do Desktop (Fase 10 da
// migração para Supabase) — sem window.__TAURI__ (ambiente Web), os botões
// de arquivo devem ficar desabilitados com uma explicação, mas "Apagar
// todos os dados" (não depende de arquivo, só fala com o Supabase) continua
// funcionando. Diferente dos outros testes deste arquivo de tela, este NÃO
// chama criarAmbienteTauri() de propósito — é exatamente o cenário que
// queremos comprovar (window.__TAURI__ ausente).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom } from "./helpers/appDom.js";

describe("Exportação — modo Web (sem window.__TAURI__)", () => {
  test("botões de arquivo ficam desabilitados com explicação; 'Apagar todos os dados' continua habilitado", async () => {
    montarDom();
    assert.equal(typeof window.__TAURI__, "undefined", "pré-condição: este teste não deve ter o mock do Tauri");

    const { iniciarExportacao } = await import("../src/js/modulos/exportacao.js");
    await iniciarExportacao();

    for (const id of ["botao-exportar-json", "botao-exportar-texto", "botao-backup-manual", "botao-restaurar-arquivo"]) {
      const botao = document.getElementById(id);
      assert.equal(botao.disabled, true, `${id} deveria estar desabilitado sem Tauri`);
      assert.match(botao.title, /Desktop/, `${id} deveria explicar que é só Desktop`);
    }

    assert.equal(document.getElementById("botao-apagar-tudo").disabled, false, "'Apagar todos os dados' não depende de arquivo, deve continuar habilitado");
  });
});

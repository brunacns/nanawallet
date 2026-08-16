// Portão de autenticação (Fase 10, passo 2) — ainda não ligado a main.js,
// mas já testável isoladamente via jsdom + mock de fetch, mesmo padrão dos
// outros testes de tela deste projeto (appDom.js monta o próprio
// src/index.html real).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar, preencher, proximoTick } from "./helpers/appDom.js";
import { iniciarTelaLogin, exibirPortao, esconderPortao } from "../src/js/auth/telaLogin.js";
import { limparSessao } from "../src/js/supabase/sessao.js";

describe("Portão de autenticação — modos e navegação", () => {
  beforeEach(() => {
    const dom = montarDom();
    globalThis.localStorage = dom.window.localStorage;
    limparSessao();
  });
  afterEach(() => {
    delete globalThis.fetch;
  });

  test("começa escondido; exibirPortao/esconderPortao alternam o atributo hidden", () => {
    iniciarTelaLogin({});
    const portao = document.getElementById("portao-autenticacao");
    assert.equal(portao.hidden, true);
    exibirPortao();
    assert.equal(portao.hidden, false);
    esconderPortao();
    assert.equal(portao.hidden, true);
  });

  test("modo padrão é 'entrar': título, botão e campo de senha visíveis", () => {
    iniciarTelaLogin({});
    assert.equal(document.getElementById("autenticacao-titulo").textContent, "Entrar no NanaWallet");
    assert.equal(document.getElementById("botao-enviar-autenticacao").textContent, "Entrar");
    assert.equal(document.getElementById("grupo-senha-autenticacao").hidden, false);
    assert.equal(document.getElementById("botao-esqueci-senha").hidden, false);
  });

  test("não existe botão de criar conta — app pessoal, sem autocadastro", () => {
    iniciarTelaLogin({});
    assert.equal(document.getElementById("botao-alternar-modo-autenticacao"), null);
  });

  test("clicar em 'Esqueci minha senha' esconde o campo de senha e o próprio link", () => {
    iniciarTelaLogin({});
    clicar(document.getElementById("botao-esqueci-senha"));

    assert.equal(document.getElementById("autenticacao-titulo").textContent, "Recuperar senha");
    assert.equal(document.getElementById("grupo-senha-autenticacao").hidden, true);
    assert.equal(document.getElementById("botao-esqueci-senha").hidden, true);
  });

  test("login bem-sucedido chama aoAutenticar com o usuário e limpa a mensagem", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: "u1", email: "a@a.com" } }),
    });
    let usuarioRecebido = null;
    iniciarTelaLogin({ aoAutenticar: (u) => (usuarioRecebido = u) });

    preencher(document.getElementById("campo-email-autenticacao"), "a@a.com");
    preencher(document.getElementById("campo-senha-autenticacao"), "123456");
    clicar(document.getElementById("botao-enviar-autenticacao"));
    await proximoTick(5);

    assert.deepEqual(usuarioRecebido, { id: "u1", email: "a@a.com" });
    assert.equal(document.getElementById("mensagem-autenticacao").hidden, true);
  });

  test("erro de login mostra mensagem amigável e reabilita o botão (não trava o formulário)", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }),
    });
    iniciarTelaLogin({});

    preencher(document.getElementById("campo-email-autenticacao"), "a@a.com");
    preencher(document.getElementById("campo-senha-autenticacao"), "errada");
    clicar(document.getElementById("botao-enviar-autenticacao"));
    await proximoTick(5);

    const mensagem = document.getElementById("mensagem-autenticacao");
    assert.equal(mensagem.hidden, false);
    assert.equal(mensagem.textContent, "E-mail ou senha incorretos.");
    assert.equal(mensagem.className, "autenticacao__mensagem autenticacao__mensagem--erro");
    assert.equal(document.getElementById("botao-enviar-autenticacao").disabled, false);
    assert.equal(document.getElementById("botao-enviar-autenticacao").textContent, "Entrar");
  });

  test("recuperar senha bem-sucedida mostra mensagem de sucesso e volta pro modo entrar", async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "" });
    iniciarTelaLogin({});

    clicar(document.getElementById("botao-esqueci-senha"));
    preencher(document.getElementById("campo-email-autenticacao"), "a@a.com");
    clicar(document.getElementById("botao-enviar-autenticacao"));
    await proximoTick(5);

    assert.equal(document.getElementById("autenticacao-titulo").textContent, "Entrar no NanaWallet");
    const mensagem = document.getElementById("mensagem-autenticacao");
    assert.equal(mensagem.hidden, false);
    assert.match(mensagem.textContent, /instruções de recuperação/);
  });
});

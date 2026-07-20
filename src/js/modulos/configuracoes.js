import { formatarData, formatarDataHora } from "../utils/formatadores.js";
import { sincronizacaoService } from "../servicos/index.js";

// Página Configurações: informações de versão/build (lidas automaticamente)
// e a seção de sincronização com a nuvem (login, status, controles).
export async function iniciarPaginaConfiguracoes() {
  await preencherInformacoesDeVersao();
  configurarSincronizacao();
}

async function preencherInformacoesDeVersao() {
  const versaoEl = document.getElementById("config-versao");
  const dataBuildEl = document.getElementById("config-data-build");
  const ultimaAtualizacaoEl = document.getElementById("config-ultima-atualizacao");

  try {
    const { app } = window.__TAURI__;
    versaoEl.textContent = await app.getVersion();
  } catch (erro) {
    versaoEl.textContent = "—";
    console.error("Não foi possível obter a versão do app:", erro);
  }

  try {
    const resposta = await fetch("./js/build-info.json");
    const info = await resposta.json();
    dataBuildEl.textContent = formatarDataHora(info.dataBuild);
    // "Última atualização" é a mesma data da build, em formato mais simples —
    // o app não tem um atualizador automático, então a build instalada É a
    // última atualização.
    ultimaAtualizacaoEl.textContent = formatarData(info.dataBuild.slice(0, 10));
  } catch (erro) {
    dataBuildEl.textContent = "—";
    ultimaAtualizacaoEl.textContent = "—";
    console.error("Não foi possível ler build-info.json:", erro);
  }
}

// ==================== Sincronização com a nuvem ====================

function configurarSincronizacao() {
  document.getElementById("formulario-login-sincronizacao").addEventListener("submit", tratarEntrar);
  document.getElementById("botao-cadastrar-sincronizacao").addEventListener("click", tratarCadastrar);
  document.getElementById("botao-sincronizar-agora").addEventListener("click", () => sincronizacaoService.sincronizarAgora());
  document.getElementById("botao-sair-sincronizacao").addEventListener("click", () => sincronizacaoService.sair());
  document.getElementById("campo-automatica-sincronizacao").addEventListener("change", tratarAlternarAutomatica);

  sincronizacaoService.aoAtualizarEstado(renderizarSincronizacao);
  renderizarSincronizacao(sincronizacaoService.obterEstado());
}

function renderizarSincronizacao(estado) {
  document.getElementById("formulario-login-sincronizacao").hidden = estado.conectada;
  document.getElementById("painel-sincronizacao-conectada").hidden = !estado.conectada;

  const statusEl = document.getElementById("sincronizacao-status");
  if (estado.ultimoErro) {
    statusEl.textContent = `Não foi possível sincronizar: ${estado.ultimoErro}`;
    statusEl.style.color = "var(--cor-negativo)";
    statusEl.hidden = false;
  } else if (!estado.conectada) {
    statusEl.hidden = true;
  }

  if (!estado.conectada) return;

  document.getElementById("sincronizacao-email").textContent = estado.email || "—";
  document.getElementById("sincronizacao-ultima").textContent = estado.ultimaSincronizacao
    ? formatarDataHora(estado.ultimaSincronizacao)
    : "Nunca";
  document.getElementById("sincronizacao-fila").textContent = String(estado.tamanhoFila);
  document.getElementById("campo-automatica-sincronizacao").checked = estado.automatica;

  const botao = document.getElementById("botao-sincronizar-agora");
  botao.disabled = estado.sincronizando;
  botao.textContent = estado.sincronizando ? "Sincronizando…" : "Sincronizar agora";

  if (!estado.ultimoErro && !estado.sincronizando) {
    statusEl.hidden = true;
  }
}

function mostrarStatusSincronizacao(texto, ehErro = false) {
  const el = document.getElementById("sincronizacao-status");
  el.textContent = texto;
  el.style.color = ehErro ? "var(--cor-negativo)" : "var(--cor-positivo)";
  el.hidden = false;
}

async function tratarEntrar(evento) {
  evento.preventDefault();
  const email = document.getElementById("campo-email-sincronizacao").value.trim();
  const senha = document.getElementById("campo-senha-sincronizacao").value;
  if (!email || !senha) return;

  try {
    await sincronizacaoService.entrar(email, senha);
    mostrarStatusSincronizacao("Conectada com sucesso.");
  } catch (erro) {
    mostrarStatusSincronizacao("Não foi possível entrar. Confira o e-mail e a senha.", true);
    console.error(erro);
  }
}

async function tratarCadastrar() {
  const email = document.getElementById("campo-email-sincronizacao").value.trim();
  const senha = document.getElementById("campo-senha-sincronizacao").value;
  if (!email || !senha) {
    mostrarStatusSincronizacao("Preencha e-mail e senha para criar a conta.", true);
    return;
  }

  try {
    const { precisaConfirmarEmail } = await sincronizacaoService.cadastrar(email, senha);
    mostrarStatusSincronizacao(
      precisaConfirmarEmail ? "Conta criada! Confira seu e-mail para confirmar antes de entrar." : "Conta criada e conectada com sucesso."
    );
  } catch (erro) {
    mostrarStatusSincronizacao("Não foi possível criar a conta.", true);
    console.error(erro);
  }
}

function tratarAlternarAutomatica(evento) {
  if (evento.target.checked) sincronizacaoService.ativarAutomatica();
  else sincronizacaoService.desativarAutomatica();
}

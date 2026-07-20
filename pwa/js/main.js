// Entrypoint da PWA — separado de src/js/main.js (o do app Tauri) porque as
// páginas mostradas são diferentes (sem Exportação/Configurações, que são
// específicas de arquivo local/diálogos nativos) e porque aqui existe um
// portão de login obrigatório (a PWA não tem armazenamento local: sem
// conta conectada, não há nenhum dado pra mostrar).
//
// Todos os módulos de página importados abaixo são os MESMOS do app Tauri,
// sem nenhuma cópia — eles só dependem dos serviços de domínio
// (TransactionService/ReminderService/GoalService), nunca do Tauri
// diretamente, então funcionam aqui sem alteração nenhuma. Quem muda de
// comportamento sozinho é `armazenamentoAtivo` (importado de
// src/js/servicos/index.js): como `window.__TAURI__` não existe num
// navegador comum, esse arquivo escolhe `ArmazenamentoSupabaseService` em
// vez de `ArmazenamentoLocalService` — ver os comentários lá.
import { armazenamentoAtivo } from "../../src/js/servicos/index.js";
import { configurarNavegacao } from "../../src/js/navegacao.js";
import { iniciarPaginaGanhos, recarregarGanhos } from "../../src/js/modulos/ganhos.js";
import { iniciarPaginaGastos, recarregarGastos } from "../../src/js/modulos/gastos.js";
import { iniciarParcelamentos } from "../../src/js/modulos/parcelamentos.js";
import { iniciarPaginaLembretes, recarregarLembretes } from "../../src/js/modulos/lembretes.js";
import { iniciarDashboard } from "../../src/js/modulos/dashboard.js";
import { iniciarGraficos } from "../../src/js/modulos/graficos.js";
import { iniciarHistorico } from "../../src/js/modulos/historico.js";
import { iniciarPaginaMetas, recarregarMetas } from "../../src/js/modulos/metas.js";

let appJaIniciado = false;

async function iniciar() {
  configurarNavegacao();
  document.getElementById("formulario-portao-login").addEventListener("submit", tratarEntrar);
  document.getElementById("botao-cadastrar-portao").addEventListener("click", tratarCadastrar);
  document.getElementById("botao-sair-portao").addEventListener("click", () => armazenamentoAtivo.sair());

  armazenamentoAtivo.aoAtualizarAutenticacao((autenticada) => {
    if (autenticada) mostrarApp();
    else mostrarPortaoLogin();
  });

  if (armazenamentoAtivo.estaAutenticada()) {
    await mostrarApp();
  }

  registrarServiceWorker();
}

function mostrarStatusPortao(texto, ehErro = false) {
  const el = document.getElementById("portao-login-status");
  el.textContent = texto;
  el.style.color = ehErro ? "var(--cor-negativo)" : "var(--cor-positivo)";
  el.hidden = false;
}

async function tratarEntrar(evento) {
  evento.preventDefault();
  const email = document.getElementById("campo-email-portao").value.trim();
  const senha = document.getElementById("campo-senha-portao").value;
  if (!email || !senha) return;

  try {
    await armazenamentoAtivo.entrar(email, senha);
  } catch (erro) {
    mostrarStatusPortao("Não foi possível entrar. Confira o e-mail e a senha.", true);
    console.error(erro);
  }
}

async function tratarCadastrar() {
  const email = document.getElementById("campo-email-portao").value.trim();
  const senha = document.getElementById("campo-senha-portao").value;
  if (!email || !senha) {
    mostrarStatusPortao("Preencha e-mail e senha para criar a conta.", true);
    return;
  }

  try {
    const { precisaConfirmarEmail } = await armazenamentoAtivo.cadastrar(email, senha);
    if (precisaConfirmarEmail) {
      mostrarStatusPortao("Conta criada! Confira seu e-mail para confirmar antes de entrar.");
    }
  } catch (erro) {
    mostrarStatusPortao("Não foi possível criar a conta. Tente novamente.", true);
    console.error(erro);
  }
}

async function mostrarApp() {
  document.getElementById("portao-login").hidden = true;
  document.getElementById("app-conteudo").hidden = false;
  document.getElementById("pwa-conta-email").textContent = armazenamentoAtivo.obterEmail() || "—";

  if (!appJaIniciado) {
    appJaIniciado = true;
    await armazenamentoAtivo.inicializar();
    await iniciarPaginaGanhos();
    await iniciarPaginaGastos();
    iniciarParcelamentos();
    await iniciarPaginaLembretes();
    iniciarDashboard();
    iniciarGraficos();
    iniciarHistorico();
    await iniciarPaginaMetas();
  } else {
    // Reconectou depois de um "Sair" — os módulos já têm os listeners
    // prontos, só precisa recarregar os dados da conta atual.
    await Promise.all([recarregarGanhos(), recarregarGastos(), recarregarLembretes(), recarregarMetas()]);
  }
}

function mostrarPortaoLogin() {
  document.getElementById("portao-login").hidden = false;
  document.getElementById("app-conteudo").hidden = true;
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch((erro) => console.error("Falha ao registrar o service worker:", erro));
}

window.addEventListener("DOMContentLoaded", iniciar);

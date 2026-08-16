// Portão de autenticação — um form só (#formulario-autenticacao) com 2 modos
// (entrar/recuperar senha), reaproveitando os mesmos campos de e-mail/senha
// em vez de formulários separados. Segue o mesmo padrão visual dos outros
// modais (.sobreposicao/.modal), mas sem botão de fechar — não é dispensável:
// sem sessão, não há o que mostrar por trás.
//
// De propósito, sem modo de cadastro: o NanaWallet é um app pessoal, de uso
// só da própria dona — a criação de conta pela interface foi removida a
// pedido explícito (ver AuthService.js, que também não exporta mais
// `cadastrar`). A conta já existe e é criada manualmente no painel do
// Supabase quando necessário, não por quem abrir a página publicamente.
import { entrar, recuperarSenha } from "./AuthService.js";
import { prenderFocoNoModal } from "../utils/focoModal.js";
import { avisarCampoInvalido, limparValidacao } from "../utils/validacaoFormulario.js";

const MODOS = {
  entrar: { titulo: "Entrar no NanaWallet", rotuloBotao: "Entrar", mostrarSenha: true },
  recuperar: { titulo: "Recuperar senha", rotuloBotao: "Enviar e-mail de recuperação", mostrarSenha: false },
};

/**
 * Liga os listeners do portão de autenticação. `aoAutenticar(usuario)` é
 * chamado assim que uma sessão válida é obtida (login) — quem chama
 * `iniciarTelaLogin` decide o que fazer depois disso (ex: esconder o portão
 * e inicializar o resto do app). Não faz nada sozinho além de ligar os
 * listeners — mostrar/esconder o portão é responsabilidade de
 * `exibirPortao`/`esconderPortao`, chamadas de fora (main.js).
 */
export function iniciarTelaLogin({ aoAutenticar } = {}) {
  const elPortao = document.getElementById("portao-autenticacao");
  if (!elPortao) return; // ambiente sem o portão no HTML (ex: alguns testes) — não quebra nada.

  const elForm = document.getElementById("formulario-autenticacao");
  const elEmail = document.getElementById("campo-email-autenticacao");
  const elSenha = document.getElementById("campo-senha-autenticacao");
  const elGrupoSenha = document.getElementById("grupo-senha-autenticacao");
  const elMensagem = document.getElementById("mensagem-autenticacao");
  const elTitulo = document.getElementById("autenticacao-titulo");
  const elBotaoEnviar = document.getElementById("botao-enviar-autenticacao");
  const elBotaoEsqueciSenha = document.getElementById("botao-esqueci-senha");

  prenderFocoNoModal(elPortao);

  let modoAtual = "entrar";

  function esconderMensagem() {
    elMensagem.hidden = true;
  }

  function mostrarMensagem(texto, tipo) {
    elMensagem.textContent = texto;
    elMensagem.className = `autenticacao__mensagem autenticacao__mensagem--${tipo}`;
    elMensagem.hidden = false;
  }

  function aplicarModo(modo) {
    modoAtual = modo;
    const def = MODOS[modo];
    elTitulo.textContent = def.titulo;
    elBotaoEnviar.textContent = def.rotuloBotao;
    elGrupoSenha.hidden = !def.mostrarSenha;
    elSenha.required = def.mostrarSenha;
    elBotaoEsqueciSenha.hidden = modo !== "entrar";
    esconderMensagem();
  }

  elBotaoEsqueciSenha.addEventListener("click", () => aplicarModo("recuperar"));

  elForm.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparValidacao(elEmail);
    limparValidacao(elSenha);

    const email = elEmail.value.trim();
    const senha = elSenha.value;
    if (!email) {
      avisarCampoInvalido(elEmail, "Digite seu e-mail.");
      return;
    }

    const rotuloOriginal = elBotaoEnviar.textContent;
    elBotaoEnviar.disabled = true;
    elBotaoEnviar.textContent = "Aguarde…";

    try {
      if (modoAtual === "entrar") {
        const usuario = await entrar(email, senha);
        esconderMensagem();
        aoAutenticar?.(usuario);
      } else {
        // recuperar
        await recuperarSenha(email, `${window.location.origin}${window.location.pathname}`);
        aplicarModo("entrar");
        mostrarMensagem("Enviamos um e-mail com as instruções de recuperação.", "sucesso");
      }
    } catch (erro) {
      mostrarMensagem(erro.message, "erro");
    } finally {
      elBotaoEnviar.disabled = false;
      elBotaoEnviar.textContent = rotuloOriginal;
    }
  });

  aplicarModo("entrar");
}

export function exibirPortao() {
  document.getElementById("portao-autenticacao")?.removeAttribute("hidden");
  document.getElementById("campo-email-autenticacao")?.focus();
}

export function esconderPortao() {
  document.getElementById("portao-autenticacao")?.setAttribute("hidden", "");
}

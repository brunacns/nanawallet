import { CONFIG } from "../config.js";
import { definirSessao, limparSessao, obterSessao } from "../supabase/sessao.js";

// Fala com o GoTrue (API de autenticação do Supabase) via fetch — mesma
// razão de sempre para não usar o SDK: este projeto não tem bundler para
// instalar @supabase/supabase-js como pacote npm.
//
// Renova o token automaticamente perto de expirar (mesma ideia já usada e
// documentada na tentativa de sincronização anterior, agora reaproveitada
// aqui) — sem isso, uma sessão aberta há mais de 1h (validade padrão do
// Supabase) pararia de funcionar sem avisar por quê.
const MARGEM_RENOVACAO_MS = 60_000;

const MENSAGENS_POR_CODIGO = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).",
  weak_password: "Senha muito fraca — use pelo menos 6 caracteres.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo — aguarde um momento e tente de novo.",
};

function cabecalhos(token) {
  const base = { apikey: CONFIG.supabase.publishableKey, "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function chamarGoTrue(caminho, opcoes) {
  const resposta = await fetch(`${CONFIG.supabase.url}/auth/v1/${caminho}`, opcoes);
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const codigo = corpo?.error_code ?? corpo?.error;
    const mensagem = MENSAGENS_POR_CODIGO[codigo] ?? corpo?.msg ?? corpo?.error_description ?? "Não foi possível completar a operação.";
    throw new Error(mensagem);
  }
  return corpo;
}

function comoSessao(corpo) {
  return {
    access_token: corpo.access_token,
    refresh_token: corpo.refresh_token,
    expires_at: Date.now() + corpo.expires_in * 1000,
    user: corpo.user,
  };
}

/** Login por e-mail/senha. Guarda a sessão em localStorage e devolve o usuário. */
export async function entrar(email, senha) {
  const corpo = await chamarGoTrue("token?grant_type=password", {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({ email, password: senha }),
  });
  definirSessao(comoSessao(corpo));
  return corpo.user;
}

/** Logout — melhor esforço no servidor (revoga o token), mas SEMPRE limpa a sessão local, mesmo se a chamada de rede falhar. */
export async function sair() {
  const sessao = obterSessao();
  try {
    if (sessao?.access_token) {
      await chamarGoTrue("logout", { method: "POST", headers: cabecalhos(sessao.access_token) });
    }
  } catch {
    // Sem internet ou token já inválido — sem problema, o importante é
    // limpar a sessão local abaixo de qualquer forma.
  } finally {
    limparSessao();
  }
}

/** Envia o e-mail de recuperação de senha, com o link apontando para `urlRedirecionamento`. */
export async function recuperarSenha(email, urlRedirecionamento) {
  await chamarGoTrue(`recover?redirect_to=${encodeURIComponent(urlRedirecionamento)}`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({ email }),
  });
}

/** Define uma nova senha — chamado na tela que o link de recuperação abre, já com uma sessão temporária ativa (o próprio Supabase autentica esse fluxo). */
export async function definirNovaSenha(novaSenha) {
  const sessao = obterSessao();
  if (!sessao?.access_token) throw new Error("Sessão de recuperação de senha não encontrada — abra o link do e-mail novamente.");
  await chamarGoTrue("user", {
    method: "PUT",
    headers: cabecalhos(sessao.access_token),
    body: JSON.stringify({ password: novaSenha }),
  });
}

/**
 * Garante que a sessão guardada localmente ainda é válida, renovando com o
 * refresh_token se estiver perto de expirar. Devolve a sessão (renovada ou
 * não) ou null se não houver sessão / a renovação falhar (nesse caso já
 * limpa a sessão local — uma sessão que não renova não serve pra nada).
 */
export async function garantirSessaoValida() {
  const sessao = obterSessao();
  if (!sessao) return null;

  const pertoDeExpirar = sessao.expires_at - Date.now() < MARGEM_RENOVACAO_MS;
  if (!pertoDeExpirar) return sessao;

  try {
    const corpo = await chamarGoTrue("token?grant_type=refresh_token", {
      method: "POST",
      headers: cabecalhos(),
      body: JSON.stringify({ refresh_token: sessao.refresh_token }),
    });
    const novaSessao = comoSessao(corpo);
    definirSessao(novaSessao);
    return novaSessao;
  } catch {
    limparSessao();
    return null;
  }
}

/** Checagem rápida e síncrona — "existe alguma sessão guardada?" (sem validar expiração; use garantirSessaoValida() antes de operações que dependem de rede). */
export function estaAutenticada() {
  return obterSessao() !== null;
}

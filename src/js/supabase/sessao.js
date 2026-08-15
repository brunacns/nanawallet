// Guarda a sessão do Supabase Auth (access_token/refresh_token/usuário) em
// localStorage — funciona identicamente no WebView do Tauri e num navegador
// de verdade, então é compartilhado entre Desktop e Web sem nenhuma
// diferença de código. Módulo simples de estado compartilhado, no mesmo
// espírito de estadoMes.js (sem classe, só funções sobre um valor guardado).
const CHAVE_LOCALSTORAGE = "nanawallet.sessao";

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

/** Sessão atual (ou null se não houver login). Formato: { access_token, refresh_token, expires_at, user }. */
export function obterSessao() {
  return ler();
}

export function definirSessao(sessao) {
  localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(sessao));
}

export function limparSessao() {
  localStorage.removeItem(CHAVE_LOCALSTORAGE);
}

export function obterAccessToken() {
  return ler()?.access_token ?? null;
}

export function obterUsuarioId() {
  return ler()?.user?.id ?? null;
}

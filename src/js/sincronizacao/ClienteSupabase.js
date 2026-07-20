import { CONFIG } from "../config.js";

// Cliente HTTP mínimo para o Supabase usando fetch() puro — sem o pacote
// @supabase/supabase-js. Não é possível importar um pacote npm no frontend
// deste projeto sem um bundler (já documentado desde a Etapa 3: "importar
// @tauri-apps/plugin-fs diretamente não funciona sem um bundler, que este
// projeto não usa"), e o Supabase expõe tudo via APIs REST simples
// (PostgREST para os dados, GoTrue para autenticação), então fetch() direto
// é suficiente e mantém o app 100% JavaScript vanilla.
const { supabaseUrl, supabaseAnonKey } = CONFIG.sincronizacao;

async function requisitar(caminho, opcoes = {}, sessao = null) {
  const cabecalhos = {
    apikey: supabaseAnonKey,
    "Content-Type": "application/json",
    ...opcoes.headers,
  };
  if (sessao?.access_token) {
    cabecalhos.Authorization = `Bearer ${sessao.access_token}`;
  }

  const resposta = await fetch(`${supabaseUrl}${caminho}`, { ...opcoes, headers: cabecalhos });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    const erro = new Error(`Supabase respondeu ${resposta.status} em ${caminho}: ${corpo}`);
    erro.status = resposta.status;
    throw erro;
  }
  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  return texto ? JSON.parse(texto) : null;
}

// ---------- Autenticação (GoTrue) ----------

// Devolve `{ user, session }`. Se o projeto exigir confirmação por e-mail,
// `session` vem null — a usuária precisa confirmar antes de conseguir entrar.
export async function cadastrar(email, senha) {
  return requisitar("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password: senha }),
  });
}

// Devolve a sessão (access_token, refresh_token, expires_in, user, ...).
export async function entrar(email, senha) {
  return requisitar("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password: senha }),
  });
}

export async function renovarSessao(refreshToken) {
  return requisitar("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function sair(sessao) {
  await requisitar("/auth/v1/logout?scope=local", { method: "POST" }, sessao);
}

// ---------- Dados (PostgREST) ----------
// Toda leitura/escrita depende do RLS das tabelas (auth.uid() = user_id),
// então `sessao` (com o access_token da usuária logada) é sempre necessária
// — sem ela, o Postgres simplesmente não devolve/aceita nenhuma linha.

// Linhas alteradas desde `desde` (ISO) — ou todas, se `desde` for null (primeira sincronização).
export async function buscarAlteracoes(colecao, sessao, desde) {
  const filtro = desde ? `&atualizado_em=gt.${encodeURIComponent(desde)}` : "";
  return requisitar(`/rest/v1/${colecao}?select=*${filtro}&order=atualizado_em.asc`, { method: "GET" }, sessao);
}

// Upsert por id (cria ou atualiza).
export async function enviarSalvar(colecao, linha, sessao) {
  await requisitar(
    `/rest/v1/${colecao}?on_conflict=id`,
    { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([linha]) },
    sessao
  );
}

// Marca a exclusão (tombstone) só SE a linha existir no servidor — um PATCH
// sobre um id inexistente não afeta nenhuma linha e não dá erro, o que
// resolve sozinho o caso de um item criado E excluído inteiramente offline
// (nunca chegou a ser enviado, então não há nada para marcar).
export async function enviarRemocao(colecao, id, sessao) {
  await requisitar(
    `/rest/v1/${colecao}?id=eq.${id}`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ excluido_em: new Date().toISOString() }) },
    sessao
  );
}

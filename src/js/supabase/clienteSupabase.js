import { CONFIG } from "../config.js";
import { obterAccessToken } from "./sessao.js";

// Fala direto com a API REST do Supabase (PostgREST) via fetch — sem o SDK
// @supabase/supabase-js, porque este projeto não usa bundler para instalar
// dependências de frontend (mesma razão já documentada para os plugins do
// Tauri, que também são acessados via API nativa em vez de import npm).
//
// A chave usada aqui (CONFIG.supabase.publishableKey) é a chave publicável
// do Supabase — protegida por Row Level Security, feita para ficar visível
// no frontend. A "service_role key" (que ignora RLS) não existe em nenhum
// lugar deste projeto e nunca deve ser adicionada aqui.

function cabecalhos(extra = {}) {
  const token = obterAccessToken();
  return {
    apikey: CONFIG.supabase.publishableKey,
    // Sem sessão (usuária deslogada), cai para a própria chave publicável —
    // o Postgres então vê auth.uid() como null e as policies de RLS não
    // liberam nenhuma linha, então isso nunca expõe dado de ninguém.
    Authorization: `Bearer ${token ?? CONFIG.supabase.publishableKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function tratarResposta(resposta) {
  if (resposta.ok) {
    if (resposta.status === 204) return null;
    const texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
  }
  const corpo = await resposta.text();
  throw new Error(`Supabase (${resposta.status}): ${corpo}`);
}

export async function postgrestSelect(tabela) {
  const resposta = await fetch(`${CONFIG.supabase.url}/rest/v1/${tabela}?select=*`, {
    headers: cabecalhos(),
  });
  return tratarResposta(resposta);
}

// Upsert (INSERT ... ON CONFLICT DO UPDATE na chave primária da tabela).
// Usado tanto para criar quanto para editar — o app sempre sabe o id do item
// (gerado com crypto.randomUUID() antes de salvar), então "salvar" é sempre
// uma operação só, sem precisar decidir entre POST/PATCH.
export async function postgrestUpsert(tabela, linhas) {
  const resposta = await fetch(`${CONFIG.supabase.url}/rest/v1/${tabela}`, {
    method: "POST",
    headers: cabecalhos({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(linhas),
  });
  return tratarResposta(resposta);
}

export async function postgrestDelete(tabela, filtro) {
  const resposta = await fetch(`${CONFIG.supabase.url}/rest/v1/${tabela}?${filtro}`, {
    method: "DELETE",
    headers: cabecalhos(),
  });
  return tratarResposta(resposta);
}

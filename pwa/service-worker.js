// Service worker da PWA — dá duas coisas ao app: 1) funcionar offline (cache
// dos arquivos já visitados) e 2) ser um dos requisitos para o Safari tratar
// isto como um app de verdade ao "Adicionar à Tela de Início".
//
// Estratégia: cache dinâmico (não uma lista fixa de arquivos pra baixar no
// install) — "network-first, cai pro cache se não tiver internet". Cada
// arquivo (HTML/CSS/JS/ícone) que a usuária efetivamente carregar enquanto
// online fica guardado automaticamente; se abrir depois sem internet, serve
// a última cópia guardada. Evita ter que manter uma lista manual de todos os
// arquivos do app (frágil — fácil esquecer de atualizar quando um arquivo
// novo for adicionado).
//
// Dados financeiros NUNCA passam por aqui: qualquer chamada para o Supabase
// é ignorada pelo service worker e vai direto pra rede, sem cache.
const CACHE_NAME = "nanawallet-pwa-v1"; // mude esse número pra forçar todo mundo a rebaixar os arquivos

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((chave) => chave !== CACHE_NAME).map((chave) => caches.delete(chave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);

  // Nunca intercepta o Supabase (nem os dados, nem o login) — sempre direto pra rede.
  if (url.hostname.endsWith(".supabase.co")) return;

  // Só GET do mesmo site entra no cache (formulários e afins passam direto).
  if (evento.request.method !== "GET" || url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request).then((respostaEmCache) => respostaEmCache || Response.error()))
  );
});

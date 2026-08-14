import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const porta = 4178;

const tipos = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// Mock de window.__TAURI__ só para auditoria visual manual neste servidor
// (ativado com ?mock=1 na URL) — nunca é servido para o app real, que lê o
// index.html direto do disco sem passar por este script. Backing store em
// memória (Map), mesmo espírito do mock usado pelos testes automatizados
// (tests/helpers/tauriFsMock.js), só que em JS de navegador em vez de Node.
const SCRIPT_MOCK = `
<script>
(function () {
  const arquivos = new Map();
  function pastaDe(caminho) {
    const partes = caminho.split("/");
    partes.pop();
    return partes.join("/");
  }
  window.__TAURI__ = {
    fs: {
      exists: async (p) => arquivos.has(p),
      readTextFile: async (p) => {
        if (!arquivos.has(p)) throw new Error("ENOENT: " + p);
        return arquivos.get(p);
      },
      writeTextFile: async (p, conteudo) => { arquivos.set(p, conteudo); },
      mkdir: async () => {},
      readDir: async (p) => {
        const prefixo = p.endsWith("/") ? p : p + "/";
        const nomes = new Map();
        for (const chave of arquivos.keys()) {
          if (chave.startsWith(prefixo)) {
            const nome = chave.slice(prefixo.length).split("/")[0];
            nomes.set(nome, chave.slice(prefixo.length).includes("/"));
          }
        }
        return [...nomes.entries()].map(([name, temSubpasta]) => ({ name, isDirectory: temSubpasta, isFile: !temSubpasta }));
      },
      remove: async (p) => { arquivos.delete(p); },
      copyFile: async (origem, destino) => { arquivos.set(destino, arquivos.get(origem)); },
    },
    path: {
      appLocalDataDir: async () => "/mock",
      join: async (...partes) => partes.filter(Boolean).join("/"),
    },
    dialog: { save: async () => null, open: async () => null },
    app: { getVersion: async () => "1.10.0-preview" },
  };
})();
</script>
`;

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let caminho = decodeURIComponent(url.pathname);
    if (caminho === "/") caminho = "/src/index.html";
    const arquivo = path.join(raiz, caminho);
    fs.readFile(arquivo, (erro, dados) => {
      if (erro) {
        res.writeHead(404);
        res.end("Não encontrado");
        return;
      }
      const ext = path.extname(arquivo);
      res.writeHead(200, { "Content-Type": tipos[ext] || "application/octet-stream" });
      if (ext === ".html" && url.searchParams.get("mock") === "1") {
        const html = dados.toString("utf-8").replace('<script type="module" src="./js/main.js">', SCRIPT_MOCK + '<script type="module" src="./js/main.js">');
        res.end(html);
      } else {
        res.end(dados);
      }
    });
  })
  .listen(porta, () => console.log(`Servindo em http://localhost:${porta}`));

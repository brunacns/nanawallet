// Monta um DOM real (jsdom) a partir do PRÓPRIO src/index.html — em vez de um
// fixture HTML reduzido à mão, que ficaria desatualizado (e frágil) assim que
// alguém renomeasse um id na tela real. Usado pelos testes que precisam
// exercitar o comportamento observável de telas (formulários, modais,
// botões), não só a lógica pura de dados.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_INDEX_HTML = path.join(__dirname, "..", "..", "src", "index.html");

/**
 * Cria um jsdom a partir do index.html real e instala `document`/`window`
 * como globais (é assim que o código do app, escrito para rodar num
 * navegador de verdade, consegue rodar sem alteração dentro do teste).
 * `runScripts: "outside-only"` garante que o `<script type="module">` do
 * próprio HTML NUNCA é executado pelo jsdom — quem inicializa as telas é o
 * teste, chamando as funções `iniciar*` diretamente, de forma controlada.
 */
export function montarDom() {
  const html = readFileSync(CAMINHO_INDEX_HTML, "utf-8");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // `navigator` é global e somente-leitura no próprio Node (desde a v21) —
  // o código do app não usa `navigator` em nenhum lugar, então não precisa
  // ser sobrescrito (e tentar fazer isso lança TypeError).
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  // `confirm` é sobrescrito por cada teste conforme o cenário (aceitar/cancelar).
  globalThis.confirm = () => true;
  // jsdom não implementa requestAnimationFrame (gap conhecido, não é um bug
  // deste projeto) — polyfill padrão via setTimeout, só para o código do app
  // (ex: utils/toast.js) não quebrar rodando dentro dos testes.
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

  return dom;
}

/** Dispara um clique real (via jsdom) num elemento, disparando os listeners cadastrados com addEventListener. */
export function clicar(elemento) {
  elemento.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

/** Preenche um campo de formulário e dispara `input`/`change`, como um usuário digitando. */
export function preencher(elemento, valor) {
  elemento.value = valor;
  elemento.dispatchEvent(new globalThis.window.Event("input", { bubbles: true }));
  elemento.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
}

/** Espera as microtasks pendentes resolverem — usado depois de disparar uma ação async (ex: clicar em Salvar). */
export function proximoTick(voltas = 3) {
  return new Promise((resolve) => {
    let restantes = voltas;
    const passo = () => {
      restantes--;
      if (restantes <= 0) resolve();
      else setTimeout(passo, 0);
    };
    setTimeout(passo, 0);
  });
}

/**
 * Espera até `condicao()` devolver algo truthy, checando a cada `intervaloMs`.
 * Usado depois de disparar uma ação (ex: clicar em "Restaurar") cuja cadeia de
 * `await`s internos (vários arquivos lidos/gravados em sequência) não é
 * exposta ao teste — um número fixo de "ticks" não é confiável porque cada
 * operação de arquivo é I/O real (thread pool do libuv), não uma microtask.
 * Lança erro se `timeoutMs` passar sem a condição ficar verdadeira, apontando
 * exatamente o que travou em vez de um teste "cancelado" sem explicação.
 */
export async function esperarAte(condicao, { timeoutMs = 2000, intervaloMs = 10, mensagem = "condição" } = {}) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const resultado = await condicao();
    if (resultado) return resultado;
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
  throw new Error(`esperarAte: tempo esgotado (${timeoutMs}ms) aguardando: ${mensagem}`);
}

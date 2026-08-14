// Confirmação visual discreta ao salvar/editar/excluir uma transação — um
// "toast" que aparece perto do fim da tela, some sozinho, e nunca bloqueia
// nem exige interação. Reaproveita #toast-container (index.html, ao lado do
// #grafico-tooltip — outro elemento "flutuante" compartilhado por vários
// módulos) e as mesmas variáveis de transição/sombra já usadas em modais.
import { escaparHtml } from "./formatadores.js";
import { svgSucesso, svgExclusaoToast } from "./icones.js";

const DURACAO_VISIVEL_MS = 2600;

const ICONES = {
  sucesso: svgSucesso,
  exclusao: svgExclusaoToast,
};

/**
 * @param {string} mensagem texto curto (ex: "Gasto salvo")
 * @param {"sucesso"|"exclusao"} tipo decide o ícone e o acento de cor
 */
export function mostrarToast(mensagem, tipo = "sucesso") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${tipo}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="toast__icone">${ICONES[tipo] ?? ICONES.sucesso}</span>
    <span class="toast__texto">${escaparHtml(mensagem)}</span>
  `;
  container.appendChild(toast);

  // A classe é adicionada num frame seguinte de propósito — se viesse junto
  // com a criação do elemento, o navegador poderia colapsar os dois estados
  // (sem a classe / com a classe) numa única atualização de estilo, e a
  // transição de entrada não rodaria.
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("toast--visivel")));

  setTimeout(() => esconderToast(toast), DURACAO_VISIVEL_MS);
}

function esconderToast(toast) {
  toast.classList.remove("toast--visivel");
  toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  // Se por algum motivo o transitionend não disparar (ex: elemento já
  // removido do layout de outra forma), garante que não fica lixo no DOM.
  setTimeout(() => toast.remove(), 500);
}

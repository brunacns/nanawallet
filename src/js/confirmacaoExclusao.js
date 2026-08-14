// Modal compartilhado para perguntar o ESCOPO de uma exclusão, quando o item
// excluído faz parte de uma série de gasto/ganho fixo ou de um parcelamento —
// a confirmação nativa `confirm()` só tem OK/Cancelar, não dá pra oferecer
// "só esse / esse e os futuros / todos" nela. Usado por gastos.js e ganhos.js.
import { prenderFocoNoModal } from "./utils/focoModal.js";

const OPCOES_POR_TIPO = {
  fixo: [
    { valor: "somente", rotulo: "Somente esta ocorrência" },
    { valor: "futuras", rotulo: "Esta ocorrência e as futuras da série" },
    { valor: "todas", rotulo: "Todas as ocorrências desta série" },
  ],
  parcela: [
    { valor: "somente", rotulo: "Somente esta parcela" },
    { valor: "futuras", rotulo: "Esta parcela e as futuras" },
    { valor: "todas", rotulo: "Todas as parcelas deste parcelamento" },
  ],
};

let resolverAtual = null;

function fechar(resultado) {
  document.getElementById("sobreposicao-escopo-exclusao").hidden = true;
  if (resolverAtual) {
    resolverAtual(resultado);
    resolverAtual = null;
  }
}

// Chamada uma vez, na inicialização do app — liga os botões fixos do modal
// (o conteúdo variável é montado a cada chamada de perguntarEscopoExclusao).
export function iniciarConfirmacaoExclusao() {
  document.getElementById("botao-fechar-escopo-exclusao").addEventListener("click", () => fechar(null));
  document.getElementById("botao-cancelar-escopo-exclusao").addEventListener("click", () => fechar(null));
  document.getElementById("sobreposicao-escopo-exclusao").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-escopo-exclusao") fechar(null);
  });
  document.getElementById("botao-confirmar-escopo-exclusao").addEventListener("click", () => {
    const selecionada = document.querySelector('input[name="escopo-exclusao"]:checked');
    fechar(selecionada ? selecionada.value : null);
  });
  prenderFocoNoModal(document.getElementById("sobreposicao-escopo-exclusao"));
}

// Pergunta qual o escopo da exclusão. `tipo` é "fixo" ou "parcela" (decide as
// opções mostradas). Devolve uma Promise que resolve com "somente" | "futuras"
// | "todas", ou `null` se o usuário cancelar/fechar o modal.
//
// Correção (auditoria 2026-08-09, BUG-03): se esta função fosse chamada de
// novo enquanto uma chamada anterior ainda não tinha sido respondida (ex:
// clicar "excluir" rapidamente em dois gastos fixos diferentes antes do
// primeiro modal fechar), `resolverAtual` era simplesmente sobrescrito — a
// Promise da PRIMEIRA chamada nunca era resolvida nem rejeitada, ficando
// pendurada para sempre (nem erro, nem exclusão, nem cancelamento). Agora,
// abrir um novo modal de escopo resolve explicitamente qualquer pedido
// anterior ainda pendente com `null` (cancelamento implícito) — o mesmo
// resultado que fechar o modal sem escolher nada já produzia.
export function perguntarEscopoExclusao({ titulo, tipo }) {
  if (resolverAtual) {
    resolverAtual(null);
    resolverAtual = null;
  }

  const opcoes = OPCOES_POR_TIPO[tipo];

  document.getElementById("escopo-exclusao-titulo").textContent = `Excluir "${titulo}"`;
  document.getElementById("escopo-exclusao-opcoes").innerHTML = opcoes
    .map(
      (o, i) => `
    <label class="campo-checkbox" style="align-items: flex-start;">
      <input type="radio" name="escopo-exclusao" value="${o.valor}" ${i === 0 ? "checked" : ""} />
      <span>${o.rotulo}</span>
    </label>
  `
    )
    .join("");
  document.getElementById("sobreposicao-escopo-exclusao").hidden = false;

  return new Promise((resolve) => {
    resolverAtual = resolve;
  });
}

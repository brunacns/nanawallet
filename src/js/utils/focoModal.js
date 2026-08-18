// Focus trap simples para os modais do app.
//
// Correção (auditoria 2026-08-09, BUG-06): nenhum modal prendia o foco do
// teclado — pressionar Tab repetidamente dentro de um modal aberto fazia o
// foco "escapar" para o menu lateral por trás, que continuava totalmente
// clicável mesmo com o modal visualmente por cima. Os modais também não
// tinham `role="dialog"`/`aria-modal`, então um leitor de tela não tinha
// como saber que aquele conteúdo era um diálogo separado da página.
const SELETOR_FOCAVEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Elementos dentro de uma linha/seção com `hidden` (ex: campos condicionais
// escondidos de um formulário) nunca recebem foco de verdade num navegador —
// `closest("[hidden]")` reproduz essa mesma regra aqui, para o
// "primeiro"/"último" campo do laço nunca apontar pra um elemento invisível.
function elementosFocaveis(container) {
  return [...container.querySelectorAll(SELETOR_FOCAVEL)].filter((el) => !el.closest("[hidden]"));
}

// Prende Tab/Shift+Tab dentro de `overlayEl` (o elemento ".sobreposicao").
// Chamado uma única vez, na inicialização de cada página — não precisa ser
// ligado/desligado manualmente ao abrir/fechar o modal: o handler só faz
// algo quando o Tab é pressionado com o foco JÁ dentro do overlay, o que só
// acontece organicamente enquanto ele está visível.
export function prenderFocoNoModal(overlayEl) {
  overlayEl.addEventListener("keydown", (evento) => {
    if (evento.key !== "Tab") return;

    const focaveis = elementosFocaveis(overlayEl);
    if (focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const dentroDoModal = overlayEl.contains(document.activeElement);

    if (evento.shiftKey && (document.activeElement === primeiro || !dentroDoModal)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && (document.activeElement === ultimo || !dentroDoModal)) {
      evento.preventDefault();
      primeiro.focus();
    }
  });
}

// Controla apenas a troca de página visível pelo menu lateral.
// Não lê nem grava dados — puramente visual.
export function configurarNavegacao() {
  const botoes = document.querySelectorAll(".sidebar__item");

  botoes.forEach((botao) => {
    botao.addEventListener("click", () => {
      const destino = botao.dataset.pagina;
      mostrarPagina(destino);

      botoes.forEach((b) => b.classList.remove("ativo"));
      botao.classList.add("ativo");
    });
  });
}

function mostrarPagina(id) {
  document.querySelectorAll(".pagina").forEach((secao) => {
    secao.classList.toggle("ativa", secao.id === `pagina-${id}`);
  });
}

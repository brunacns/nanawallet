import { prenderFocoNoModal } from "./utils/focoModal.js";

// Controla a troca de página visível (sidebar, navegação inferior mobile, e
// a folha "Mais" dela) e a página atual. Não lê nem grava dados — puramente
// visual.

// Destinos que ficam na navegação inferior fixa (mobile) — o resto vive na
// folha "Mais". Usado só para saber quando marcar o botão "Mais" como ativo.
const PAGINAS_PRIMARIAS = ["dashboard", "gastos", "ganhos", "historico"];

export function configurarNavegacao() {
  document.querySelectorAll("[data-pagina]").forEach((botao) => {
    botao.addEventListener("click", () => {
      irParaPagina(botao.dataset.pagina);
      fecharMenuMais();
    });
  });

  document.getElementById("botao-abrir-mais")?.addEventListener("click", abrirMenuMais);
  document.getElementById("botao-fechar-mais")?.addEventListener("click", fecharMenuMais);
  const elSobreposicaoMais = document.getElementById("sobreposicao-mais");
  elSobreposicaoMais?.addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-mais") fecharMenuMais();
  });
  if (elSobreposicaoMais) prenderFocoNoModal(elSobreposicaoMais);

  // Garante que a navegação inferior e a folha "Mais" comecem sincronizadas
  // com o estado inicial já marcado no HTML (Dashboard ativo).
  irParaPagina("dashboard");
}

function irParaPagina(destino) {
  document.querySelectorAll(".pagina").forEach((secao) => {
    secao.classList.toggle("ativa", secao.id === `pagina-${destino}`);
  });

  // Marca .ativo/aria-current em TODOS os botões com esse data-pagina (podem
  // existir em até 3 lugares ao mesmo tempo: sidebar, navegação inferior e
  // folha "Mais") — não só no que foi clicado, senão os outros dois ficariam
  // com o estado antigo até o próximo clique neles.
  document.querySelectorAll("[data-pagina]").forEach((botao) => {
    const ativo = botao.dataset.pagina === destino;
    botao.classList.toggle("ativo", ativo);
    // aria-current="page" é o jeito semântico de indicar "página atual" a
    // leitores de tela — a classe .ativo sozinha só comunica isso
    // visualmente (cor/barra lateral).
    if (ativo) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  });

  // O botão "Mais" da navegação inferior também acende quando a página atual
  // é uma das que só existem dentro da folha "Mais" (ex: Configurações) —
  // sem isso, pareceria que nenhum item da nav inferior está selecionado.
  document.getElementById("botao-abrir-mais")?.classList.toggle("ativo", !PAGINAS_PRIMARIAS.includes(destino));
}

function abrirMenuMais() {
  document.getElementById("sobreposicao-mais")?.removeAttribute("hidden");
  document.getElementById("botao-abrir-mais")?.setAttribute("aria-expanded", "true");
}

function fecharMenuMais() {
  document.getElementById("sobreposicao-mais")?.setAttribute("hidden", "");
  document.getElementById("botao-abrir-mais")?.setAttribute("aria-expanded", "false");
}

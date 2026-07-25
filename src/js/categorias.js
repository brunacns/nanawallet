// Helpers de categoria compartilhados entre páginas (gastos, histórico,
// dashboard/gráficos) — mesmo espírito de estadoMes.js: um lugar só, fora de
// modulos/, para uma coisa usada por várias telas sem virar um serviço de
// domínio (a leitura/escrita de verdade continua em categoriasService).
import { categoriasService } from "./servicos/index.js";
import { escaparHtml, corComOpacidade } from "./utils/formatadores.js";

export function obterCategorias() {
  return categoriasService.obterTodos();
}

export function obterCategoriaPorId(id) {
  if (!id) return null;
  return categoriasService.obterTodos().find((c) => c.id === id) || null;
}

// Badge somente leitura (tabela de Gastos, Histórico, dashboard) — reaproveita
// a mesma linguagem visual dos selos existentes (fundo suave da cor + texto
// na cor cheia), só que com a cor pastel de cada categoria em vez de uma
// classe fixa, já que a cor é escolhida por categoria, não por tipo de dado.
// Opções de <select> para filtrar por categoria (Gastos, Histórico): "Todas",
// "Sem categoria" e uma opção por categoria cadastrada. Compartilhado entre
// as duas telas para não duplicar a mesma lista duas vezes.
export function opcoesFiltroCategoria() {
  const opcoes = categoriasService
    .obterTodos()
    .map((c) => `<option value="${c.id}">${c.emoji} ${escaparHtml(c.nome)}</option>`)
    .join("");
  return `<option value="todas">Todas as categorias</option><option value="sem">Sem categoria</option>${opcoes}`;
}

export function chipCategoria(categoriaId) {
  const categoria = obterCategoriaPorId(categoriaId);
  if (!categoria) {
    return '<span class="chip-categoria chip-categoria--vazia">Sem categoria</span>';
  }
  return `<span class="chip-categoria" style="background-color: ${corComOpacidade(categoria.cor, 0.18)}; color: ${categoria.cor};">${
    categoria.emoji
  } ${escaparHtml(categoria.nome)}</span>`;
}

// ---------- Seletor de categoria (componente de formulário) ----------
// Painel customizado que abre um chip colorido por categoria — usado no
// formulário de gasto e no de parcelamento (2 usos = motivo suficiente para
// extrair daqui em vez de duplicar a mesma lógica de abrir/fechar/selecionar
// nos dois módulos). Os ids no HTML seguem sempre o padrão
// "seletor-categoria-<nome>[-botao|-rotulo|-painel]" e "campo-categoria-<nome>"
// (o input escondido que guarda o id selecionado).
export function criarSeletorCategoria(nome) {
  const idBotao = `seletor-categoria-${nome}-botao`;
  const idRotulo = `seletor-categoria-${nome}-rotulo`;
  const idPainel = `seletor-categoria-${nome}-painel`;
  const idCampo = `campo-categoria-${nome}`;
  const idWrapper = `seletor-categoria-${nome}`;

  const elBotao = () => document.getElementById(idBotao);
  const elRotulo = () => document.getElementById(idRotulo);
  const elPainel = () => document.getElementById(idPainel);
  const elCampo = () => document.getElementById(idCampo);

  function opcoesPainel(categoriaIdSelecionada) {
    const semCategoria = `<button type="button" class="opcao-categoria opcao-categoria--vazia ${
      categoriaIdSelecionada ? "" : "selecionada"
    }" data-categoria-id="">Sem categoria</button>`;

    const opcoes = obterCategorias()
      .map((categoria) => {
        const selecionada = categoria.id === categoriaIdSelecionada ? "selecionada" : "";
        return `<button type="button" class="opcao-categoria ${selecionada}" data-categoria-id="${categoria.id}" style="background-color: ${corComOpacidade(
          categoria.cor,
          0.16
        )}; color: ${categoria.cor};">${categoria.emoji} ${escaparHtml(categoria.nome)}</button>`;
      })
      .join("");

    return semCategoria + opcoes;
  }

  function definir(categoriaId) {
    elCampo().value = categoriaId || "";
    const categoria = obterCategoriaPorId(categoriaId);
    elRotulo().textContent = categoria ? `${categoria.emoji} ${categoria.nome}` : "Sem categoria";
  }

  function obter() {
    return elCampo().value || null;
  }

  function abrirPainel() {
    elPainel().innerHTML = opcoesPainel(elCampo().value || null);
    elPainel().hidden = false;
    elBotao().classList.add("aberto");
    elBotao().setAttribute("aria-expanded", "true");
  }

  function fecharPainel() {
    elPainel().hidden = true;
    elBotao().classList.remove("aberto");
    elBotao().setAttribute("aria-expanded", "false");
  }

  function inicializar() {
    elBotao().addEventListener("click", (evento) => {
      evento.stopPropagation();
      if (elPainel().hidden) abrirPainel();
      else fecharPainel();
    });
    elPainel().addEventListener("click", (evento) => {
      const opcao = evento.target.closest(".opcao-categoria");
      if (!opcao) return;
      definir(opcao.dataset.categoriaId || null);
      fecharPainel();
    });
    document.addEventListener("click", (evento) => {
      if (!evento.target.closest(`#${idWrapper}`)) fecharPainel();
    });
  }

  return { inicializar, definir, obter, fechar: fecharPainel };
}

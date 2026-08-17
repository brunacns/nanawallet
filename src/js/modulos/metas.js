import { metasService } from "../servicos/index.js";
import { formatarMoeda, escaparHtml, urlSegura } from "../utils/formatadores.js";
import { svgEditar, svgExcluir, svgLink } from "../utils/icones.js";
import { avisarCampoInvalido, limparValidacao } from "../utils/validacaoFormulario.js";
import { prenderFocoNoModal } from "../utils/focoModal.js";

const ROTULOS_PRIORIDADE = {
  alta: "Alta prioridade",
  media: "Média prioridade",
  baixa: "Baixa prioridade",
  sem_definida: "Sem prioridade definida",
};
const SELOS_PRIORIDADE = {
  alta: "selo--negativo",
  media: "selo--alerta",
  baixa: "selo--neutro",
  // Precisa ser visualmente diferente de "Baixa" (selo--neutro), senão as
  // duas ficam indistinguíveis numa leitura rápida — o próprio problema que
  // esta opção existe para evitar (não confundir "sem prioridade" com
  // "baixa prioridade").
  sem_definida: "selo--tracejado",
};
// Ordena por prioridade definida primeiro (alta > média > baixa); "sem
// prioridade definida" NUNCA é tratada como baixa — fica deliberadamente
// por último, num grupo à parte.
const PESO_PRIORIDADE = { alta: 0, media: 1, baixa: 2, sem_definida: 3 };

const CHAVE_VISUALIZACAO = "nanawallet:metas:visualizacao";

let idEmEdicao = null;
let visualizacaoAtual = obterVisualizacaoSalva();

// Permite que outros módulos sejam avisados sempre que a lista de metas
// mudar. Repassa direto para o serviço, que é quem realmente guarda o
// estado agora.
export function aoAtualizarMetas(callback) {
  metasService.aoAtualizar(callback);
}

export function obterMetas() {
  return metasService.obterTodos();
}

// Recarrega as metas do disco e atualiza a tela (usado após uma restauração).
export async function recarregarMetas() {
  await metasService.recarregar();
}

export async function iniciarPaginaMetas() {
  document.getElementById("botao-nova-meta").addEventListener("click", abrirModalNovo);
  document.getElementById("botao-fechar-modal-meta").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-meta").addEventListener("click", fecharModal);
  // De propósito, sem fechar ao tocar fora do modal — ver mesma nota em gastos.js.
  prenderFocoNoModal(document.getElementById("sobreposicao-meta"));
  document.getElementById("formulario-meta").addEventListener("submit", salvarFormulario);
  document.getElementById("metas-conteudo").addEventListener("click", tratarClique);

  const botoesVisualizacao = document.getElementById("metas-visualizacao");
  botoesVisualizacao.addEventListener("click", tratarCliqueVisualizacao);
  atualizarBotoesVisualizacao(botoesVisualizacao);

  metasService.aoAtualizar(renderizar);
  await metasService.listar();
}

// ---------- Preferência de visualização (Cards/Lista) ----------
// Puramente uma preferência de exibição, sem relação com os dados
// financeiros — guardada em localStorage (mesmo mecanismo já usado para a
// sessão de autenticação, ver supabase/sessao.js) em vez de virar mais um
// campo em "configurações" no Supabase, que é desnecessário para algo que
// nem precisa sincronizar entre aparelhos.
function obterVisualizacaoSalva() {
  try {
    return localStorage.getItem(CHAVE_VISUALIZACAO) === "lista" ? "lista" : "cards";
  } catch {
    return "cards";
  }
}

function tratarCliqueVisualizacao(evento) {
  const alvo = evento.target.closest("[data-visualizacao]");
  if (!alvo) return;

  visualizacaoAtual = alvo.dataset.visualizacao;
  try {
    localStorage.setItem(CHAVE_VISUALIZACAO, visualizacaoAtual);
  } catch {
    // Navegação privada ou storage bloqueado: a preferência só não persiste
    // entre sessões, sem quebrar a troca de visualização nesta sessão.
  }
  atualizarBotoesVisualizacao(evento.currentTarget);
  renderizar();
}

function atualizarBotoesVisualizacao(container) {
  container.querySelectorAll("[data-visualizacao]").forEach((botao) => {
    botao.classList.toggle("ativa", botao.dataset.visualizacao === visualizacaoAtual);
  });
}

function ordenarMetas(lista) {
  return [...lista].sort((a, b) => PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]);
}

function renderizar() {
  const metas = metasService.obterTodos();
  const subtitulo = document.getElementById("metas-subtitulo");
  subtitulo.textContent =
    metas.length === 0 ? "Nenhuma meta cadastrada ainda" : `${metas.length} meta${metas.length > 1 ? "s" : ""} cadastrada${metas.length > 1 ? "s" : ""}`;

  const container = document.getElementById("metas-conteudo");
  const estadoVazio = document.getElementById("metas-estado-vazio");
  const toggleVisualizacao = document.getElementById("metas-visualizacao");

  if (metas.length === 0) {
    container.innerHTML = "";
    container.className = "grade-metas";
    estadoVazio.hidden = false;
    toggleVisualizacao.hidden = true;
    return;
  }

  estadoVazio.hidden = true;
  toggleVisualizacao.hidden = false;
  const ordenadas = ordenarMetas(metas);

  if (visualizacaoAtual === "lista") {
    container.className = "lista-metas";
    container.innerHTML = `<ul class="lista-metas__itens">${ordenadas.map(itemListaMeta).join("")}</ul>`;
  } else {
    container.className = "grade-metas";
    container.innerHTML = ordenadas.map(cartaoMeta).join("");
  }

  prepararFallbackDeImagens(container);
}

function seloPrioridade(prioridade) {
  const classe = SELOS_PRIORIDADE[prioridade] || SELOS_PRIORIDADE.sem_definida;
  const rotulo = ROTULOS_PRIORIDADE[prioridade] || ROTULOS_PRIORIDADE.sem_definida;
  return `<span class="selo ${classe}">${rotulo}</span>`;
}

function cartaoMeta(meta) {
  const linkSeguro = urlSegura(meta.link);

  return `
    <div class="cartao cartao-meta" data-id="${meta.id}">
      ${blocoImagemMeta(meta, "cartao-meta__imagem")}
      <div class="cartao-meta__corpo">
        <div class="cartao-meta__cabecalho">
          <span class="cartao-meta__nome">${escaparHtml(meta.nome)}</span>
          ${seloPrioridade(meta.prioridade)}
        </div>
        ${
          meta.valorDesejado != null
            ? `<div class="cartao-meta__valor">
                <span class="cartao-meta__valor-rotulo">Preço</span>
                <span class="cartao-meta__valor-numero">${formatarMoeda(meta.valorDesejado)}</span>
              </div>`
            : ""
        }
        ${meta.loja ? `<p class="cartao-meta__loja">🏬 ${escaparHtml(meta.loja)}</p>` : ""}
        ${meta.observacoes ? `<p class="cartao-meta__observacoes">${escaparHtml(meta.observacoes)}</p>` : ""}
        ${
          linkSeguro
            ? `<a class="cartao-meta__link" href="${escaparHtml(linkSeguro)}" target="_blank" rel="noopener noreferrer" data-link-produto>Ver produto ↗</a>`
            : ""
        }
        <div class="cartao-meta__acoes">
          <button type="button" class="botao-icone" data-acao="editar" title="Editar" aria-label="Editar">${svgEditar}</button>
          <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
        </div>
      </div>
    </div>
  `;
}

function itemListaMeta(meta) {
  const linkSeguro = urlSegura(meta.link);
  const detalhes = [meta.valorDesejado != null ? formatarMoeda(meta.valorDesejado) : null, meta.loja ? escaparHtml(meta.loja) : null]
    .filter(Boolean)
    .join(" · ");

  return `
    <li class="item-meta" data-id="${meta.id}">
      ${blocoImagemMeta(meta, "item-meta__miniatura")}
      <div class="item-meta__texto">
        <div class="item-meta__cabecalho">
          <span class="item-meta__nome">${escaparHtml(meta.nome)}</span>
          ${seloPrioridade(meta.prioridade)}
        </div>
        ${detalhes ? `<span class="item-meta__detalhes">${detalhes}</span>` : ""}
      </div>
      ${
        linkSeguro
          ? `<a class="botao-icone" href="${escaparHtml(linkSeguro)}" target="_blank" rel="noopener noreferrer" data-link-produto title="Ver produto" aria-label="Ver produto">${svgLink}</a>`
          : ""
      }
      <div class="item-meta__acoes">
        <button type="button" class="botao-icone" data-acao="editar" title="Editar" aria-label="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
      </div>
    </li>
  `;
}

// Área de imagem compartilhada entre card e lista (só muda a classe raiz,
// que controla o tamanho via CSS). Sem imagem (ou com uma URL inválida/de
// esquema perigoso, barrada por `urlSegura`), mostra só o placeholder —
// nesse caso nem chega a existir uma tag <img>, então não há requisição de
// rede nem chance de "quebrar". Com imagem, o placeholder some do lado; se a
// imagem falhar ao carregar (URL fora do ar, 404 etc.), o listener de
// `error` ligado em `prepararFallbackDeImagens` reexibe o placeholder — o
// fallback não pode ser um atributo `onerror=""` inline porque a CSP do app
// usa `script-src 'self'` sem `unsafe-inline` (ver auditoria de segurança).
function blocoImagemMeta(meta, classeRaiz) {
  const urlImagem = urlSegura(meta.imagemUrl);

  if (!urlImagem) {
    return `<div class="${classeRaiz} ${classeRaiz}--vazio" aria-hidden="true">🎁</div>`;
  }

  return `
    <div class="${classeRaiz}" data-wrapper-imagem>
      <img src="${escaparHtml(urlImagem)}" alt="${escaparHtml(meta.nome)}" loading="lazy" data-imagem-produto />
      <div class="${classeRaiz}-placeholder" aria-hidden="true">🎁</div>
    </div>
  `;
}

function prepararFallbackDeImagens(container) {
  container.querySelectorAll("img[data-imagem-produto]").forEach((img) => {
    img.addEventListener("error", () => img.closest("[data-wrapper-imagem]")?.classList.add("erro-imagem"), { once: true });
  });
}

function tratarClique(evento) {
  // "Ver produto": no Desktop (Tauri), um <a target="_blank"> comum não abre
  // nada — o WebView intercepta a navegação e a descarta silenciosamente, a
  // menos que o app peça explicitamente pra abrir no navegador padrão do
  // sistema (plugin "opener", já usado do mesmo jeito que fs/dialog: via
  // window.__TAURI__, sem SDK/bundler). Na Web, o <a> comum já funciona
  // sozinho, então só interceptamos quando window.__TAURI__ existir de fato.
  const link = evento.target.closest("[data-link-produto]");
  if (link) {
    if (window.__TAURI__?.opener) {
      evento.preventDefault();
      window.__TAURI__.opener.openUrl(link.href);
    }
    return;
  }

  const alvo = evento.target.closest("[data-acao]");
  if (!alvo) return;
  const id = alvo.closest("[data-id]").dataset.id;

  if (alvo.dataset.acao === "editar") abrirModalEdicao(id);
  else if (alvo.dataset.acao === "excluir") excluirMeta(id);
}

function abrirModalNovo() {
  idEmEdicao = null;
  document.getElementById("modal-meta-titulo").textContent = "Nova meta";
  document.getElementById("formulario-meta").reset();
  // "Sem prioridade definida" é o ponto de partida — a usuária escolhe uma
  // prioridade só se quiser, em vez do formulário assumir "média" por ela.
  document.getElementById("campo-prioridade-meta").value = "sem_definida";
  abrirModal();
}

function abrirModalEdicao(id) {
  const meta = metasService.obterTodos().find((m) => m.id === id);
  if (!meta) return;

  idEmEdicao = id;
  document.getElementById("modal-meta-titulo").textContent = "Editar meta";
  document.getElementById("campo-nome-meta").value = meta.nome;
  document.getElementById("campo-valor-desejado-meta").value = meta.valorDesejado ?? "";
  document.getElementById("campo-loja-meta").value = meta.loja || "";
  document.getElementById("campo-link-meta").value = meta.link || "";
  document.getElementById("campo-imagem-meta").value = meta.imagemUrl || "";
  document.getElementById("campo-prioridade-meta").value = meta.prioridade || "sem_definida";
  document.getElementById("campo-observacoes-meta").value = meta.observacoes || "";
  abrirModal();
}

function abrirModal() {
  document.getElementById("sobreposicao-meta").hidden = false;
  document.getElementById("campo-nome-meta").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-meta").hidden = true;
  idEmEdicao = null;
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const campoNome = document.getElementById("campo-nome-meta");
  limparValidacao(campoNome);

  const nome = campoNome.value.trim();

  // Correção (auditoria 2026-08-09, BUG-04): nome só com espaços passava
  // despercebido pelo `required` do HTML e falhava em silêncio.
  if (!nome) {
    avisarCampoInvalido(campoNome, "Preencha o nome do produto.");
    return;
  }

  // Preço é o único outro campo com validação nativa (número >= 0, via
  // `min="0"` no HTML) — como não é `required`, o navegador só valida o
  // formato quando algo é digitado, deixando vazio passar livremente.
  // Loja/link/imagem/prioridade nunca bloqueiam o salvamento.
  const valorBruto = document.getElementById("campo-valor-desejado-meta").value.trim();
  const valorDesejado = valorBruto === "" ? null : Number(valorBruto);
  const loja = document.getElementById("campo-loja-meta").value.trim();
  const link = document.getElementById("campo-link-meta").value.trim();
  const imagemUrl = document.getElementById("campo-imagem-meta").value.trim();
  const prioridade = document.getElementById("campo-prioridade-meta").value;
  const observacoes = document.getElementById("campo-observacoes-meta").value.trim();

  let metaSalva;

  if (idEmEdicao) {
    metaSalva = metasService.obterTodos().find((m) => m.id === idEmEdicao);
    metaSalva.nome = nome;
    metaSalva.valorDesejado = valorDesejado;
    metaSalva.loja = loja || null;
    metaSalva.link = link || null;
    metaSalva.imagemUrl = imagemUrl || null;
    metaSalva.prioridade = prioridade;
    metaSalva.observacoes = observacoes;
  } else {
    metaSalva = {
      id: crypto.randomUUID(),
      nome,
      valorDesejado,
      loja: loja || null,
      link: link || null,
      imagemUrl: imagemUrl || null,
      prioridade,
      observacoes,
    };
  }

  await metasService.salvar(metaSalva);
  fecharModal();
}

async function excluirMeta(id) {
  const meta = metasService.obterTodos().find((m) => m.id === id);
  if (!meta) return;

  const confirmou = confirm(`Excluir a meta "${meta.nome}"?`);
  if (!confirmou) return;

  await metasService.remover(id);
}

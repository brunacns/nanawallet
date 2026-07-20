import { metasService } from "../servicos/index.js";
import { formatarMoeda, escaparHtml } from "../utils/formatadores.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";

const ROTULOS_PRIORIDADE = { alta: "Alta prioridade", media: "Média prioridade", baixa: "Baixa prioridade" };
const SELOS_PRIORIDADE = { alta: "selo--negativo", media: "selo--alerta", baixa: "selo--neutro" };

let idEmEdicao = null;

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
  document.getElementById("sobreposicao-meta").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-meta") fecharModal();
  });
  document.getElementById("formulario-meta").addEventListener("submit", salvarFormulario);
  document.getElementById("metas-conteudo").addEventListener("click", tratarClique);

  metasService.aoAtualizar(renderizar);
  await metasService.listar();
}

// Quanto falta para bater a meta, em porcentagem (limitada a 100 na barra visual).
function porcentagem(meta) {
  if (!(meta.valorDesejado > 0)) return 0;
  return (meta.valorGuardado / meta.valorDesejado) * 100;
}

// Prioridade alta primeiro; dentro da mesma prioridade, quem está mais perto de bater a meta primeiro.
function ordenarMetas(lista) {
  const peso = { alta: 0, media: 1, baixa: 2 };
  return [...lista].sort((a, b) => {
    if (peso[a.prioridade] !== peso[b.prioridade]) return peso[a.prioridade] - peso[b.prioridade];
    return porcentagem(b) - porcentagem(a);
  });
}

function renderizar() {
  const metas = metasService.obterTodos();
  const subtitulo = document.getElementById("metas-subtitulo");
  subtitulo.textContent =
    metas.length === 0 ? "Nenhuma meta cadastrada ainda" : `${metas.length} meta${metas.length > 1 ? "s" : ""} cadastrada${metas.length > 1 ? "s" : ""}`;

  const container = document.getElementById("metas-conteudo");
  const estadoVazio = document.getElementById("metas-estado-vazio");

  if (metas.length === 0) {
    container.innerHTML = "";
    estadoVazio.hidden = false;
  } else {
    estadoVazio.hidden = true;
    container.innerHTML = ordenarMetas(metas).map(cartaoMeta).join("");
  }
}

function cartaoMeta(meta) {
  const pct = porcentagem(meta);
  const pctBarra = Math.min(100, Math.max(0, pct));
  const concluida = meta.valorGuardado >= meta.valorDesejado;
  const selo = concluida
    ? '<span class="selo selo--positivo">Concluída</span>'
    : `<span class="selo ${SELOS_PRIORIDADE[meta.prioridade]}">${ROTULOS_PRIORIDADE[meta.prioridade]}</span>`;

  return `
    <div class="cartao cartao-meta" data-id="${meta.id}">
      <div class="cartao-meta__cabecalho">
        <span class="cartao-meta__nome">${escaparHtml(meta.nome)}</span>
        ${selo}
      </div>
      <div class="barra-progresso">
        <div class="barra-progresso__preenchimento ${concluida ? "concluida" : ""}" style="width: ${pctBarra}%"></div>
      </div>
      <div class="cartao-meta__valores">
        <span>${formatarMoeda(meta.valorGuardado)} guardados</span>
        <span class="cartao-meta__porcentagem">${Math.round(pct)}%</span>
        <span>de ${formatarMoeda(meta.valorDesejado)}</span>
      </div>
      ${meta.observacoes ? `<p class="cartao-meta__observacoes">${escaparHtml(meta.observacoes)}</p>` : ""}
      <div class="cartao-meta__acoes">
        <button type="button" class="botao-icone" data-acao="editar" title="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir">${svgExcluir}</button>
      </div>
    </div>
  `;
}

function tratarClique(evento) {
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
  document.getElementById("campo-valor-guardado-meta").value = 0;
  document.getElementById("campo-prioridade-meta").value = "media";
  abrirModal();
}

function abrirModalEdicao(id) {
  const meta = metasService.obterTodos().find((m) => m.id === id);
  if (!meta) return;

  idEmEdicao = id;
  document.getElementById("modal-meta-titulo").textContent = "Editar meta";
  document.getElementById("campo-nome-meta").value = meta.nome;
  document.getElementById("campo-valor-desejado-meta").value = meta.valorDesejado;
  document.getElementById("campo-valor-guardado-meta").value = meta.valorGuardado;
  document.getElementById("campo-prioridade-meta").value = meta.prioridade;
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

  const nome = document.getElementById("campo-nome-meta").value.trim();
  const valorDesejado = Number(document.getElementById("campo-valor-desejado-meta").value);
  const valorGuardado = Number(document.getElementById("campo-valor-guardado-meta").value);
  const prioridade = document.getElementById("campo-prioridade-meta").value;
  const observacoes = document.getElementById("campo-observacoes-meta").value.trim();

  if (!nome || !(valorDesejado > 0) || !(valorGuardado >= 0)) return;

  let metaSalva;

  if (idEmEdicao) {
    metaSalva = metasService.obterTodos().find((m) => m.id === idEmEdicao);
    metaSalva.nome = nome;
    metaSalva.valorDesejado = valorDesejado;
    metaSalva.valorGuardado = valorGuardado;
    metaSalva.prioridade = prioridade;
    metaSalva.observacoes = observacoes;
  } else {
    metaSalva = { id: crypto.randomUUID(), nome, valorDesejado, valorGuardado, prioridade, observacoes };
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

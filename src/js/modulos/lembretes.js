import { lembretesService } from "../servicos/index.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";
import { hojeISO, diferencaEmDias } from "../utils/datas.js";
import { avisarCampoInvalido, limparValidacao } from "../utils/validacaoFormulario.js";
import { prenderFocoNoModal } from "../utils/focoModal.js";

// Limites que decidem qual indicador mostrar (ver `calcularIndicadorTempo`).
const LIMITE_DIAS_PROXIMO = 7; // até 7 dias: mostra "Próximo" em vez de contar dias
const LIMITE_DIAS_EM_MESES = 30; // acima disso (mais de ~1 mês), mostra em meses em vez de dias

let idEmEdicao = null;

// Permite que outros módulos (ex: dashboard.js) sejam avisados sempre que a
// lista de lembretes mudar, sem duplicar o estado. Repassa direto para o
// serviço, que é quem realmente guarda o estado agora.
export function aoAtualizarLembretes(callback) {
  lembretesService.aoAtualizar(callback);
}

export function obterLembretes() {
  return lembretesService.obterTodos();
}

// Recarrega os lembretes do disco e atualiza a tela (usado após uma restauração).
export async function recarregarLembretes() {
  await lembretesService.recarregar();
}

export async function iniciarPaginaLembretes() {
  document.getElementById("botao-novo-lembrete").addEventListener("click", abrirModalNovo);
  document.getElementById("botao-fechar-modal-lembrete").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-lembrete").addEventListener("click", fecharModal);
  document.getElementById("sobreposicao-lembrete").addEventListener("click", (evento) => {
    if (evento.target.id === "sobreposicao-lembrete") fecharModal();
  });
  prenderFocoNoModal(document.getElementById("sobreposicao-lembrete"));
  document.getElementById("formulario-lembrete").addEventListener("submit", salvarFormulario);
  document.getElementById("lembretes-conteudo").addEventListener("click", tratarClique);
  document.getElementById("lembretes-conteudo").addEventListener("keydown", tratarTecladoToggle);

  lembretesService.aoAtualizar(renderizar);
  await lembretesService.listar();
}

function renderizar() {
  const lembretes = lembretesService.obterTodos();
  const pendentes = lembretes.filter((l) => !l.concluido);
  const totalPendente = pendentes.reduce((soma, l) => soma + l.valor, 0);
  document.getElementById("lembretes-total").textContent = `${formatarMoeda(totalPendente)} previstos`;

  const container = document.getElementById("lembretes-conteudo");

  if (lembretes.length === 0) {
    container.innerHTML = `<li class="estado-vazio" style="padding: var(--espaco-lg) 0;">Nenhum lembrete por aqui ainda — que tal anotar o próximo compromisso ou conta a vencer?</li>`;
  } else {
    const ordenados = [...lembretes].sort((a, b) => a.data.localeCompare(b.data));
    container.innerHTML = ordenados.map(linhaLembrete).join("");
  }
}

// Decide o indicador visual de "quanto falta" para um lembrete ainda não
// concluído: em meses quando está bem distante, em dias quando está mais
// perto, e "Próximo" quando é uma questão de dias — permitindo planejar com
// antecedência (o lembrete já aparece meses antes, não só no mês do evento).
function calcularIndicadorTempo(dataISO) {
  const dias = diferencaEmDias(dataISO, hojeISO());

  if (dias < 0) {
    return { texto: "Atrasado", classe: "selo--negativo" };
  }
  if (dias <= LIMITE_DIAS_PROXIMO) {
    return { texto: "Próximo", classe: "selo--laranja" };
  }
  if (dias <= LIMITE_DIAS_EM_MESES) {
    return { texto: dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`, classe: "selo--alerta" };
  }
  const meses = Math.round(dias / 30);
  return { texto: meses === 1 ? "Falta 1 mês" : `Faltam ${meses} meses`, classe: "selo--neutro" };
}

function linhaLembrete(lembrete) {
  const indicador = lembrete.concluido
    ? ""
    : (() => {
        const { texto, classe } = calcularIndicadorTempo(lembrete.data);
        return `<span class="selo ${classe}">${texto}</span>`;
      })();

  return `
    <li class="item-lembrete" data-id="${lembrete.id}">
      <div
        class="caixa-toggle ${lembrete.concluido ? "marcada" : ""}"
        data-acao="alternar"
        role="checkbox"
        aria-checked="${lembrete.concluido}"
        aria-label="Marcar como concluído"
        tabindex="0"
      ></div>
      <div class="item-lembrete__texto">
        <div class="item-lembrete__titulo ${lembrete.concluido ? "concluido" : ""}">${escaparHtml(lembrete.titulo)}</div>
        <div class="item-lembrete__data">${formatarData(lembrete.data)} · ${formatarMoeda(lembrete.valor)}</div>
      </div>
      ${indicador}
      <div class="tabela__acoes">
        <button type="button" class="botao-icone" data-acao="editar" title="Editar" aria-label="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
      </div>
    </li>
  `;
}

function tratarClique(evento) {
  const alvo = evento.target.closest("[data-acao]");
  if (!alvo) return;
  const id = alvo.closest("[data-id]").dataset.id;

  if (alvo.dataset.acao === "alternar") alternarConcluido(id);
  else if (alvo.dataset.acao === "editar") abrirModalEdicao(id);
  else if (alvo.dataset.acao === "excluir") excluirLembrete(id);
}

// A caixa de marcar/desmarcar concluído é um <div role="checkbox"> (não um
// <input> nativo, para reaproveitar o visual de .caixa-toggle já usado em
// gastos/ganhos) — sem isso, ela só respondia a clique de mouse.
function tratarTecladoToggle(evento) {
  if (evento.key !== "Enter" && evento.key !== " ") return;
  if (!evento.target.closest('[data-acao="alternar"]')) return;
  evento.preventDefault();
  tratarClique(evento);
}

async function alternarConcluido(id) {
  const lembrete = lembretesService.obterTodos().find((l) => l.id === id);
  if (!lembrete) return;
  lembrete.concluido = !lembrete.concluido;
  await lembretesService.salvar(lembrete);
}

function abrirModalNovo() {
  idEmEdicao = null;
  document.getElementById("modal-lembrete-titulo").textContent = "Novo lembrete";
  document.getElementById("formulario-lembrete").reset();
  abrirModal();
}

function abrirModalEdicao(id) {
  const lembrete = lembretesService.obterTodos().find((l) => l.id === id);
  if (!lembrete) return;

  idEmEdicao = id;
  document.getElementById("modal-lembrete-titulo").textContent = "Editar lembrete";
  document.getElementById("campo-titulo-lembrete").value = lembrete.titulo;
  document.getElementById("campo-valor-lembrete").value = lembrete.valor;
  document.getElementById("campo-data-lembrete").value = lembrete.data;
  document.getElementById("campo-observacoes-lembrete").value = lembrete.observacoes || "";
  abrirModal();
}

function abrirModal() {
  document.getElementById("sobreposicao-lembrete").hidden = false;
  document.getElementById("campo-titulo-lembrete").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-lembrete").hidden = true;
  idEmEdicao = null;
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const campoTitulo = document.getElementById("campo-titulo-lembrete");
  limparValidacao(campoTitulo);

  const titulo = campoTitulo.value.trim();
  const valor = Number(document.getElementById("campo-valor-lembrete").value);
  const data = document.getElementById("campo-data-lembrete").value;
  const observacoes = document.getElementById("campo-observacoes-lembrete").value.trim();

  // Correção (auditoria 2026-08-09, BUG-04): título só com espaços passava
  // despercebido pelo `required` do HTML e falhava em silêncio.
  if (!titulo) {
    avisarCampoInvalido(campoTitulo, "Preencha o título.");
    return;
  }
  if (!data || !(valor > 0)) return;

  let lembreteSalvo;

  if (idEmEdicao) {
    lembreteSalvo = lembretesService.obterTodos().find((l) => l.id === idEmEdicao);
    lembreteSalvo.titulo = titulo;
    lembreteSalvo.valor = valor;
    lembreteSalvo.data = data;
    lembreteSalvo.observacoes = observacoes;
  } else {
    lembreteSalvo = { id: crypto.randomUUID(), titulo, valor, data, concluido: false, observacoes };
  }

  await lembretesService.salvar(lembreteSalvo);
  fecharModal();
}

async function excluirLembrete(id) {
  const lembrete = lembretesService.obterTodos().find((l) => l.id === id);
  if (!lembrete) return;

  const confirmou = confirm(`Excluir o lembrete "${lembrete.titulo}"?`);
  if (!confirmou) return;

  await lembretesService.remover(id);
}

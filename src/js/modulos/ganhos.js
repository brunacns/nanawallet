import { transacoesGanhos } from "../servicos/index.js";
import { formatarMoeda, formatarData, escaparHtml } from "../utils/formatadores.js";
import { svgEditar, svgExcluir } from "../utils/icones.js";
import { diaDoMes, mesDeData, chaveMesAtual, hojeISO, rotuloMesLongo } from "../utils/datas.js";
import { obterMesSelecionado, avancarMes, retrocederMes, irParaMesAtual, aoAtualizarMes } from "../estadoMes.js";
import { perguntarEscopoExclusao } from "../confirmacaoExclusao.js";
import { avisarCampoInvalido, limparValidacao } from "../utils/validacaoFormulario.js";
import { prenderFocoNoModal } from "../utils/focoModal.js";
import { mostrarToast } from "../utils/toast.js";

let idEmEdicao = null;
let fixoIdOriginalEmEdicao = null; // fixoId que o item já tinha ANTES desta edição (null se não fazia parte de uma série)

// Permite que outros módulos (ex: dashboard.js, graficos.js) sejam avisados
// sempre que a lista de ganhos mudar, sem duplicar o estado. Repassa direto
// para o serviço, que é quem realmente guarda o estado agora.
export function aoAtualizarGanhos(callback) {
  transacoesGanhos.aoAtualizar(callback);
}

export function obterGanhos() {
  return transacoesGanhos.obterTodos();
}

// Recarrega os ganhos do disco e atualiza a tela (usado após uma restauração).
export async function recarregarGanhos() {
  await transacoesGanhos.recarregar();
}

export async function iniciarPaginaGanhos() {
  document.getElementById("botao-novo-ganho").addEventListener("click", abrirModalNovo);
  document.getElementById("botao-fechar-modal-ganho").addEventListener("click", fecharModal);
  document.getElementById("botao-cancelar-modal-ganho").addEventListener("click", fecharModal);
  // De propósito, sem fechar ao tocar fora do modal — ver mesma nota em gastos.js.
  prenderFocoNoModal(document.getElementById("sobreposicao-ganho"));
  document.getElementById("formulario-ganho").addEventListener("submit", salvarFormulario);
  document.getElementById("ganhos-conteudo").addEventListener("click", tratarCliqueLista);
  document.getElementById("ganhos-conteudo").addEventListener("keydown", tratarTecladoToggle);
  document.getElementById("ganhos-mes-anterior").addEventListener("click", retrocederMes);
  document.getElementById("ganhos-mes-seguinte").addEventListener("click", avancarMes);
  document.getElementById("ganhos-mes-atual").addEventListener("click", irParaMesAtual);

  // O serviço avisa sozinho sempre que os dados mudarem (carregar, salvar,
  // remover, lote) — não precisa mais chamar renderizar() manualmente depois
  // de cada operação, como antes.
  transacoesGanhos.aoAtualizar(renderizar);
  // Bug corrigido: antes só reagia a mudanças NOS DADOS (aoAtualizar), então
  // trocar de mês só atualizava a tela quando a sincronização de recorrências
  // "por acaso" gerava um ganho fixo novo — navegando para um mês sem nada a
  // gerar, rótulo/lista ficavam travados no mês antigo (mesmo bug de gastos.js).
  aoAtualizarMes(renderizar);
  aoAtualizarMes(sincronizarRecorrencias);

  await transacoesGanhos.listar();
  await sincronizarRecorrencias();
}

// Garante que todo ganho fixo tenha uma ocorrência gerada até o mês atual
// (real) e até o mês que estiver sendo visualizado, o que for mais tarde.
async function sincronizarRecorrencias() {
  const mesAtual = chaveMesAtual();
  const mesVisto = obterMesSelecionado();
  const mesAlvo = mesVisto > mesAtual ? mesVisto : mesAtual;
  await transacoesGanhos.sincronizarRecorrencias(mesAlvo);
}

function renderizar() {
  const ganhos = transacoesGanhos.obterTodos();
  const mesSelecionado = obterMesSelecionado();
  document.getElementById("ganhos-mes-rotulo").textContent = rotuloMesLongo(mesSelecionado);

  const doMes = ganhos.filter((g) => mesDeData(g.data) === mesSelecionado);
  const total = doMes.reduce((soma, g) => soma + g.valor, 0);
  document.getElementById("ganhos-total").textContent = `Total: ${formatarMoeda(total)}`;

  // Itens já recebidos com data passada ficam fora da lista do mês (mas
  // continuam no arquivo, nunca são apagados) — a página Histórico mostra
  // todas as transações de qualquer mês/status para quem quiser ver esses itens.
  const hoje = hojeISO();
  const visiveis = doMes.filter((g) => !(g.recebido && g.data < hoje));

  const container = document.getElementById("ganhos-conteudo");
  container.innerHTML = "";

  if (visiveis.length === 0) {
    const mensagem = doMes.length === 0 ? "Nenhum ganho neste mês ainda." : "Todos os ganhos deste mês já foram recebidos (veja-os na página Histórico).";
    container.innerHTML = `<p class="estado-vazio">${mensagem}</p>`;
  } else {
    for (const grupo of agruparPorDia(visiveis)) {
      if (grupo.itens.length > 0) {
        container.appendChild(criarCartaoGrupo(grupo));
      }
    }
  }
}

function agruparPorDia(lista) {
  const ordenarPorData = (a, b) => a.data.localeCompare(b.data);
  const dia15 = lista.filter((g) => diaDoMes(g.data) === 15).sort(ordenarPorData);
  const dia30 = lista.filter((g) => diaDoMes(g.data) === 30).sort(ordenarPorData);
  const outros = lista.filter((g) => ![15, 30].includes(diaDoMes(g.data))).sort(ordenarPorData);

  return [
    { titulo: "Recebidos no dia 15", itens: dia15 },
    { titulo: "Recebidos no dia 30", itens: dia30 },
    { titulo: "Outras datas", itens: outros },
  ];
}

function criarCartaoGrupo(grupo) {
  const subtotal = grupo.itens.reduce((soma, g) => soma + g.valor, 0);

  const cartao = document.createElement("div");
  cartao.className = "cartao";
  cartao.style.marginBottom = "var(--espaco-md)";
  cartao.innerHTML = `
    <div class="cartao__cabecalho-grupo">
      <span class="cartao__titulo" style="margin-bottom:0">${grupo.titulo}</span>
      <span class="cartao__subtotal">${formatarMoeda(subtotal)}</span>
    </div>
    <div class="tabela-scroll">
      <table class="tabela">
        <thead>
          <tr>
            <th></th>
            <th>Título</th>
            <th>Data</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${grupo.itens.map(linhaGanho).join("")}
        </tbody>
      </table>
    </div>
  `;
  return cartao;
}

function linhaGanho(ganho) {
  const rotuloTipo = ganho.fixo ? '<span class="selo selo--alerta">Fixo</span>' : "";
  return `
    <tr data-id="${ganho.id}" class="${ganho.recebido ? "linha-paga" : ""}">
      <td data-rotulo="Recebido">
        <div
          class="caixa-toggle ${ganho.recebido ? "marcada" : ""}"
          data-acao="alternar-recebido"
          role="checkbox"
          aria-checked="${ganho.recebido}"
          aria-label="Marcar como recebido"
          tabindex="0"
        ></div>
      </td>
      <td class="tabela__titulo-celula" data-rotulo="Título">${escaparHtml(ganho.titulo)} ${rotuloTipo}</td>
      <td data-rotulo="Data">${formatarData(ganho.data)}</td>
      <td class="tabela__valor-positivo" data-rotulo="Valor">${formatarMoeda(ganho.valor)}</td>
      <td class="tabela__acoes">
        <button type="button" class="botao-icone" data-acao="editar" title="Editar" aria-label="Editar">${svgEditar}</button>
        <button type="button" class="botao-icone botao-icone--perigo" data-acao="excluir" title="Excluir" aria-label="Excluir">${svgExcluir}</button>
      </td>
    </tr>
  `;
}

function tratarCliqueLista(evento) {
  const alvo = evento.target.closest("[data-acao]");
  if (!alvo) return;
  const id = alvo.closest("tr[data-id]").dataset.id;

  if (alvo.dataset.acao === "editar") abrirModalEdicao(id);
  else if (alvo.dataset.acao === "excluir") excluirGanho(id);
  else if (alvo.dataset.acao === "alternar-recebido") alternarRecebido(id);
}

// A caixa de marcar/desmarcar recebido é um <div role="checkbox"> (não um
// <input> nativo, para reaproveitar o visual de .caixa-toggle) — sem isso,
// ela só respondia a clique de mouse.
function tratarTecladoToggle(evento) {
  if (evento.key !== "Enter" && evento.key !== " ") return;
  if (!evento.target.closest('[data-acao="alternar-recebido"]')) return;
  evento.preventDefault();
  tratarCliqueLista(evento);
}

async function alternarRecebido(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;
  ganho.recebido = !ganho.recebido;
  await transacoesGanhos.salvar(ganho);
}

function abrirModalNovo() {
  idEmEdicao = null;
  fixoIdOriginalEmEdicao = null;
  document.getElementById("modal-ganho-titulo").textContent = "Novo ganho";
  document.getElementById("formulario-ganho").reset();
  document.getElementById("linha-aplicar-proximas-ganho").hidden = true;
  // Um ganho novo começa com "Mais opções" fechado — só abre sozinho ao
  // EDITAR algo que já usa um desses campos (ver abrirModalEdicao).
  document.getElementById("ganho-mais-opcoes").open = false;
  abrirModal();
}

function abrirModalEdicao(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;

  idEmEdicao = id;
  fixoIdOriginalEmEdicao = ganho.fixoId;
  document.getElementById("modal-ganho-titulo").textContent = "Editar ganho";
  document.getElementById("campo-titulo-ganho").value = ganho.titulo;
  document.getElementById("campo-valor-ganho").value = ganho.valor;
  document.getElementById("campo-data-ganho").value = ganho.data;
  document.getElementById("campo-recebido-ganho").checked = ganho.recebido;
  document.getElementById("campo-fixo-ganho").checked = ganho.fixo;
  document.getElementById("campo-observacoes-ganho").value = ganho.observacoes || "";
  // Só faz sentido oferecer "aplicar às próximas" se este ganho já fazia
  // parte de uma série fixa antes desta edição (senão não há "próximas" ainda).
  document.getElementById("linha-aplicar-proximas-ganho").hidden = !ganho.fixoId;
  document.getElementById("campo-aplicar-proximas-ganho").checked = false;
  // Editar sempre abre "Mais opções" — o ganho pode já ser fixo ou ter
  // observações, e isso não deveria ficar escondido atrás de um clique extra.
  document.getElementById("ganho-mais-opcoes").open = true;
  abrirModal();
}

function abrirModal() {
  document.getElementById("sobreposicao-ganho").hidden = false;
  document.getElementById("campo-titulo-ganho").focus();
}

function fecharModal() {
  document.getElementById("sobreposicao-ganho").hidden = true;
  idEmEdicao = null;
}

async function salvarFormulario(evento) {
  evento.preventDefault();

  const campoTitulo = document.getElementById("campo-titulo-ganho");
  limparValidacao(campoTitulo);

  const titulo = campoTitulo.value.trim();
  const valor = Number(document.getElementById("campo-valor-ganho").value);
  const data = document.getElementById("campo-data-ganho").value;
  const recebido = document.getElementById("campo-recebido-ganho").checked;
  const fixo = document.getElementById("campo-fixo-ganho").checked;
  const observacoes = document.getElementById("campo-observacoes-ganho").value.trim();
  const aplicarProximas = document.getElementById("campo-aplicar-proximas-ganho").checked;

  // Correção (auditoria 2026-08-09, BUG-04): um título só com espaços passa
  // despercebido pelo `required` do HTML (não é uma string vazia para o
  // navegador) — sem este aviso explícito, o formulário falhava em silêncio.
  if (!titulo) {
    avisarCampoInvalido(campoTitulo, "Preencha o título.");
    return;
  }
  if (!data || !(valor > 0)) return;

  let ganhoSalvo;
  const foiEdicao = Boolean(idEmEdicao);

  if (idEmEdicao) {
    ganhoSalvo = transacoesGanhos.obterTodos().find((g) => g.id === idEmEdicao);
    ganhoSalvo.titulo = titulo;
    ganhoSalvo.valor = valor;
    ganhoSalvo.data = data;
    ganhoSalvo.recebido = recebido;
    ganhoSalvo.observacoes = observacoes;
    if (fixo && !ganhoSalvo.fixoId) ganhoSalvo.fixoId = crypto.randomUUID();
    if (!fixo) ganhoSalvo.fixoId = null;
    ganhoSalvo.fixo = fixo;
  } else {
    ganhoSalvo = {
      id: crypto.randomUUID(),
      titulo,
      valor,
      data,
      recebido,
      fixo,
      fixoId: fixo ? crypto.randomUUID() : null,
      observacoes,
    };
  }

  // "Aplicar edições às próximas ocorrências": propaga título/valor/
  // observações para ocorrências FUTURAS (mesma série, data depois desta) —
  // nunca mexe nas já passadas nem no status recebido/data de cada uma.
  const futurasAtualizadas =
    aplicarProximas && fixoIdOriginalEmEdicao && ganhoSalvo.fixo && ganhoSalvo.fixoId
      ? transacoesGanhos
          .obterTodos()
          .filter((g) => g.fixoId === fixoIdOriginalEmEdicao && g.id !== ganhoSalvo.id && g.data > ganhoSalvo.data)
          .map((g) => ({ ...g, titulo, valor, observacoes }))
      : [];

  if (futurasAtualizadas.length > 0) {
    await transacoesGanhos.salvarEmLote([ganhoSalvo, ...futurasAtualizadas]);
  } else {
    await transacoesGanhos.salvar(ganhoSalvo);
  }
  fecharModal();
  mostrarToast(foiEdicao ? "Ganho atualizado" : "Ganho adicionado");
}

// Ganho fixo oferece escolha de escopo (só este / este e os futuros /
// todos); um ganho avulso continua com a confirmação simples de sempre.
// "Futuros" é sempre relativo à DATA deste item (>=, então inclui o próprio) —
// mesmo critério já usado em "aplicar às próximas ocorrências".
async function excluirGanho(id) {
  const ganho = transacoesGanhos.obterTodos().find((g) => g.id === id);
  if (!ganho) return;

  if (ganho.fixoId) {
    const escopo = await perguntarEscopoExclusao({ titulo: ganho.titulo, tipo: "fixo" });
    if (!escopo) return;

    if (escopo === "somente") {
      await transacoesGanhos.remover(id);
      mostrarToast("Ganho excluído", "exclusao");
      return;
    }
    const relacionados = transacoesGanhos.obterTodos().filter((g) => g.fixoId === ganho.fixoId);
    const alvo = escopo === "todas" ? relacionados : relacionados.filter((g) => g.data >= ganho.data);
    for (const g of alvo) {
      await transacoesGanhos.remover(g.id);
    }
    mostrarToast(alvo.length === 1 ? "Ganho excluído" : `${alvo.length} ganhos excluídos`, "exclusao");
    return;
  }

  const confirmou = confirm(`Excluir o ganho "${ganho.titulo}"?`);
  if (!confirmou) return;

  await transacoesGanhos.remover(id);
  mostrarToast("Ganho excluído", "exclusao");
}

import { obterGanhos, aoAtualizarGanhos } from "./ganhos.js";
import { obterGastos, aoAtualizarGastos } from "./gastos.js";
import { formatarMoeda } from "../utils/formatadores.js";
import { diaDoMes, mesDeData, chaveMesAtual, rotuloMesCurto, listaMeses } from "../utils/datas.js";

const NS = "http://www.w3.org/2000/svg";
const LARGURA = 560;
const MARGEM = { topo: 16, direita: 16, baixo: 26, esquerda: 54 };

export function iniciarGraficos() {
  aoAtualizarGanhos(renderizarTudo);
  aoAtualizarGastos(renderizarTudo);
  renderizarTudo();
}

function renderizarTudo() {
  const ganhos = obterGanhos();
  const gastos = obterGastos();

  renderizarEvolucaoGastos(gastos);
  renderizarEvolucaoSaldo(ganhos, gastos);
  renderizarDinheiroComprometido(ganhos, gastos);
  renderizarComparacaoSalarios(ganhos, gastos);
  renderizarPrevisoesFuturas(gastos);
}

// ---------- Utilidades gerais ----------

function somar(lista, seletor) {
  return lista.reduce((soma, item) => soma + seletor(item), 0);
}

function svgEl(tag, atributos = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [chave, valor] of Object.entries(atributos)) el.setAttribute(chave, valor);
  return el;
}

function vazioHtml(mensagem) {
  return `<p class="estado-vazio" style="padding: var(--espaco-lg) 0;">${mensagem}</p>`;
}

function novoSvg(container, altura) {
  container.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${LARGURA} ${altura}`, class: "grafico-svg" });
  container.appendChild(svg);
  return svg;
}

function escalaLinear(valor, min, max, destMin, destMax) {
  if (max === min) return (destMin + destMax) / 2;
  return destMin + ((valor - min) / (max - min)) * (destMax - destMin);
}

function formatarValorEixo(valor) {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "-" : "";
  if (abs >= 1000) return `${sinal}R$ ${(abs / 1000).toFixed(1)}k`;
  return `${sinal}R$ ${abs.toFixed(0)}`;
}

function mostrarTooltip(evento, html) {
  const tooltip = document.getElementById("grafico-tooltip");
  tooltip.innerHTML = html;
  tooltip.style.left = `${evento.clientX + 14}px`;
  tooltip.style.top = `${evento.clientY + 14}px`;
  tooltip.classList.add("visivel");
}

function esconderTooltip() {
  document.getElementById("grafico-tooltip").classList.remove("visivel");
}

// ---------- Gridlines horizontais + rótulos do eixo Y ----------

function desenharGridY(svg, altura, minValor, maxValor) {
  const passos = 4;
  for (let i = 0; i <= passos; i++) {
    const valor = minValor + ((maxValor - minValor) * i) / passos;
    const y = escalaLinear(valor, minValor, maxValor, altura - MARGEM.baixo, MARGEM.topo);
    svg.appendChild(
      svgEl("line", {
        x1: MARGEM.esquerda,
        x2: LARGURA - MARGEM.direita,
        y1: y,
        y2: y,
        stroke: "var(--cor-borda)",
        "stroke-width": 1,
      })
    );
    const rotulo = svgEl("text", { x: MARGEM.esquerda - 8, y: y + 3, "text-anchor": "end" });
    rotulo.textContent = formatarValorEixo(valor);
    svg.appendChild(rotulo);
  }
}

// ==================== 1. Evolução dos gastos ====================

function renderizarEvolucaoGastos(gastos) {
  const container = document.getElementById("grafico-evolucao-gastos");
  if (gastos.length === 0) {
    container.innerHTML = vazioHtml("Sem gastos cadastrados ainda.");
    return;
  }

  // Agrupa por `mesReferencia` (mês do salário que paga o gasto), não por
  // `data` (data da compra) — os dois podem ser meses diferentes (ver
  // MODELOS-DE-DADOS.md). Dashboard e a página Gastos já usam mesReferencia;
  // usar `data` aqui fazia este gráfico divergir dos totais mostrados nas
  // outras telas para o mesmo mês (bug real encontrado nesta auditoria).
  const mesesComGasto = gastos.map((g) => g.mesReferencia).sort();
  const meses = listaMeses(mesesComGasto[0], mesesComGasto[mesesComGasto.length - 1]);
  const pontos = meses.map((chave) => ({
    chave,
    valor: somar(
      gastos.filter((g) => g.mesReferencia === chave),
      (g) => g.valor
    ),
  }));

  desenharLinha(container, pontos, {
    altura: 200,
    cor: "var(--cor-grafico-negativo)",
    comArea: true,
    formatarRotulo: rotuloMesCurto,
  });
}

// ==================== 2. Evolução do saldo ====================

function renderizarEvolucaoSaldo(ganhos, gastos) {
  const container = document.getElementById("grafico-evolucao-saldo");
  if (ganhos.length === 0 && gastos.length === 0) {
    container.innerHTML = vazioHtml("Sem dados suficientes ainda.");
    return;
  }

  // Ganhos agrupam pelo mês da própria data; gastos por `mesReferencia` — o
  // mesmo critério usado no Dashboard e na página Gastos (ver comentário em
  // renderizarEvolucaoGastos).
  const todosMeses = [...ganhos.map((g) => mesDeData(g.data)), ...gastos.map((g) => g.mesReferencia)].sort();
  const meses = listaMeses(todosMeses[0], todosMeses[todosMeses.length - 1]);

  let acumulado = 0;
  const pontos = meses.map((chave) => {
    const ganhoMes = somar(
      ganhos.filter((g) => mesDeData(g.data) === chave),
      (g) => g.valor
    );
    const gastoPagoMes = somar(
      gastos.filter((g) => g.mesReferencia === chave && g.pago),
      (g) => g.valor
    );
    acumulado += ganhoMes - gastoPagoMes;
    return { chave, valor: acumulado };
  });

  desenharLinha(container, pontos, {
    altura: 200,
    cor: "var(--cor-texto-secundario)",
    diverging: true,
    formatarRotulo: rotuloMesCurto,
  });
}

// Função compartilhada pelos dois gráficos de linha acima.
function desenharLinha(container, pontos, opcoes) {
  const altura = opcoes.altura;
  const valores = pontos.map((p) => p.valor);
  let minValor = Math.min(0, ...valores);
  let maxValor = Math.max(0, ...valores);
  if (minValor === maxValor) maxValor = minValor + 1;

  const svg = novoSvg(container, altura);
  desenharGridY(svg, altura, minValor, maxValor);

  const escalaX = (i) =>
    pontos.length <= 1
      ? (MARGEM.esquerda + LARGURA - MARGEM.direita) / 2
      : escalaLinear(i, 0, pontos.length - 1, MARGEM.esquerda, LARGURA - MARGEM.direita);
  const escalaY = (v) => escalaLinear(v, minValor, maxValor, altura - MARGEM.baixo, MARGEM.topo);

  const coords = pontos.map((p, i) => [escalaX(i), escalaY(p.valor)]);

  if (opcoes.diverging) {
    const yZero = escalaY(0);
    svg.appendChild(
      svgEl("line", {
        x1: MARGEM.esquerda,
        x2: LARGURA - MARGEM.direita,
        y1: yZero,
        y2: yZero,
        stroke: "var(--cor-texto-fraco)",
        "stroke-width": 1,
      })
    );
  }

  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  svg.appendChild(
    svgEl("path", { d, fill: "none", stroke: opcoes.cor, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" })
  );

  if (opcoes.comArea) {
    const yBase = escalaY(minValor);
    const dArea = `${d} L ${coords[coords.length - 1][0]} ${yBase} L ${coords[0][0]} ${yBase} Z`;
    svg.appendChild(svgEl("path", { d: dArea, fill: opcoes.cor, opacity: 0.1, stroke: "none" }));
  }

  const passoRotulo = Math.max(1, Math.ceil(pontos.length / 6));
  pontos.forEach((p, i) => {
    if (i % passoRotulo !== 0 && i !== pontos.length - 1) return;
    const rotulo = svgEl("text", { x: coords[i][0], y: altura - MARGEM.baixo + 16, "text-anchor": "middle" });
    rotulo.textContent = opcoes.formatarRotulo(p.chave);
    svg.appendChild(rotulo);
  });

  pontos.forEach((p, i) => {
    const [x, y] = coords[i];
    const corPonto = opcoes.diverging ? (p.valor >= 0 ? "var(--cor-grafico-positivo)" : "var(--cor-grafico-negativo)") : opcoes.cor;
    const ponto = svgEl("circle", { cx: x, cy: y, r: 4, fill: corPonto, stroke: "var(--cor-superficie)", "stroke-width": 2 });
    svg.appendChild(ponto);

    const areaClique = svgEl("circle", { cx: x, cy: y, r: 12, fill: "transparent", style: "cursor: pointer;" });
    const conteudoTooltip = `<div>${opcoes.formatarRotulo(p.chave)}</div><div class="grafico-tooltip__valor">${formatarMoeda(p.valor)}</div>`;
    areaClique.addEventListener("pointerenter", (e) => {
      ponto.setAttribute("r", 6);
      mostrarTooltip(e, conteudoTooltip);
    });
    areaClique.addEventListener("pointermove", (e) => mostrarTooltip(e, conteudoTooltip));
    areaClique.addEventListener("pointerleave", () => {
      ponto.setAttribute("r", 4);
      esconderTooltip();
    });
    svg.appendChild(areaClique);
  });

  const ultimo = pontos[pontos.length - 1];
  const [xUlt, yUlt] = coords[coords.length - 1];
  const rotuloUltimo = svgEl("text", {
    x: Math.min(xUlt, LARGURA - MARGEM.direita - 4),
    y: yUlt - 12,
    "text-anchor": "end",
    style: "font-weight: 700; fill: var(--cor-texto);",
  });
  rotuloUltimo.textContent = formatarMoeda(ultimo.valor);
  svg.appendChild(rotuloUltimo);
}

// ==================== 3. Dinheiro comprometido ====================

function renderizarDinheiroComprometido(ganhos, gastos) {
  const container = document.getElementById("grafico-dinheiro-comprometido");
  const totalRecebido = somar(ganhos, (g) => g.valor);

  if (totalRecebido <= 0) {
    container.innerHTML = vazioHtml("Cadastre ganhos para ver este gráfico.");
    return;
  }

  const totalPago = somar(
    gastos.filter((g) => g.pago),
    (g) => g.valor
  );
  const totalPendente = somar(
    gastos.filter((g) => !g.pago),
    (g) => g.valor
  );
  const totalGasto = totalPago + totalPendente;

  const excedeRenda = totalGasto > totalRecebido;
  const base = excedeRenda ? totalGasto : totalRecebido;
  const livre = excedeRenda ? 0 : totalRecebido - totalGasto;

  const segmentos = [
    { nome: "Pago", valor: totalPago, cor: "var(--cor-grafico-positivo)" },
    { nome: "Pendente", valor: totalPendente, cor: "var(--cor-grafico-negativo)" },
    { nome: "Livre", valor: livre, cor: "var(--cor-grafico-neutro)" },
  ].filter((s) => s.valor > 0);

  const altura = 70;
  const svg = novoSvg(container, altura);

  const larguraTotal = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaBarra = 28;
  const yBarra = altura / 2 - alturaBarra / 2;
  const gap = 2;

  let xAtual = MARGEM.esquerda;
  segmentos.forEach((seg, i) => {
    const larguraCheia = (seg.valor / base) * larguraTotal;
    const largura = Math.max(larguraCheia - (i < segmentos.length - 1 ? gap : 0), 0);
    const rect = svgEl("rect", { x: xAtual, y: yBarra, width: largura, height: alturaBarra, rx: 4, fill: seg.cor });
    svg.appendChild(rect);

    const conteudoTooltip = `<div>${seg.nome}</div><div class="grafico-tooltip__valor">${formatarMoeda(seg.valor)} (${Math.round((seg.valor / base) * 100)}%)</div>`;
    rect.style.cursor = "pointer";
    rect.addEventListener("pointerenter", (e) => mostrarTooltip(e, conteudoTooltip));
    rect.addEventListener("pointermove", (e) => mostrarTooltip(e, conteudoTooltip));
    rect.addEventListener("pointerleave", esconderTooltip);

    xAtual += larguraCheia;
  });

  const legenda = document.getElementById("legenda-dinheiro-comprometido");
  legenda.innerHTML = segmentos
    .map(
      (s) => `
      <span class="grafico-legenda__item">
        <span class="grafico-legenda__marca" style="background-color: ${s.cor}"></span>
        ${s.nome}: ${formatarMoeda(s.valor)}
      </span>`
    )
    .join("");

  if (excedeRenda) {
    legenda.innerHTML += `<span class="grafico-legenda__item" style="color: var(--cor-negativo);">Gastos excedem a renda em ${formatarMoeda(totalGasto - totalRecebido)}</span>`;
  }
}

// ==================== 4. Comparação entre salários ====================

function renderizarComparacaoSalarios(ganhos, gastos) {
  const container = document.getElementById("grafico-comparacao-salarios");

  const recebidoDia10 = somar(
    ganhos.filter((g) => diaDoMes(g.data) === 10),
    (g) => g.valor
  );
  const recebidoDia25 = somar(
    ganhos.filter((g) => diaDoMes(g.data) === 25),
    (g) => g.valor
  );
  const gastoDia10 = somar(
    gastos.filter((g) => g.salarioResponsavel === "dia10" && g.pago),
    (g) => g.valor
  );
  const gastoDia25 = somar(
    gastos.filter((g) => g.salarioResponsavel === "dia25" && g.pago),
    (g) => g.valor
  );

  if (recebidoDia10 + recebidoDia25 + gastoDia10 + gastoDia25 === 0) {
    container.innerHTML = vazioHtml("Sem dados suficientes ainda.");
    return;
  }

  const categorias = [
    { rotulo: "Dia 10", valores: [recebidoDia10, gastoDia10] },
    { rotulo: "Dia 25", valores: [recebidoDia25, gastoDia25] },
  ];
  const series = [
    { nome: "Recebido", cor: "var(--cor-grafico-positivo)" },
    { nome: "Gasto pago", cor: "var(--cor-grafico-negativo)" },
  ];

  const altura = 200;
  const maxValor = Math.max(1, ...categorias.flatMap((c) => c.valores));
  const svg = novoSvg(container, altura);
  desenharGridY(svg, altura, 0, maxValor);

  const escalaY = (v) => escalaLinear(v, 0, maxValor, altura - MARGEM.baixo, MARGEM.topo);
  const larguraBanda = (LARGURA - MARGEM.esquerda - MARGEM.direita) / categorias.length;
  const larguraBarra = 24;
  const gapBarra = 4;

  categorias.forEach((cat, i) => {
    const centro = MARGEM.esquerda + larguraBanda * (i + 0.5);
    const inicio = centro - (larguraBarra * series.length + gapBarra) / 2;

    series.forEach((s, j) => {
      const valor = cat.valores[j];
      const x = inicio + j * (larguraBarra + gapBarra);
      const yTopo = escalaY(valor);
      const yBase = escalaY(0);
      const rect = svgEl("rect", { x, y: yTopo, width: larguraBarra, height: Math.max(yBase - yTopo, 0), rx: 4, fill: s.cor });
      svg.appendChild(rect);

      const conteudoTooltip = `<div>${cat.rotulo} · ${s.nome}</div><div class="grafico-tooltip__valor">${formatarMoeda(valor)}</div>`;
      rect.style.cursor = "pointer";
      rect.addEventListener("pointerenter", (e) => mostrarTooltip(e, conteudoTooltip));
      rect.addEventListener("pointermove", (e) => mostrarTooltip(e, conteudoTooltip));
      rect.addEventListener("pointerleave", esconderTooltip);

      if (valor > 0) {
        const rotuloValor = svgEl("text", { x: x + larguraBarra / 2, y: yTopo - 6, "text-anchor": "middle", style: "font-size: 10px;" });
        rotuloValor.textContent = formatarValorEixo(valor);
        svg.appendChild(rotuloValor);
      }
    });

    const rotuloCategoria = svgEl("text", { x: centro, y: altura - MARGEM.baixo + 16, "text-anchor": "middle" });
    rotuloCategoria.textContent = cat.rotulo;
    svg.appendChild(rotuloCategoria);
  });

  const legenda = document.getElementById("legenda-comparacao-salarios");
  legenda.innerHTML = series
    .map(
      (s) => `
      <span class="grafico-legenda__item">
        <span class="grafico-legenda__marca" style="background-color: ${s.cor}"></span>
        ${s.nome}
      </span>`
    )
    .join("");
}

// ==================== 5. Previsões futuras ====================

function renderizarPrevisoesFuturas(gastos) {
  const container = document.getElementById("grafico-previsoes-futuras");
  const pendentes = gastos.filter((g) => !g.pago);

  if (pendentes.length === 0) {
    container.innerHTML = vazioHtml("Nenhum gasto pendente — nada previsto para os próximos meses.");
    return;
  }

  // Agrupa por `mesReferencia` (mês do salário que vai pagar), não pela data
  // da compra — é isso que "previsão futura" precisa refletir (mesmo
  // critério do Dashboard/página Gastos, ver comentário em renderizarEvolucaoGastos).
  const mesAtual = chaveMesAtual();
  const mesesPendentes = pendentes.map((g) => g.mesReferencia).sort();
  const ultimoMes = mesesPendentes[mesesPendentes.length - 1];

  let meses = listaMeses(mesAtual, ultimoMes > mesAtual ? ultimoMes : mesAtual);
  if (meses.length > 6) meses = meses.slice(0, 6);

  const pontos = meses.map((chave) => ({
    chave,
    valor: somar(
      pendentes.filter((g) => g.mesReferencia === chave),
      (g) => g.valor
    ),
  }));

  desenharBarrasSimples(container, pontos, {
    altura: 200,
    cor: "var(--cor-grafico-negativo)",
    formatarRotulo: rotuloMesCurto,
  });
}

function desenharBarrasSimples(container, pontos, opcoes) {
  const altura = opcoes.altura;
  const maxValor = Math.max(1, ...pontos.map((p) => p.valor));
  const svg = novoSvg(container, altura);
  desenharGridY(svg, altura, 0, maxValor);

  const escalaY = (v) => escalaLinear(v, 0, maxValor, altura - MARGEM.baixo, MARGEM.topo);
  const larguraBanda = (LARGURA - MARGEM.esquerda - MARGEM.direita) / pontos.length;
  const larguraBarra = Math.min(28, larguraBanda * 0.5);

  pontos.forEach((p, i) => {
    const centro = MARGEM.esquerda + larguraBanda * (i + 0.5);
    const yTopo = escalaY(p.valor);
    const yBase = escalaY(0);
    const rect = svgEl("rect", {
      x: centro - larguraBarra / 2,
      y: yTopo,
      width: larguraBarra,
      height: Math.max(yBase - yTopo, 0),
      rx: 4,
      fill: opcoes.cor,
    });
    svg.appendChild(rect);

    const conteudoTooltip = `<div>${opcoes.formatarRotulo(p.chave)}</div><div class="grafico-tooltip__valor">${formatarMoeda(p.valor)}</div>`;
    rect.style.cursor = "pointer";
    rect.addEventListener("pointerenter", (e) => mostrarTooltip(e, conteudoTooltip));
    rect.addEventListener("pointermove", (e) => mostrarTooltip(e, conteudoTooltip));
    rect.addEventListener("pointerleave", esconderTooltip);

    if (p.valor > 0) {
      const rotuloValor = svgEl("text", { x: centro, y: yTopo - 6, "text-anchor": "middle", style: "font-weight: 600; fill: var(--cor-texto);" });
      rotuloValor.textContent = formatarValorEixo(p.valor);
      svg.appendChild(rotuloValor);
    }

    const rotuloEixo = svgEl("text", { x: centro, y: altura - MARGEM.baixo + 16, "text-anchor": "middle" });
    rotuloEixo.textContent = opcoes.formatarRotulo(p.chave);
    svg.appendChild(rotuloEixo);
  });
}

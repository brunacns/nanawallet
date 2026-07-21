import { mesDeData, somarMeses } from "./datas.js";

// Quantos meses de calendário separam duas datas "AAAA-MM-DD" (dataB - dataA).
function mesesEntreDatas(dataA, dataB) {
  const [anoA, mesA] = dataA.split("-").map(Number);
  const [anoB, mesB] = dataB.split("-").map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

// Dada uma lista de itens (gastos OU ganhos) que já usam o campo `fixoId`,
// agrupa por fixoId e gera as ocorrências que faltam até (e incluindo) `mesAlvo`.
// `criarProximo(ultimoItem, novaData)` decide o formato do novo item (cada
// módulo — gastos.js ou ganhos.js — sabe seus próprios campos).
// Retorna só os itens NOVOS (para serem persistidos pelo chamador).
export function gerarOcorrenciasFaltantes(itens, mesAlvo, criarProximo) {
  const grupos = new Map();
  for (const item of itens) {
    if (!item.fixoId) continue;
    if (!grupos.has(item.fixoId)) grupos.set(item.fixoId, []);
    grupos.get(item.fixoId).push(item);
  }

  const novos = [];
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.data.localeCompare(b.data));
    // O dia-do-mês "verdadeiro" da série é sempre o da PRIMEIRA ocorrência
    // (`primeiro`) — cada nova data soma meses a partir dela, nunca a partir
    // da última ocorrência gerada. Isso evita que um vencimento no dia 31,
    // ajustado para 28 ao passar por fevereiro, fique PRESO no dia 28 para
    // sempre (mesmo em meses de 30/31 dias) — bug real encontrado nesta
    // auditoria: encadear a partir de `ultimo` faz o ajuste de um mês curto
    // "vazar" para todos os meses seguintes, mesmo os que teriam o dia 31.
    const primeiro = grupo[0];
    let ultimo = grupo[grupo.length - 1];
    let mesesDesdeOPrimeiro = mesesEntreDatas(primeiro.data, ultimo.data);
    let protecao = 0;

    while (mesDeData(ultimo.data) < mesAlvo && protecao < 240) {
      mesesDesdeOPrimeiro++;
      const novaData = somarMeses(primeiro.data, mesesDesdeOPrimeiro);
      const novoItem = criarProximo(ultimo, novaData);
      novos.push(novoItem);
      ultimo = novoItem;
      protecao++;
    }
  }
  return novos;
}

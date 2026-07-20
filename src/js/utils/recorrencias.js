import { mesDeData, somarMeses } from "./datas.js";

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
    let ultimo = grupo[grupo.length - 1];
    let protecao = 0;

    while (mesDeData(ultimo.data) < mesAlvo && protecao < 240) {
      const novaData = somarMeses(ultimo.data, 1);
      const novoItem = criarProximo(ultimo, novaData);
      novos.push(novoItem);
      ultimo = novoItem;
      protecao++;
    }
  }
  return novos;
}

// Validação de itens vindos de FORA do fluxo normal da interface — hoje, só
// a restauração de um arquivo exportado ou de um backup automático (ver
// exportacao.js). Esse é o único ponto do app que aceita dados que não
// passaram pelos formulários (podem ter sido editados à mão, gerados por
// outra ferramenta, ou ser uma exportação antiga com um formato diferente).
//
// Correção da auditoria de 2026-08-09 (BUG-02): antes, `restaurarDeArquivo`
// só conferia que `dados.ganhos`/`gastos`/`lembretes` eram arrays — nunca o
// formato de cada item. Um item com `valor` em texto, `data` inválida ou
// `id` duplicado entrava sem nenhum aviso e corrompia silenciosamente os
// cálculos daquele mês (soma virava concatenação de string, item com data
// impossível ficava invisível para sempre em qualquer tela filtrada por mês).

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_MES = /^\d{4}-\d{2}$/;

/** true só para uma data "AAAA-MM-DD" que corresponde a um dia de calendário real (rejeita, por exemplo, 31-02-2027 e 2027-02-30). */
export function dataValida(dataISO) {
  if (typeof dataISO !== "string" || !REGEX_DATA.test(dataISO)) return false;
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

/** true só para uma chave de mês "AAAA-MM" com mês entre 01 e 12. */
export function mesValido(mesChave) {
  if (typeof mesChave !== "string" || !REGEX_MES.test(mesChave)) return false;
  const mes = Number(mesChave.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** true só para um número finito (rejeita string, NaN, Infinity, undefined). */
export function valorValido(valor) {
  return typeof valor === "number" && Number.isFinite(valor);
}

function itemBaseValido(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.titulo === "string" &&
    valorValido(item.valor) &&
    dataValida(item.data)
  );
}

/**
 * Filtra `itens` (array vindo de um arquivo importado/restaurado) mantendo só
 * os que têm o formato mínimo esperado por `colecao` ("gastos" | "ganhos" |
 * "lembretes"), e remove ids duplicados (mantém o último — mesmo critério de
 * upsert já usado em `salvarItensEmLote`, para o comportamento ser previsível
 * em vez de "depende de qual apareceu primeiro no array").
 *
 * Devolve `{ validos, descartados }` — `descartados` é a lista de `{ item,
 * motivo }` para quem chama poder informar quantos/quais itens foram
 * ignorados, em vez de aceitar tudo em silêncio.
 */
export function validarESanearItens(colecao, itens) {
  if (!Array.isArray(itens)) return { validos: [], descartados: [] };

  const descartados = [];
  const porId = new Map();

  for (const item of itens) {
    if (!itemBaseValido(item)) {
      descartados.push({ item, motivo: "campos obrigatórios ausentes ou de tipo inválido (id, título, valor ou data)" });
      continue;
    }
    if (colecao === "gastos" && item.mesReferencia !== undefined && item.mesReferencia !== null && !mesValido(item.mesReferencia)) {
      descartados.push({ item, motivo: "mesReferencia inválido" });
      continue;
    }
    porId.set(item.id, item);
  }

  return { validos: [...porId.values()], descartados };
}

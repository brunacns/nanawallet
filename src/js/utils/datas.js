const NOMES_MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOMES_MESES_COMPLETOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Extrai o dia do mês (número) de uma data "AAAA-MM-DD".
export function diaDoMes(dataISO) {
  return Number(dataISO.split("-")[2]);
}

// Soma "quantidade" meses a uma data no formato "AAAA-MM-DD", preservando o
// dia sempre que possível. Se o mês de destino não tiver esse dia (ex: dia 31
// somado a um mês de 30 dias), usa o último dia válido do mês de destino.
export function somarMeses(dataISO, quantidade) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);

  const dataAlvo = new Date(ano, mes - 1 + quantidade, 1);
  const ultimoDiaDoMesAlvo = new Date(dataAlvo.getFullYear(), dataAlvo.getMonth() + 1, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMesAlvo);

  const pad = (n) => String(n).padStart(2, "0");
  return `${dataAlvo.getFullYear()}-${pad(dataAlvo.getMonth() + 1)}-${pad(diaFinal)}`;
}

// ---------- Chaves de mês ("AAAA-MM") ----------
// Usadas para agrupar/filtrar por mês em Dashboard, Gastos e Ganhos.

export function chaveMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

// Extrai a chave de mês ("AAAA-MM") de uma data completa ("AAAA-MM-DD").
export function mesDeData(dataISO) {
  return dataISO.slice(0, 7);
}

// Chave do mês atual, segundo o relógio do sistema.
export function chaveMesAtual() {
  const agora = new Date();
  return chaveMes(agora.getFullYear(), agora.getMonth() + 1);
}

// Data de hoje em "AAAA-MM-DD", usando o horário LOCAL (não UTC — importante:
// `new Date().toISOString()` usa UTC e mostraria o dia errado à noite no Brasil).
export function hojeISO() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

export function mesSeguinte(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return mes === 12 ? chaveMes(ano + 1, 1) : chaveMes(ano, mes + 1);
}

export function mesAnterior(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return mes === 1 ? chaveMes(ano - 1, 12) : chaveMes(ano, mes - 1);
}

// "jul/26" — usado em eixos de gráfico, onde o espaço é curto.
export function rotuloMesCurto(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return `${NOMES_MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

// "julho de 2026" — usado nos seletores de mês das páginas.
export function rotuloMesLongo(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return `${NOMES_MESES_COMPLETOS[mes - 1]} de ${ano}`;
}

// "jul/2026" — mês abreviado com ano de 4 dígitos (diferente de
// rotuloMesCurto, que usa ano de 2 dígitos para caber no eixo de um
// gráfico). Usado nos cards do celular/Web, onde "Dia 15 (julho de 2026)"
// não cabe numa linha só.
export function rotuloMesAbreviado(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return `${NOMES_MESES_ABREV[mes - 1]}/${ano}`;
}

// Diferença em dias inteiros entre duas datas "AAAA-MM-DD" (dataAlvo - dataBase).
// Positivo = dataAlvo no futuro; negativo = no passado. Usa UTC nos dois lados
// só para o cálculo (ambas são datas "puras", sem hora), evitando que horário
// de verão/fuso mude a contagem de dias.
export function diferencaEmDias(dataAlvo, dataBase) {
  const [anoA, mesA, diaA] = dataAlvo.split("-").map(Number);
  const [anoB, mesB, diaB] = dataBase.split("-").map(Number);
  const alvo = Date.UTC(anoA, mesA - 1, diaA);
  const base = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((alvo - base) / 86400000);
}

// Lista de chaves de mês entre duas chaves, inclusive (ex: "2026-06".."2026-08").
export function listaMeses(chaveInicio, chaveFim) {
  const resultado = [];
  let atual = chaveInicio;
  let protecao = 0;
  while (atual <= chaveFim && protecao < 240) {
    resultado.push(atual);
    atual = mesSeguinte(atual);
    protecao++;
  }
  return resultado;
}

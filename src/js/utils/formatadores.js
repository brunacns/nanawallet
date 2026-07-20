export function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Converte "AAAA-MM-DD" para "DD/MM/AAAA"
export function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Escapa texto do usuário antes de inserir em innerHTML (evita injeção de HTML).
export function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// Converte "AAAA-MM-DDTHH:MM:SS" (ex: build-info.json) para "DD/MM/AAAA HH:MM".
export function formatarDataHora(dataHoraISO) {
  const d = new Date(dataHoraISO);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Carimbo "AAAA-MM-DD_HH-MM-SS", usado em nomes de arquivo de backup/exportação.
export function carimboDataHora() {
  const agora = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return (
    `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}` +
    `_${dois(agora.getHours())}-${dois(agora.getMinutes())}-${dois(agora.getSeconds())}`
  );
}

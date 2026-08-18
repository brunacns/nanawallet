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

// Valida que uma cor é um hex de 6 dígitos antes dela entrar num atributo
// style="" interpolado (auditoria de segurança 2026-08-16) — categoria.cor
// vem de linhas gravadas pela própria usuária, mas a RLS só
// garante QUEM pode gravar (auth.uid() = user_id), nunca O QUE é gravado no
// campo: uma chamada direta à API do Supabase (fora da interface, que só
// oferece um seletor de cores fixo) poderia gravar `cor` como
// `"><script>...` e quebrar para fora do atributo quando essa string fosse
// interpolada sem verificação. Qualquer valor que não seja um hex válido cai
// num cinza neutro seguro, sem quebrar a tela.
export function corSegura(cor) {
  return typeof cor === "string" && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#9386a9";
}

// Valida que um link/imagem é uma URL http(s) antes de entrar em href="" ou
// src="" (mesmo cuidado de corSegura) — bloqueia esquemas perigosos
// (javascript:, data:, etc.) mesmo se algo além do formulário (ex: uma
// chamada direta à API do Supabase) gravar um valor malicioso num item da
// Wishlist. Devolve a URL normalizada (já com caracteres como `"`/`<`
// percent-encoded pelo próprio parser de URL) ou `null` quando inválida —
// nesse caso a tela trata como "sem link"/"sem imagem", sem quebrar o layout.
export function urlSegura(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const analisada = new URL(url.trim());
    return analisada.protocol === "http:" || analisada.protocol === "https:" ? analisada.href : null;
  } catch {
    return null;
  }
}

// Converte uma cor hex ("#F2A65A") para rgba com a opacidade dada — usado
// para aplicar a cor pastel de cada categoria como fundo suave (estilo dos
// selos existentes), sem precisar de uma classe CSS fixa por categoria.
export function corComOpacidade(hex, alpha) {
  const valor = hex.replace("#", "");
  const r = parseInt(valor.substring(0, 2), 16);
  const g = parseInt(valor.substring(2, 4), 16);
  const b = parseInt(valor.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

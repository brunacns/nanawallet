// BUG-05 (Baixo, auditoria 2026-08-09): o texto de ajuda da seção "Lançar
// recebimento manualmente" (Ticket Alimentação) dizia "a geração automática
// mensal chega numa etapa futura" — mas essa geração automática já existe e
// funciona (implementada na Etapa 3, confirmada em teste). O texto
// desatualizado dava a entender que era preciso lançar todo mês na mão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf-8");

test("BUG-05 — o texto sobre lançamento manual não afirma mais que a recorrência automática 'chega numa etapa futura'", () => {
  assert.doesNotMatch(html, /chega numa etapa futura/i, "texto desatualizado ainda presente no HTML");
});

test("BUG-05 — o texto atual menciona a configuração 'Recorrente', deixando claro que o crédito automático já existe", () => {
  const secao = html.slice(html.indexOf("Lançar recebimento manualmente"), html.indexOf("Lançar recebimento manualmente") + 400);
  assert.match(secao, /[Rr]ecorrente/);
});

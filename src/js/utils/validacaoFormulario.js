// Mostra o balão nativo de validação do navegador (o mesmo já usado para
// "Preencha este campo" / "O valor deve ser maior ou igual a 0,01") para
// erros que o HTML sozinho não pega — como um campo de texto preenchido só
// com espaços, que passa despercebido pelo atributo `required` (espaços não
// contam como campo "vazio" para o navegador).
//
// Correção da auditoria de 2026-08-09 (BUG-04): antes, um título só com
// espaços fazia 5 formulários diferentes (Ganhos, Gastos, Lembretes, Metas,
// Parcelamento) "morrerem silenciosamente" — o `return` no meio da função de
// salvar não dava nenhum feedback, e não tinha como saber por que nada
// tinha acontecido. Reaproveitar a Constraint Validation API do próprio
// navegador (em vez de um `alert()` ou uma div de erro nova) mantém a
// experiência idêntica à validação nativa que já existia.
export function avisarCampoInvalido(campo, mensagem) {
  campo.setCustomValidity(mensagem);
  campo.reportValidity();
  // Limpa a mensagem assim que a usuária voltar a editar o campo. Sem isso,
  // corrigir o título e clicar em Salvar de novo continuaria bloqueado: a
  // verificação nativa de validade do navegador acontece ANTES do evento
  // "submit" chegar ao nosso handler (que é o único lugar que chama
  // `limparValidacao`), então uma mensagem customizada antiga nunca seria
  // limpa a tempo de permitir o reenvio, mesmo com o valor já corrigido.
  campo.addEventListener("input", () => campo.setCustomValidity(""), { once: true });
}

// Limpa uma mensagem customizada de uma tentativa de salvar anterior. Precisa
// ser chamado no INÍCIO de cada tentativa (antes de qualquer novo
// `avisarCampoInvalido`), senão o navegador considera o campo inválido pela
// mensagem antiga mesmo depois de corrigido.
export function limparValidacao(campo) {
  campo.setCustomValidity("");
}

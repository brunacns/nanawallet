// Debounce genérico: `fn` só roda depois que `atrasoMs` passar sem uma nova
// chamada. Usado onde uma ação cara (ex: re-renderizar uma tabela inteira)
// dispara a cada tecla digitada — sem isso, cada tecla refaz o trabalho
// completo, mesmo que a próxima tecla já esteja a caminho.
export function debounce(fn, atrasoMs) {
  let idTimeout = null;
  return (...args) => {
    clearTimeout(idTimeout);
    idTimeout = setTimeout(() => fn(...args), atrasoMs);
  };
}

// Detecta se o app está rodando dentro do Tauri (Desktop) ou não (Web,
// navegador comum) — usado pelas poucas telas com alguma funcionalidade
// exclusiva de arquivo local/diálogo nativo (Exportação) ou de API nativa
// do Tauri (versão do app em Configurações).
export function estaNoTauri() {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

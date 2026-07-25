// Estado compartilhado do "mês selecionado", usado pelas páginas de
// Dashboard, Gastos e Ganhos para mostrar/filtrar dados de um mês por vez.
// Começa sempre no mês atual (segundo o relógio do sistema) ao abrir o app.
import { chaveMesAtual, mesSeguinte, mesAnterior } from "./utils/datas.js";

let mesSelecionado = chaveMesAtual();
let ouvintes = [];

export function obterMesSelecionado() {
  return mesSelecionado;
}

export function definirMesSelecionado(chave) {
  mesSelecionado = chave;
  ouvintes.forEach((callback) => callback(mesSelecionado));
}

export function avancarMes() {
  definirMesSelecionado(mesSeguinte(mesSelecionado));
}

export function retrocederMes() {
  definirMesSelecionado(mesAnterior(mesSelecionado));
}

export function irParaMesAtual() {
  definirMesSelecionado(chaveMesAtual());
}

// Chamado sempre que o mês selecionado mudar (em qualquer página).
export function aoAtualizarMes(callback) {
  ouvintes.push(callback);
}

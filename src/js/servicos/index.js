import { ArmazenamentoSupabaseService } from "./ArmazenamentoSupabaseService.js";
import { TransactionService } from "./TransactionService.js";
import { ReminderService } from "./ReminderService.js";
import { GoalService } from "./GoalService.js";
import { CategoryService } from "./CategoryService.js";
import { mesDeData } from "../utils/datas.js";

// ---------------------------------------------------------------------------
// Composition root: único lugar do app que monta os serviços de domínio por
// cima do StorageService ativo (Desktop e Web: ArmazenamentoSupabaseService
// — os dois exigem conexão com o Supabase, sem fallback local; ver Fase 6/8
// da migração). Todo o resto do app (TransactionService, ReminderService,
// GoalService, e as telas em modulos/*.js) só conhece o contrato de
// StorageService — trocar a implementação concreta é mudar só este arquivo.
//
// `globalThis.__armazenamentoParaTestes`: hook usado SÓ pelos testes
// automatizados (tests/helpers/tauriFsMock.js o define antes de cada
// teste) — sem ele, os ~13 arquivos de teste que exercitam a lógica de
// negócio real (recorrências, parcelamentos, validação) através destes
// serviços passariam a bater no Supabase de verdade, sem sessão, a cada
// teste. O app de verdade nunca define essa variável, então o fallback
// (ArmazenamentoSupabaseService) é sempre o que roda fora de teste.
//
// Resolvido de forma PREGUIÇOSA (Proxy), não numa constante fixa: este
// módulo é um singleton ES (avaliado uma única vez por processo) e é
// importado, de forma transitiva, por módulos que nada têm a ver com teste
// (ex: src/js/categorias.js, para usar `categoriasService`). Se um desses
// imports acontecesse ANTES do primeiro `criarAmbienteTauri()` de uma
// suíte de testes, `armazenamentoAtivo` ficaria "congelado" na decisão
// errada para o resto do processo — mesmo bug de fundo que o Proxy de
// `fs`/`path` em dados/armazenamento.js já evita para `window.__TAURI__`.
const instanciaPadrao = new ArmazenamentoSupabaseService();
function armazenamentoAlvo() {
  return globalThis.__armazenamentoParaTestes ?? instanciaPadrao;
}
export const armazenamentoAtivo = new Proxy(
  {},
  {
    get: (_alvo, propriedade) => {
      const alvo = armazenamentoAlvo();
      const valor = alvo[propriedade];
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  }
);

// ---- Transações (gastos) ----
// Migração: gastos salvos antes da Etapa 13 não tinham mesReferencia/fixoId;
// gastos salvos antes do sistema de categorias não tinham categoriaId
// (null = sem categoria, comportamento idêntico ao de antes); gastos salvos
// antes do campo de observações não tinham `observacoes`; gastos salvos
// antes da mudança dos dias de salário (10/25 -> 15/30) ainda usam os
// valores internos antigos ("dia10"/"dia25") e são convertidos aqui.
const transacoesGastos = new TransactionService({
  colecao: "gastos",
  storage: armazenamentoAtivo,
  aplicarMigracaoCampos: (g) => {
    const item = { mesReferencia: mesDeData(g.data), fixoId: null, categoriaId: null, observacoes: "", ...g };
    if (item.salarioResponsavel === "dia10") item.salarioResponsavel = "dia15";
    else if (item.salarioResponsavel === "dia25") item.salarioResponsavel = "dia30";
    return item;
  },
  criarProximaOcorrencia: (ultimo, novaData) => ({
    id: crypto.randomUUID(),
    titulo: ultimo.titulo,
    valor: ultimo.valor,
    data: novaData,
    salarioResponsavel: ultimo.salarioResponsavel,
    mesReferencia: mesDeData(novaData),
    pago: false,
    fixo: true,
    fixoId: ultimo.fixoId,
    parcela: null,
    categoriaId: ultimo.categoriaId,
    observacoes: ultimo.observacoes,
  }),
});

// ---- Transações (ganhos) ----
// Migração: ganhos salvos antes da Etapa 13 não tinham recebido/fixo/fixoId;
// ganhos salvos antes do campo de observações não tinham `observacoes`.
// "recebido: true" preserva o comportamento antigo (já eram tratados como recebidos).
const transacoesGanhos = new TransactionService({
  colecao: "ganhos",
  storage: armazenamentoAtivo,
  aplicarMigracaoCampos: (g) => ({ recebido: true, fixo: false, fixoId: null, observacoes: "", ...g }),
  criarProximaOcorrencia: (ultimo, novaData) => ({
    id: crypto.randomUUID(),
    titulo: ultimo.titulo,
    valor: ultimo.valor,
    data: novaData,
    recebido: false,
    fixo: true,
    fixoId: ultimo.fixoId,
    observacoes: ultimo.observacoes,
  }),
});

const lembretesService = new ReminderService(armazenamentoAtivo);
const metasService = new GoalService(armazenamentoAtivo);
const categoriasService = new CategoryService(armazenamentoAtivo);

export { transacoesGastos, transacoesGanhos, lembretesService, metasService, categoriasService };

import { ArmazenamentoLocalService } from "./ArmazenamentoLocalService.js";
import { ArmazenamentoSupabaseService } from "./ArmazenamentoSupabaseService.js";
import { TransactionService } from "./TransactionService.js";
import { ReminderService } from "./ReminderService.js";
import { GoalService } from "./GoalService.js";
import { SincronizacaoService } from "../sincronizacao/SincronizacaoService.js";
import { mesDeData } from "../utils/datas.js";

// ---------------------------------------------------------------------------
// Composition root: único lugar do app que decide QUAL StorageService está
// ativo — e o único arquivo que precisa saber que existem dois ambientes
// possíveis (app Tauri no Windows, ou a PWA rodando só no navegador/iPhone,
// sem Tauri nenhum). Todo o resto do app (TransactionService, ReminderService,
// GoalService, e as telas em modulos/*.js) só conhece o contrato de
// StorageService, nunca sabe qual dos dois está por trás.
//
// - No Tauri: ArmazenamentoLocalService (arquivos JSON — o "cache local" da
//   arquitetura Tauri -> cache local -> Supabase), com sincronização em
//   segundo plano (fila offline, SincronizacaoService) para levar esses
//   dados até o Supabase.
// - Na PWA: sem Tauri, então sem arquivos locais possíveis — busca e grava
//   direto no Supabase (ArmazenamentoSupabaseService). Não existe fila
//   offline aqui: se não houver internet, a operação simplesmente falha (é
//   por isso que `sincronizacaoService` fica `null` neste modo).
// ---------------------------------------------------------------------------
const rodandoNoTauri = typeof window !== "undefined" && !!window.__TAURI__;

export const armazenamentoAtivo = rodandoNoTauri ? new ArmazenamentoLocalService() : new ArmazenamentoSupabaseService();

// ---- Transações (gastos) ----
// Migração: gastos salvos antes da Etapa 13 não tinham mesReferencia/fixoId.
const transacoesGastos = new TransactionService({
  colecao: "gastos",
  storage: armazenamentoAtivo,
  aplicarMigracaoCampos: (g) => ({ mesReferencia: mesDeData(g.data), fixoId: null, ...g }),
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
  }),
});

// ---- Transações (ganhos) ----
// Migração: ganhos salvos antes da Etapa 13 não tinham recebido/fixo/fixoId.
// "recebido: true" preserva o comportamento antigo (já eram tratados como recebidos).
const transacoesGanhos = new TransactionService({
  colecao: "ganhos",
  storage: armazenamentoAtivo,
  aplicarMigracaoCampos: (g) => ({ recebido: true, fixo: false, fixoId: null, ...g }),
  criarProximaOcorrencia: (ultimo, novaData) => ({
    id: crypto.randomUUID(),
    titulo: ultimo.titulo,
    valor: ultimo.valor,
    data: novaData,
    recebido: false,
    fixo: true,
    fixoId: ultimo.fixoId,
  }),
});

const lembretesService = new ReminderService(armazenamentoAtivo);
const metasService = new GoalService(armazenamentoAtivo);

// ---- Sincronização com o Supabase (só existe no modo Tauri) ----
// As chaves precisam bater com os nomes das tabelas/coleções ("gastos",
// "ganhos", "lembretes", "metas") — é por essa chave que o motor de
// sincronização sabe qual serviço de domínio atualizar.
export const sincronizacaoService = rodandoNoTauri
  ? new SincronizacaoService({
      gastos: transacoesGastos,
      ganhos: transacoesGanhos,
      lembretes: lembretesService,
      metas: metasService,
    })
  : null;

export { transacoesGastos, transacoesGanhos, lembretesService, metasService };

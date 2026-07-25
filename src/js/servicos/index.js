import { ArmazenamentoLocalService } from "./ArmazenamentoLocalService.js";
import { TransactionService } from "./TransactionService.js";
import { ReminderService } from "./ReminderService.js";
import { GoalService } from "./GoalService.js";
import { CategoryService } from "./CategoryService.js";
import { mesDeData } from "../utils/datas.js";

// ---------------------------------------------------------------------------
// Composition root: único lugar do app que monta os serviços de domínio por
// cima do StorageService ativo (hoje: ArmazenamentoLocalService, arquivos
// JSON locais). Todo o resto do app (TransactionService, ReminderService,
// GoalService, e as telas em modulos/*.js) só conhece o contrato de
// StorageService — trocar a implementação concreta no futuro é mudar só
// este arquivo.
// ---------------------------------------------------------------------------
export const armazenamentoAtivo = new ArmazenamentoLocalService();

// ---- Transações (gastos) ----
// Migração: gastos salvos antes da Etapa 13 não tinham mesReferencia/fixoId;
// gastos salvos antes do sistema de categorias não tinham categoriaId
// (null = sem categoria, comportamento idêntico ao de antes); gastos salvos
// antes do campo de observações não tinham `observacoes`.
const transacoesGastos = new TransactionService({
  colecao: "gastos",
  storage: armazenamentoAtivo,
  aplicarMigracaoCampos: (g) => ({ mesReferencia: mesDeData(g.data), fixoId: null, categoriaId: null, observacoes: "", ...g }),
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

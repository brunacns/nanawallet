import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para metas/wishlist. Assim como ReminderService, usa só
// o CRUD genérico de ColecaoService — a diferença de "metas" ser guardada
// como arquivo único (não particionado por mês) fica escondida dentro de
// ArmazenamentoLocalService, invisível aqui.
export class GoalService extends ColecaoService {
  constructor(storage) {
    super({
      colecao: "metas",
      storage,
      // Migração: metas salvas antes do aporte mensal automático não têm
      // esses dois campos. `ultimoAporteAplicado: null` faz `sincronizarAportes`
      // (metas.js) tratar como "nunca aplicado" — não credita nada
      // retroativamente, só passa a contar a partir do mês em que o app
      // reabrir (mesmo espírito da migração de gastos/ganhos fixos da Etapa 13).
      aplicarMigracaoCampos: (m) => ({ aporteMensal: 0, ultimoAporteAplicado: null, ...m }),
    });
  }
}

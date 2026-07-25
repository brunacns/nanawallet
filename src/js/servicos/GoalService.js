import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para metas/wishlist. Assim como ReminderService, usa só
// o CRUD genérico de ColecaoService — a diferença de "metas" ser guardada
// como arquivo único (não particionado por mês) fica escondida dentro de
// ArmazenamentoLocalService, invisível aqui.
export class GoalService extends ColecaoService {
  constructor(storage) {
    super({ colecao: "metas", storage });
  }
}

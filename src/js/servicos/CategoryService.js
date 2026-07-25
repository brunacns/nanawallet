import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para categorias de despesas. Assim como GoalService, usa
// só o CRUD genérico de ColecaoService — a diferença de "categorias" ser
// guardada como arquivo único (não particionado por mês) fica escondida
// dentro de ArmazenamentoLocalService, invisível aqui. O CRUD genérico já
// herdado (salvar/remover) é o que permite, no futuro, uma tela de categorias
// personalizadas sem precisar refatorar nada desta classe.
export class CategoryService extends ColecaoService {
  constructor(storage) {
    super({ colecao: "categorias", storage });
  }
}

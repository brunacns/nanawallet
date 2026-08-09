import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para carteiras (conta bancária, dinheiro, benefícios
// como Ticket Alimentação). Assim como CategoryService/GoalService, usa só o
// CRUD genérico de ColecaoService — a diferença de "carteiras" ser guardada
// como arquivo único (não particionado por mês) fica escondida dentro de
// ArmazenamentoLocalService, invisível aqui. Isso é o que permite, no
// futuro, adicionar outros tipos de benefício (ex: Vale Cultura) sem
// precisar refazer nenhuma camada de dados/serviços — só a interface.
export class CarteiraService extends ColecaoService {
  constructor(storage) {
    super({ colecao: "carteiras", storage });
  }
}

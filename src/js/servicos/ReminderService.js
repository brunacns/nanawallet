import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para lembretes. Não precisa de nada além do CRUD
// genérico de ColecaoService — lembretes não têm recorrência automática
// (diferente de gastos/ganhos fixos) nem migração de campos pendente.
export class ReminderService extends ColecaoService {
  constructor(storage) {
    super({ colecao: "lembretes", storage });
  }
}

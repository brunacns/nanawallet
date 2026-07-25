import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para lembretes. Não precisa de nada além do CRUD
// genérico de ColecaoService — lembretes não têm recorrência automática
// (diferente de gastos/ganhos fixos).
export class ReminderService extends ColecaoService {
  constructor(storage) {
    super({
      colecao: "lembretes",
      storage,
      // Migração: lembretes salvos antes do campo de observações não têm `observacoes`.
      aplicarMigracaoCampos: (l) => ({ observacoes: "", ...l }),
    });
  }
}

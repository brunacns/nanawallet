import { ColecaoService } from "./ColecaoService.js";
import { gerarEntradasFaltantes } from "../utils/recorrenciaCarteira.js";

// Serviço de domínio para as ENTRADAS (créditos) de carteiras de benefício —
// ex: o crédito mensal do Ticket Alimentação. De propósito, NUNCA um ganho:
// dinheiro de benefício não é renda (regra de ouro do sistema de carteiras).
// Gastos feitos com uma carteira de benefício continuam em `gastos.json`
// normalmente (só marcados com `carteiraId`) — esta coleção guarda só o lado
// da entrada.
export class CarteiraEntradaService extends ColecaoService {
  constructor(storage) {
    super({ colecao: "carteiraMovimentacoes", storage });
  }

  // Garante que toda carteira de benefício ativa e recorrente tenha a
  // entrada automática gerada até `mesAlvo` ("AAAA-MM"), sem duplicar meses
  // que já têm uma entrada (manual ou automática). Devolve as entradas
  // novas (pode ser array vazio). Quem chama decide até que mês sincronizar
  // (normalmente o maior entre o mês atual real e o mês navegado).
  async sincronizarEntradas(carteiras, mesAlvo) {
    const novas = gerarEntradasFaltantes(carteiras, this._itens, mesAlvo);
    if (novas.length > 0) {
      await this.salvarEmLote(novas);
    }
    return novas;
  }
}

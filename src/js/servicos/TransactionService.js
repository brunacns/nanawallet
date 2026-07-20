import { ColecaoService } from "./ColecaoService.js";
import { gerarOcorrenciasFaltantes } from "../utils/recorrencias.js";

// Serviço de domínio para "transações" (gastos e ganhos são tratados pelo
// mesmo tipo de serviço — só muda a coleção e as regras específicas de cada
// uma, recebidas no construtor). Além do CRUD genérico de ColecaoService,
// cuida da geração automática de ocorrências de itens fixos (aluguel,
// salário mensal, etc.).
export class TransactionService extends ColecaoService {
  /**
   * @param {object} opcoes - mesmas de ColecaoService, mais:
   * @param {(ultimo: object, novaData: string) => object} opcoes.criarProximaOcorrencia -
   *   dado o último item de uma série fixa e a próxima data, monta o novo item
   *   (campos específicos de gasto ou de ganho — decidido por quem instancia o serviço).
   */
  constructor({ colecao, storage, aplicarMigracaoCampos, criarProximaOcorrencia }) {
    super({ colecao, storage, aplicarMigracaoCampos });
    this.criarProximaOcorrencia = criarProximaOcorrencia;
  }

  // Garante que toda transação fixa (fixoId preenchido) tenha uma ocorrência
  // gerada até `mesAlvo` ("AAAA-MM"). Devolve os itens novos (pode ser
  // array vazio). Quem chama decide até que mês sincronizar (normalmente o
  // maior entre o mês atual real e o mês que o usuário está navegando).
  async sincronizarRecorrencias(mesAlvo) {
    const novos = gerarOcorrenciasFaltantes(this._itens, mesAlvo, this.criarProximaOcorrencia);
    if (novos.length > 0) {
      await this.salvarEmLote(novos);
    }
    return novos;
  }
}

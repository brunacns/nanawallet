// Contrato que qualquer camada de armazenamento precisa cumprir — hoje
// implementado por ArmazenamentoLocalService (arquivos JSON locais). Manter
// esse contrato separado dos serviços de domínio (TransactionService,
// ReminderService, GoalService) e das telas é o que permite trocar como os
// dados são persistidos sem tocar no resto do app — só a linha em
// servicos/index.js que decide qual StorageService está ativo.
//
// JavaScript puro não tem "interface" nativa (e o projeto não usa
// TypeScript). Por isso esse contrato é uma classe-base cujos métodos
// lançam erro se não forem sobrescritos — um padrão comum mesmo em
// bibliotecas JS puras para deixar a interface explícita e verificável em
// tempo de execução, não só documentada em comentário.
//
// De propósito, este contrato NÃO menciona nada específico de arquivo local
// (particionamento por mês, backups, etc.) — isso é detalhe de
// implementação da ArmazenamentoLocalService. Uma "coleção" aqui é só um
// nome lógico ("gastos", "ganhos", "lembretes"); um "config" é um valor
// único não-coleção ("configuracoes", "metas").
export class StorageService {
  /** Prepara o armazenamento para uso (migrações, criação de pastas/arquivos). */
  async inicializar() {
    throw new Error(`${this.constructor.name}.inicializar() não implementado`);
  }

  /** Lista todos os itens de uma coleção. */
  async listar(colecao) {
    throw new Error(`${this.constructor.name}.listar() não implementado`);
  }

  /** Cria ou atualiza um item (identificado por item.id). Devolve o item salvo. */
  async salvar(colecao, item) {
    throw new Error(`${this.constructor.name}.salvar() não implementado`);
  }

  /** Cria ou atualiza vários itens de uma vez (ex: parcelas de um parcelamento). */
  async salvarEmLote(colecao, itens) {
    throw new Error(`${this.constructor.name}.salvarEmLote() não implementado`);
  }

  /** Remove um item pelo id. */
  async remover(colecao, id) {
    throw new Error(`${this.constructor.name}.remover() não implementado`);
  }

  /** Substitui a coleção inteira (usado só em restauração/importação em massa). */
  async substituirTudo(colecao, itens) {
    throw new Error(`${this.constructor.name}.substituirTudo() não implementado`);
  }

  /** Lê um valor de configuração único, não-coleção (ex: "configuracoes", "metas"). */
  async lerConfig(nome) {
    throw new Error(`${this.constructor.name}.lerConfig() não implementado`);
  }

  /** Grava um valor de configuração único, não-coleção. */
  async salvarConfig(nome, conteudo) {
    throw new Error(`${this.constructor.name}.salvarConfig() não implementado`);
  }
}

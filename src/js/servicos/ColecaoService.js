// Base reutilizável para serviços de domínio que gerenciam uma coleção de
// itens (gastos, ganhos, lembretes, metas): mantém o estado em memória,
// delega toda leitura/escrita para um StorageService, e avisa quem estiver
// inscrito (aoAtualizar) sempre que os dados mudarem — o mesmo papel que
// obterX()/aoAtualizarX() faziam espalhados dentro de cada módulo de UI,
// agora centralizado aqui.
//
// TransactionService, ReminderService e GoalService estendem esta classe;
// TransactionService adiciona por cima a lógica de recorrências (gastos e
// ganhos fixos), que lembretes/metas não têm.
export class ColecaoService {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.colecao - nome lógico da coleção ("gastos", "ganhos", "lembretes", "metas")
   * @param {import("./StorageService.js").StorageService} opcoes.storage
   * @param {(itemBruto: object) => object} [opcoes.aplicarMigracaoCampos] - preenche campos que
   *   itens salvos por versões antigas do app podem não ter (ver Etapa 13). Se omitido, não migra nada.
   */
  constructor({ colecao, storage, aplicarMigracaoCampos }) {
    this.colecao = colecao;
    this.storage = storage;
    this.aplicarMigracaoCampos = aplicarMigracaoCampos ?? ((item) => item);
    this._itens = [];
    this._callbacks = [];
  }

  /** Registra um ouvinte, chamado toda vez que a coleção mudar (com o array atual). */
  aoAtualizar(callback) {
    this._callbacks.push(callback);
  }

  /** Snapshot atual em memória (já carregado por `listar`/`recarregar`). */
  obterTodos() {
    return this._itens;
  }

  /** Carrega a coleção do armazenamento, aplica migração de campos e notifica os ouvintes. */
  async listar() {
    const brutos = await this.storage.listar(this.colecao);
    this._itens = brutos.map(this.aplicarMigracaoCampos);
    this._notificar();
    return this._itens;
  }

  /** Alias de `listar` — nome mais claro quando usado após uma restauração de backup. */
  async recarregar() {
    return this.listar();
  }

  /** Cria ou atualiza um item (identificado por item.id). */
  async salvar(item) {
    await this.storage.salvar(this.colecao, item);
    const indice = this._itens.findIndex((i) => i.id === item.id);
    if (indice >= 0) this._itens[indice] = item;
    else this._itens.push(item);
    this._notificar();
    return item;
  }

  /** Cria ou atualiza vários itens de uma vez (ex: parcelas de um parcelamento). */
  async salvarEmLote(itens) {
    await this.storage.salvarEmLote(this.colecao, itens);
    // Upsert por id (igual a `salvar`) — não apenas `push`, para não duplicar
    // em memória caso algum chamador reenvie um id que já existe em `_itens`
    // (o armazenamento em arquivo já deduplica por id; o estado em memória
    // precisa fazer o mesmo, senão os dois ficam fora de sincronia).
    const porId = new Map(this._itens.map((i) => [i.id, i]));
    for (const item of itens) porId.set(item.id, item);
    this._itens = [...porId.values()];
    this._notificar();
  }

  /** Remove um item pelo id. */
  async remover(id) {
    await this.storage.remover(this.colecao, id);
    this._itens = this._itens.filter((i) => i.id !== id);
    this._notificar();
  }

  _notificar() {
    this._callbacks.forEach((callback) => callback(this._itens));
  }
}

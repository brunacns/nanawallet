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
//
// Desde a etapa de sincronização: toda mutação feita pela USUÁRIA (salvar,
// salvarEmLote, remover) carimba `atualizadoEm` e avisa `aoMutar` — é assim
// que o SincronizacaoService sabe o que precisa enviar pro Supabase, sem
// este arquivo precisar saber que sincronização existe. Mutações que vêm DE
// FORA (dados puxados do servidor) usam `aplicarRemoto`/`removerRemoto`, que
// não carimbam nem avisam `aoMutar` — senão o dado sincronizado pareceria
// uma edição nova da usuária e voltaria pra fila de envio.
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
    this._callbacksMutacao = [];
  }

  /** Registra um ouvinte, chamado toda vez que a coleção mudar (com o array atual). */
  aoAtualizar(callback) {
    this._callbacks.push(callback);
  }

  /**
   * Registra um ouvinte de mutações da usuária (não de dados sincronizados
   * vindos do servidor) — usado pela fila offline de sincronização.
   * Callback recebe `{ colecao, operacao: "salvar"|"remover"|"salvarEmLote", item|itens|id }`.
   */
  aoMutar(callback) {
    this._callbacksMutacao.push(callback);
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
    item.atualizadoEm = new Date().toISOString();
    await this.storage.salvar(this.colecao, item);
    const indice = this._itens.findIndex((i) => i.id === item.id);
    if (indice >= 0) this._itens[indice] = item;
    else this._itens.push(item);
    this._notificarMutacao({ colecao: this.colecao, operacao: "salvar", item });
    this._notificar();
    return item;
  }

  /** Cria ou atualiza vários itens de uma vez (ex: parcelas de um parcelamento). */
  async salvarEmLote(itens) {
    const agora = new Date().toISOString();
    itens.forEach((item) => {
      item.atualizadoEm = agora;
    });
    await this.storage.salvarEmLote(this.colecao, itens);
    this._itens.push(...itens);
    this._notificarMutacao({ colecao: this.colecao, operacao: "salvarEmLote", itens });
    this._notificar();
  }

  /** Remove um item pelo id. */
  async remover(id) {
    await this.storage.remover(this.colecao, id);
    this._itens = this._itens.filter((i) => i.id !== id);
    this._notificarMutacao({ colecao: this.colecao, operacao: "remover", id });
    this._notificar();
  }

  /**
   * Aplica localmente um item que veio do servidor durante uma sincronização
   * (não da usuária) — grava como está, sem trocar `atualizadoEm` nem
   * reenfileirar para envio (isso re-enviaria pro servidor o mesmo dado que
   * acabou de vir de lá).
   */
  async aplicarRemoto(item) {
    await this.storage.salvar(this.colecao, item);
    const indice = this._itens.findIndex((i) => i.id === item.id);
    if (indice >= 0) this._itens[indice] = item;
    else this._itens.push(item);
    this._notificar();
  }

  /** Remove localmente um item que foi excluído no servidor (tombstone recebido na sincronização). */
  async removerRemoto(id) {
    await this.storage.remover(this.colecao, id);
    this._itens = this._itens.filter((i) => i.id !== id);
    this._notificar();
  }

  _notificar() {
    this._callbacks.forEach((callback) => callback(this._itens));
  }

  _notificarMutacao(evento) {
    this._callbacksMutacao.forEach((callback) => callback(evento));
  }
}

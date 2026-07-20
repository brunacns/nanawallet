import { StorageService } from "./StorageService.js";
import * as armazenamento from "../dados/armazenamento.js";

// Coleções particionadas por mês (ver Etapa de "nova arquitetura de
// armazenamento") — precisam do índice interno id -> anoMes (ver abaixo).
const COLECOES_PARTICIONADAS = new Set(["gastos", "ganhos", "lembretes"]);
// "metas" também é uma coleção (lista de itens com id) do ponto de vista de
// quem usa StorageService, mas por baixo continua um arquivo único (não
// cresce por mês como gastos/ganhos/lembretes) — ver dados/armazenamento.js.
const COLECOES_ARQUIVO_UNICO = new Set(["metas"]);
// "configuracoes" NÃO é uma coleção (não é uma lista de itens com id, é um
// objeto único de preferências) — por isso usa lerConfig/salvarConfig, não
// listar/salvar/remover.
const CONFIGS_CONHECIDAS = new Set(["configuracoes"]);

// Única implementação de StorageService do app (armazenamento 100% local em
// arquivos JSON — dados/armazenamento.js continua sendo o "motor" de
// leitura/escrita em disco; esta classe só adapta esse motor ao contrato
// genérico de StorageService, escondendo da camada de cima tanto o
// particionamento por mês quanto a distinção "arquivo único x particionado").
//
// O particionamento por mês precisa saber, ao editar/remover um item, em
// qual arquivo (mês) ele estava ANTES da mudança (ver `resolverAnoMes` em
// dados/armazenamento.js). Como o contrato genérico de StorageService não
// expõe esse conceito, esta classe mantém um pequeno índice interno
// (id -> anoMes) por coleção, alimentado a cada `listar`/`salvar`/`remover` —
// puramente um detalhe de implementação, invisível para quem consome
// StorageService (TransactionService, ReminderService, GoalService).
export class ArmazenamentoLocalService extends StorageService {
  constructor() {
    super();
    this._indicePorColecao = new Map();
  }

  async inicializar() {
    await armazenamento.inicializar();
  }

  async listar(colecao) {
    if (COLECOES_PARTICIONADAS.has(colecao)) {
      const itens = await armazenamento.carregarColecao(colecao);
      this._reconstruirIndice(colecao, itens);
      return itens;
    }
    if (COLECOES_ARQUIVO_UNICO.has(colecao)) {
      return (await this._lerArquivoDaColecao(colecao))[colecao];
    }
    throw new Error(`"${colecao}" não é uma coleção — use lerConfig/salvarConfig.`);
  }

  async salvar(colecao, item) {
    if (COLECOES_PARTICIONADAS.has(colecao)) {
      const indice = this._obterIndice(colecao);
      const anoMesAntigo = indice.get(item.id) ?? null;
      await armazenamento.salvarItem(colecao, item, anoMesAntigo);
      indice.set(item.id, armazenamento.resolverAnoMes(colecao, item));
      return item;
    }
    if (COLECOES_ARQUIVO_UNICO.has(colecao)) {
      const itens = (await this._lerArquivoDaColecao(colecao))[colecao];
      const indice = itens.findIndex((i) => i.id === item.id);
      if (indice >= 0) itens[indice] = item;
      else itens.push(item);
      await this._salvarArquivoDaColecao(colecao, itens);
      return item;
    }
    throw new Error(`"${colecao}" não é uma coleção — use lerConfig/salvarConfig.`);
  }

  async salvarEmLote(colecao, itens) {
    if (COLECOES_PARTICIONADAS.has(colecao)) {
      await armazenamento.salvarItensEmLote(colecao, itens);
      const indice = this._obterIndice(colecao);
      for (const item of itens) indice.set(item.id, armazenamento.resolverAnoMes(colecao, item));
      return;
    }
    if (COLECOES_ARQUIVO_UNICO.has(colecao)) {
      const existentes = (await this._lerArquivoDaColecao(colecao))[colecao];
      const porId = new Map(existentes.map((i) => [i.id, i]));
      for (const item of itens) porId.set(item.id, item);
      await this._salvarArquivoDaColecao(colecao, [...porId.values()]);
      return;
    }
    throw new Error(`"${colecao}" não é uma coleção — use lerConfig/salvarConfig.`);
  }

  async remover(colecao, id) {
    if (COLECOES_PARTICIONADAS.has(colecao)) {
      const indice = this._obterIndice(colecao);
      let anoMes = indice.get(id);

      if (!anoMes) {
        // Fallback defensivo: só acontece se `remover` for chamado sem um
        // `listar` antes (não é o fluxo normal do app), procurando o item em
        // todos os meses já gravados.
        const todos = await armazenamento.carregarColecao(colecao);
        const item = todos.find((i) => i.id === id);
        anoMes = item ? armazenamento.resolverAnoMes(colecao, item) : null;
      }

      if (anoMes) await armazenamento.removerItem(colecao, id, anoMes);
      indice.delete(id);
      return;
    }
    if (COLECOES_ARQUIVO_UNICO.has(colecao)) {
      const itens = (await this._lerArquivoDaColecao(colecao))[colecao];
      await this._salvarArquivoDaColecao(
        colecao,
        itens.filter((i) => i.id !== id)
      );
      return;
    }
    throw new Error(`"${colecao}" não é uma coleção — use lerConfig/salvarConfig.`);
  }

  async substituirTudo(colecao, itens) {
    if (COLECOES_PARTICIONADAS.has(colecao)) {
      await armazenamento.salvarColecaoCompleta(colecao, itens);
      this._reconstruirIndice(colecao, itens);
      return;
    }
    if (COLECOES_ARQUIVO_UNICO.has(colecao)) {
      await this._salvarArquivoDaColecao(colecao, itens);
      return;
    }
    throw new Error(`"${colecao}" não é uma coleção — use lerConfig/salvarConfig.`);
  }

  async lerConfig(nome) {
    this._exigirConfigConhecida(nome);
    return armazenamento.lerConfiguracoes();
  }

  async salvarConfig(nome, conteudo) {
    this._exigirConfigConhecida(nome);
    return armazenamento.salvarConfiguracoes(conteudo);
  }

  // ---------- Detalhes internos (não fazem parte do contrato StorageService) ----------

  _obterIndice(colecao) {
    if (!this._indicePorColecao.has(colecao)) this._indicePorColecao.set(colecao, new Map());
    return this._indicePorColecao.get(colecao);
  }

  _reconstruirIndice(colecao, itens) {
    const indice = new Map();
    for (const item of itens) indice.set(item.id, armazenamento.resolverAnoMes(colecao, item));
    this._indicePorColecao.set(colecao, indice);
  }

  async _lerArquivoDaColecao(colecao) {
    if (colecao === "metas") return armazenamento.lerMetas();
    throw new Error(`Coleção de arquivo único desconhecida: "${colecao}".`);
  }

  async _salvarArquivoDaColecao(colecao, itens) {
    if (colecao === "metas") return armazenamento.salvarMetas({ versao: 1, metas: itens });
    throw new Error(`Coleção de arquivo único desconhecida: "${colecao}".`);
  }

  _exigirConfigConhecida(nome) {
    if (!CONFIGS_CONHECIDAS.has(nome)) throw new Error(`Config desconhecida: "${nome}".`);
  }
}

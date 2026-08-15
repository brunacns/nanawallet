import { StorageService } from "./StorageService.js";
import { postgrestSelect, postgrestUpsert, postgrestDelete } from "../supabase/clienteSupabase.js";

// Mapeamento entre o formato usado pelas telas/serviços de domínio (JS,
// camelCase, alguns campos aninhados como `parcela`/`beneficio`) e as
// colunas reais das tabelas no Postgres (snake_case, achatadas). Cada
// coleção tem seu próprio par paraLinha/paraItem porque as diferenças não
// são uniformes o suficiente para um conversor genérico (ex: `parcela` vira
// 3 colunas, `beneficio` vira 5, e várias colunas têm nome igual ao campo).
const REGISTRO = {
  gastos: {
    tabela: "gastos",
    paraLinha: (g) => ({
      id: g.id,
      titulo: g.titulo,
      data: g.data,
      valor: g.valor,
      salario_responsavel: g.salarioResponsavel,
      mes_referencia: g.mesReferencia,
      pago: g.pago,
      fixo: g.fixo,
      fixo_id: g.fixoId,
      parcela_numero: g.parcela?.numero ?? null,
      parcela_total: g.parcela?.total ?? null,
      parcelamento_id: g.parcela?.parcelamentoId ?? null,
      categoria_id: g.categoriaId,
      carteira_id: g.carteiraId,
      observacoes: g.observacoes,
    }),
    paraItem: (r) => ({
      id: r.id,
      titulo: r.titulo,
      data: r.data,
      valor: Number(r.valor),
      salarioResponsavel: r.salario_responsavel,
      mesReferencia: r.mes_referencia,
      pago: r.pago,
      fixo: r.fixo,
      fixoId: r.fixo_id,
      parcela: r.parcela_numero != null ? { numero: r.parcela_numero, total: r.parcela_total, parcelamentoId: r.parcelamento_id } : null,
      categoriaId: r.categoria_id,
      carteiraId: r.carteira_id,
      observacoes: r.observacoes,
    }),
  },
  ganhos: {
    tabela: "ganhos",
    paraLinha: (g) => ({
      id: g.id,
      titulo: g.titulo,
      data: g.data,
      valor: g.valor,
      recebido: g.recebido,
      fixo: g.fixo,
      fixo_id: g.fixoId,
      observacoes: g.observacoes,
    }),
    paraItem: (r) => ({
      id: r.id,
      titulo: r.titulo,
      data: r.data,
      valor: Number(r.valor),
      recebido: r.recebido,
      fixo: r.fixo,
      fixoId: r.fixo_id,
      observacoes: r.observacoes,
    }),
  },
  lembretes: {
    tabela: "lembretes",
    paraLinha: (l) => ({
      id: l.id,
      titulo: l.titulo,
      data: l.data,
      valor: l.valor,
      concluido: l.concluido,
      observacoes: l.observacoes,
    }),
    paraItem: (r) => ({
      id: r.id,
      titulo: r.titulo,
      data: r.data,
      valor: Number(r.valor),
      concluido: r.concluido,
      observacoes: r.observacoes,
    }),
  },
  metas: {
    tabela: "metas",
    paraLinha: (m) => ({
      id: m.id,
      nome: m.nome,
      valor_desejado: m.valorDesejado,
      prioridade: m.prioridade,
      observacoes: m.observacoes,
    }),
    paraItem: (r) => ({
      id: r.id,
      nome: r.nome,
      valorDesejado: Number(r.valor_desejado),
      prioridade: r.prioridade,
      observacoes: r.observacoes,
    }),
  },
  categorias: {
    tabela: "categorias",
    paraLinha: (c) => ({ id: c.id, nome: c.nome, emoji: c.emoji, cor: c.cor }),
    paraItem: (r) => ({ id: r.id, nome: r.nome, emoji: r.emoji, cor: r.cor }),
  },
  carteiras: {
    tabela: "carteiras",
    paraLinha: (c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      emoji: c.emoji,
      cor: c.cor,
      ativa: c.ativa,
      beneficio_valor_mensal: c.beneficio?.valorMensal ?? null,
      beneficio_dia_recebimento: c.beneficio?.diaRecebimento ?? null,
      beneficio_recorrente: c.beneficio?.recorrente ?? null,
      beneficio_acumula_saldo: c.beneficio?.acumulaSaldo ?? null,
      beneficio_ativo_desde: c.beneficio?.ativoDesde ?? null,
    }),
    paraItem: (r) => ({
      id: r.id,
      nome: r.nome,
      tipo: r.tipo,
      emoji: r.emoji,
      cor: r.cor,
      ativa: r.ativa,
      beneficio:
        r.tipo === "beneficio"
          ? {
              valorMensal: Number(r.beneficio_valor_mensal),
              diaRecebimento: r.beneficio_dia_recebimento,
              recorrente: r.beneficio_recorrente,
              acumulaSaldo: r.beneficio_acumula_saldo,
              ativoDesde: r.beneficio_ativo_desde,
            }
          : null,
    }),
  },
  carteiraMovimentacoes: {
    tabela: "carteira_movimentacoes",
    paraLinha: (m) => ({
      id: m.id,
      carteira_id: m.carteiraId,
      valor: m.valor,
      data: m.data,
      automatica: m.automatica,
      observacoes: m.observacoes,
    }),
    paraItem: (r) => ({
      id: r.id,
      carteiraId: r.carteira_id,
      valor: Number(r.valor),
      data: r.data,
      automatica: r.automatica,
      observacoes: r.observacoes,
    }),
  },
};

const CONFIGS_CONHECIDAS = new Set(["configuracoes"]);

// Implementação de StorageService que fala com o Supabase em vez de arquivo
// local. Bem mais simples que ArmazenamentoLocalService: não existe
// particionamento por mês (isso era só uma otimização de arquivo local —
// ver Fase 6/CLAUDE.md), então não precisa de índice interno id -> mês nem
// de descobrir "onde o item estava antes" ao editar.
export class ArmazenamentoSupabaseService extends StorageService {
  async inicializar() {
    // Nada a preparar: tabelas, RLS e policies já existem no Supabase
    // (criadas via migration, fora do app). Mantido só para cumprir o
    // contrato StorageService, que main.js chama incondicionalmente.
  }

  async listar(colecao) {
    const def = this._definicao(colecao);
    const linhas = await postgrestSelect(def.tabela);
    return linhas.map(def.paraItem);
  }

  async salvar(colecao, item) {
    const def = this._definicao(colecao);
    const linhas = await postgrestUpsert(def.tabela, [def.paraLinha(item)]);
    return def.paraItem(linhas[0]);
  }

  async salvarEmLote(colecao, itens) {
    const def = this._definicao(colecao);
    await postgrestUpsert(def.tabela, itens.map(def.paraLinha));
  }

  async remover(colecao, id) {
    const def = this._definicao(colecao);
    await postgrestDelete(def.tabela, `id=eq.${id}`);
  }

  // Usado só em restauração/importação em massa (ver exportacao.js) — apaga
  // tudo que a usuária logada tem nessa tabela (RLS garante que o DELETE
  // nunca alcança linha de outra pessoa) e regrava o conjunto novo.
  async substituirTudo(colecao, itens) {
    const def = this._definicao(colecao);
    await postgrestDelete(def.tabela, "id=not.is.null");
    if (itens.length > 0) await postgrestUpsert(def.tabela, itens.map(def.paraLinha));
  }

  // "configuracoes" é uma linha só por usuária (user_id é a própria chave
  // primária da tabela) — por isso não usa o registro genérico de coleção.
  async lerConfig(nome) {
    this._exigirConfigConhecida(nome);
    const linhas = await postgrestSelect("configuracoes");
    return { versao: 1, configuracoes: linhas[0]?.dados ?? {} };
  }

  async salvarConfig(nome, conteudo) {
    this._exigirConfigConhecida(nome);
    await postgrestUpsert("configuracoes", [{ dados: conteudo.configuracoes }]);
  }

  _definicao(colecao) {
    const def = REGISTRO[colecao];
    if (!def) throw new Error(`Coleção desconhecida: "${colecao}".`);
    return def;
  }

  _exigirConfigConhecida(nome) {
    if (!CONFIGS_CONHECIDAS.has(nome)) throw new Error(`Config desconhecida: "${nome}".`);
  }
}

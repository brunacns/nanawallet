// Converte entre o formato local (camelCase, ver MODELOS-DE-DADOS.md) e as
// colunas das tabelas no Supabase (snake_case, ver a migração
// "criar_tabelas_sincronizacao"). Mantido explícito por coleção (em vez de
// uma conversão genérica camelCase<->snake_case) porque são poucos campos e
// fixos — mais fácil de ler e de manter do que uma função "esperta" genérica.
export const conversores = {
  gastos: {
    paraLinha: (g, userId) => ({
      id: g.id,
      user_id: userId,
      titulo: g.titulo,
      valor: g.valor,
      data: g.data,
      salario_responsavel: g.salarioResponsavel,
      mes_referencia: g.mesReferencia,
      pago: g.pago,
      fixo: g.fixo,
      fixo_id: g.fixoId,
      parcela: g.parcela,
      atualizado_em: g.atualizadoEm,
    }),
    paraLocal: (linha) => ({
      id: linha.id,
      titulo: linha.titulo,
      valor: Number(linha.valor),
      data: linha.data,
      salarioResponsavel: linha.salario_responsavel,
      mesReferencia: linha.mes_referencia,
      pago: linha.pago,
      fixo: linha.fixo,
      fixoId: linha.fixo_id,
      parcela: linha.parcela,
      atualizadoEm: linha.atualizado_em,
    }),
  },

  ganhos: {
    paraLinha: (g, userId) => ({
      id: g.id,
      user_id: userId,
      titulo: g.titulo,
      valor: g.valor,
      data: g.data,
      recebido: g.recebido,
      fixo: g.fixo,
      fixo_id: g.fixoId,
      atualizado_em: g.atualizadoEm,
    }),
    paraLocal: (linha) => ({
      id: linha.id,
      titulo: linha.titulo,
      valor: Number(linha.valor),
      data: linha.data,
      recebido: linha.recebido,
      fixo: linha.fixo,
      fixoId: linha.fixo_id,
      atualizadoEm: linha.atualizado_em,
    }),
  },

  lembretes: {
    paraLinha: (l, userId) => ({
      id: l.id,
      user_id: userId,
      titulo: l.titulo,
      valor: l.valor,
      data: l.data,
      concluido: l.concluido,
      atualizado_em: l.atualizadoEm,
    }),
    paraLocal: (linha) => ({
      id: linha.id,
      titulo: linha.titulo,
      valor: Number(linha.valor),
      data: linha.data,
      concluido: linha.concluido,
      atualizadoEm: linha.atualizado_em,
    }),
  },

  metas: {
    paraLinha: (m, userId) => ({
      id: m.id,
      user_id: userId,
      nome: m.nome,
      valor_desejado: m.valorDesejado,
      valor_guardado: m.valorGuardado,
      prioridade: m.prioridade,
      observacoes: m.observacoes || null,
      atualizado_em: m.atualizadoEm,
    }),
    paraLocal: (linha) => ({
      id: linha.id,
      nome: linha.nome,
      valorDesejado: Number(linha.valor_desejado),
      valorGuardado: Number(linha.valor_guardado),
      prioridade: linha.prioridade,
      observacoes: linha.observacoes || "",
      atualizadoEm: linha.atualizado_em,
    }),
  },
};

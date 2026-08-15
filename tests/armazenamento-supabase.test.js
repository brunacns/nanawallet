// Testa ArmazenamentoSupabaseService (Fase 10 da migração para Supabase)
// mockando global.fetch — sem bater no Supabase de verdade, mesmo espírito
// do mock de window.__TAURI__.fs usado para ArmazenamentoLocalService.
// Cobre principalmente o mapeamento camelCase <-> snake_case por coleção,
// que é a parte com risco real de erro silencioso (ex: um campo esquecido
// não dá erro, só "some" nos dados salvos).
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ArmazenamentoSupabaseService } from "../src/js/servicos/ArmazenamentoSupabaseService.js";
import { definirSessao, limparSessao } from "../src/js/supabase/sessao.js";

// localStorage não existe em Node puro — sessao.js depende dele.
function instalarLocalStorageFalso() {
  const dados = new Map();
  globalThis.localStorage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
}

function instalarFetchFalso(respostasPorChamada) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    chamadas.push({ url, opcoes });
    const resposta = respostasPorChamada[chamadas.length - 1];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(resposta),
    };
  };
  return chamadas;
}

describe("ArmazenamentoSupabaseService", () => {
  beforeEach(() => {
    instalarLocalStorageFalso();
    definirSessao({ access_token: "token-de-teste", user: { id: "usuaria-1" } });
  });
  afterEach(() => {
    limparSessao();
    delete globalThis.fetch;
  });

  test("listar('gastos') reconstrói parcela como objeto só quando parcela_numero existe", async () => {
    const linhas = [
      {
        id: "g1",
        titulo: "Aluguel",
        data: "2026-08-15",
        valor: "1200.00", // Postgres numeric volta como string via PostgREST
        salario_responsavel: "dia15",
        mes_referencia: "2026-08",
        pago: true,
        fixo: true,
        fixo_id: "serie-1",
        parcela_numero: null,
        parcela_total: null,
        parcelamento_id: null,
        categoria_id: "cat-1",
        carteira_id: null,
        observacoes: "",
      },
      {
        id: "g2",
        titulo: "Notebook",
        data: "2026-08-20",
        valor: "500.5",
        salario_responsavel: "dia30",
        mes_referencia: "2026-08",
        pago: false,
        fixo: false,
        fixo_id: null,
        parcela_numero: 1,
        parcela_total: 3,
        parcelamento_id: "compra-1",
        categoria_id: null,
        carteira_id: null,
        observacoes: "",
      },
    ];
    instalarFetchFalso([linhas]);

    const storage = new ArmazenamentoSupabaseService();
    const itens = await storage.listar("gastos");

    assert.equal(itens.length, 2);
    assert.equal(itens[0].parcela, null);
    assert.equal(itens[0].valor, 1200); // número, não string
    assert.deepEqual(itens[1].parcela, { numero: 1, total: 3, parcelamentoId: "compra-1" });
    assert.equal(itens[1].categoriaId, null);
  });

  test("salvar('gastos') envia upsert com colunas snake_case corretas", async () => {
    const gasto = {
      id: "g3",
      titulo: "Mercado",
      data: "2026-08-10",
      valor: 342.75,
      salarioResponsavel: "dia15",
      mesReferencia: "2026-08",
      pago: true,
      fixo: false,
      fixoId: null,
      parcela: null,
      categoriaId: "cat-2",
      carteiraId: "cart-1",
      observacoes: "compra do mês",
    };
    const chamadas = instalarFetchFalso([[{ ...gasto, mes_referencia: "2026-08", salario_responsavel: "dia15", categoria_id: "cat-2", carteira_id: "cart-1", fixo_id: null, parcela_numero: null, parcela_total: null, parcelamento_id: null }]]);

    const storage = new ArmazenamentoSupabaseService();
    await storage.salvar("gastos", gasto);

    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].opcoes.method, "POST");
    assert.equal(chamadas[0].opcoes.headers.Prefer, "resolution=merge-duplicates,return=representation");
    assert.equal(chamadas[0].opcoes.headers.Authorization, "Bearer token-de-teste");
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    assert.equal(corpo[0].mes_referencia, "2026-08");
    assert.equal(corpo[0].categoria_id, "cat-2");
    assert.ok(!("mesReferencia" in corpo[0]), "não deveria sobrar campo camelCase no corpo enviado");
  });

  test("carteiras: beneficio vira colunas achatadas e volta como objeto só quando tipo é 'beneficio'", async () => {
    const carteiraDinheiro = { id: "c1", nome: "Dinheiro", tipo: "dinheiro", emoji: "💵", cor: "#8FD694", ativa: true, beneficio: null };
    const carteiraBeneficio = {
      id: "c2",
      nome: "Ticket Alimentação",
      tipo: "beneficio",
      emoji: "🍽️",
      cor: "#F7C873",
      ativa: true,
      beneficio: { valorMensal: 990, diaRecebimento: 1, recorrente: true, acumulaSaldo: true, ativoDesde: "2026-08-01" },
    };

    const linhasSimuladas = [
      { id: "c1", nome: "Dinheiro", tipo: "dinheiro", emoji: "💵", cor: "#8FD694", ativa: true, beneficio_valor_mensal: null, beneficio_dia_recebimento: null, beneficio_recorrente: null, beneficio_acumula_saldo: null, beneficio_ativo_desde: null },
      { id: "c2", nome: "Ticket Alimentação", tipo: "beneficio", emoji: "🍽️", cor: "#F7C873", ativa: true, beneficio_valor_mensal: "990.00", beneficio_dia_recebimento: 1, beneficio_recorrente: true, beneficio_acumula_saldo: true, beneficio_ativo_desde: "2026-08-01" },
    ];
    instalarFetchFalso([linhasSimuladas]);

    const storage = new ArmazenamentoSupabaseService();
    const itens = await storage.listar("carteiras");

    assert.equal(itens[0].beneficio, null);
    assert.deepEqual(itens[1].beneficio, { valorMensal: 990, diaRecebimento: 1, recorrente: true, acumulaSaldo: true, ativoDesde: "2026-08-01" });

    void carteiraDinheiro;
    void carteiraBeneficio;
  });

  test("remover envia DELETE filtrando por id", async () => {
    const chamadas = instalarFetchFalso([null]);
    const storage = new ArmazenamentoSupabaseService();
    await storage.remover("lembretes", "l1");

    assert.equal(chamadas[0].opcoes.method, "DELETE");
    assert.match(chamadas[0].url, /id=eq\.l1$/);
  });

  test("substituirTudo apaga tudo e regrava só se houver itens novos", async () => {
    const chamadas = instalarFetchFalso([null, [{ id: "m1", nome: "Meta", valor_desejado: "100.00", prioridade: "alta", observacoes: "" }]]);
    const storage = new ArmazenamentoSupabaseService();
    await storage.substituirTudo("metas", [{ id: "m1", nome: "Meta", valorDesejado: 100, prioridade: "alta", observacoes: "" }]);

    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[0].opcoes.method, "DELETE");
    assert.equal(chamadas[1].opcoes.method, "POST");
  });

  test("substituirTudo com lista vazia só apaga, não faz upsert de array vazio", async () => {
    const chamadas = instalarFetchFalso([null]);
    const storage = new ArmazenamentoSupabaseService();
    await storage.substituirTudo("metas", []);

    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].opcoes.method, "DELETE");
  });

  test("lerConfig devolve objeto vazio quando ainda não existe linha de configuração", async () => {
    instalarFetchFalso([[]]);
    const storage = new ArmazenamentoSupabaseService();
    const config = await storage.lerConfig("configuracoes");
    assert.deepEqual(config, { versao: 1, configuracoes: {} });
  });

  test("lerConfig devolve o conteúdo salvo quando a linha existe", async () => {
    instalarFetchFalso([[{ user_id: "usuaria-1", dados: { tema: "escuro" } }]]);
    const storage = new ArmazenamentoSupabaseService();
    const config = await storage.lerConfig("configuracoes");
    assert.deepEqual(config, { versao: 1, configuracoes: { tema: "escuro" } });
  });

  test("sem sessão, usa a chave publicável como Authorization (RLS bloqueia tudo mesmo assim)", async () => {
    limparSessao();
    const chamadas = instalarFetchFalso([[]]);
    const storage = new ArmazenamentoSupabaseService();
    await storage.listar("categorias");
    assert.match(chamadas[0].opcoes.headers.Authorization, /^Bearer sb_publishable_/);
  });

  test("coleção desconhecida lança erro em vez de silenciosamente não fazer nada", async () => {
    const storage = new ArmazenamentoSupabaseService();
    await assert.rejects(() => storage.listar("colecao-que-nao-existe"));
  });
});

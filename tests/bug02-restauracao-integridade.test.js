// BUG-02 (Alto, auditoria 2026-08-09): restaurar um backup/exportação não
// validava o conteúdo dos itens. Um item com `valor` em texto, `data`
// inválida ou `id` duplicado entrava sem nenhum aviso e corrompia
// silenciosamente os cálculos daquele mês.
//
// Reprodução original (documentada na auditoria):
//   [
//     { titulo: "Sem ID nem valor numérico", valor: "cem reais", data: "31-02-2027" },
//     { id: "dup-1", titulo: "Duplicado A", valor: 10, data: "2027-04-01", mesReferencia: "2027-04" },
//     { id: "dup-1", titulo: "Duplicado B (mesmo id)", valor: 20, data: "2027-04-02", mesReferencia: "2027-04" },
//   ]
// Resultado incorreto observado: os 3 itens eram persistidos como estavam —
// os dois "dup-1" coexistindo no mesmo arquivo, e o item com valor/data
// inválidos entrando do mesmo jeito.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { dataValida, mesValido, valorValido, validarESanearItens } from "../src/js/dados/validacao.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";
import { montarDom, clicar, esperarAte } from "./helpers/appDom.js";

describe("BUG-02 — validação pura (dataValida / mesValido / valorValido)", () => {
  test("dataValida rejeita datas de calendário impossíveis", () => {
    assert.equal(dataValida("2027-02-31"), false); // fevereiro não tem dia 31
    assert.equal(dataValida("31-02-2027"), false); // formato trocado (o caso real da auditoria)
    assert.equal(dataValida("2027-13-01"), false); // mês 13 não existe
    assert.equal(dataValida("2027-00-10"), false); // mês 0 não existe
    assert.equal(dataValida(""), false);
    assert.equal(dataValida(null), false);
    assert.equal(dataValida(undefined), false);
    assert.equal(dataValida(20270210), false); // número em vez de string
  });

  test("dataValida aceita datas reais, incluindo 29/02 em ano bissexto e o último dia de meses de 30/31", () => {
    assert.equal(dataValida("2027-02-28"), true);
    assert.equal(dataValida("2028-02-29"), true); // 2028 é bissexto
    assert.equal(dataValida("2027-02-29"), false); // 2027 NÃO é bissexto
    assert.equal(dataValida("2027-04-30"), true);
    assert.equal(dataValida("2027-04-31"), false); // abril só tem 30 dias
    assert.equal(dataValida("2027-01-31"), true);
  });

  test("mesValido rejeita mês fora de 01-12 e formatos incorretos", () => {
    assert.equal(mesValido("2027-13"), false);
    assert.equal(mesValido("2027-00"), false);
    assert.equal(mesValido("31-02-2"), false); // o mesReferencia-lixo observado na auditoria
    assert.equal(mesValido("2027-3"), false); // sem zero à esquerda
    assert.equal(mesValido("2027-03"), true);
  });

  test("valorValido rejeita string, NaN e Infinity; aceita número finito (incl. 0 e negativo)", () => {
    assert.equal(valorValido("cem reais"), false); // o caso real da auditoria
    assert.equal(valorValido("100"), false); // string numérica também não é número
    assert.equal(valorValido(NaN), false);
    assert.equal(valorValido(Infinity), false);
    assert.equal(valorValido(undefined), false);
    assert.equal(valorValido(100), true);
    assert.equal(valorValido(0.01), true);
    assert.equal(valorValido(0), true);
    assert.equal(valorValido(-50), true); // a validação de sinal é responsabilidade da UI, não do armazenamento
  });
});

describe("BUG-02 — validarESanearItens reproduz e corrige o cenário exato da auditoria", () => {
  test("descarta valor não numérico, descarta data inválida, e resolve id duplicado mantendo só 1 item", () => {
    const itensDoArquivoMalformado = [
      { titulo: "Sem ID nem valor numérico", valor: "cem reais", data: "31-02-2027" },
      { id: "dup-1", titulo: "Duplicado A", valor: 10, data: "2027-04-01", mesReferencia: "2027-04" },
      { id: "dup-1", titulo: "Duplicado B (mesmo id)", valor: 20, data: "2027-04-02", mesReferencia: "2027-04" },
    ];

    const { validos, descartados } = validarESanearItens("gastos", itensDoArquivoMalformado);

    // O item sem id/valor numérico é descartado (antes: entrava sem aviso).
    assert.equal(descartados.length, 1);
    assert.equal(descartados[0].item.titulo, "Sem ID nem valor numérico");

    // Dos dois itens com id "dup-1", só UM sobra — o último do array (mesmo
    // critério de upsert já usado em salvarItensEmLote). Antes do fix, os
    // dois ficavam no resultado.
    assert.equal(validos.length, 1);
    assert.equal(validos[0].id, "dup-1");
    assert.equal(validos[0].titulo, "Duplicado B (mesmo id)");
  });

  test("gasto com mesReferencia sem sentido (derivado de uma data inválida) é descartado", () => {
    const { validos, descartados } = validarESanearItens("gastos", [
      { id: "g1", titulo: "Gasto órfão", valor: 50, data: "2027-03-10", mesReferencia: "31-02-2" },
    ]);
    assert.equal(validos.length, 0);
    assert.equal(descartados.length, 1);
  });

  test("itens bem formados continuam passando normalmente (não fica mais restritivo do que deveria)", () => {
    const { validos, descartados } = validarESanearItens("ganhos", [
      { id: "a", titulo: "Salário", valor: 3000, data: "2027-03-05" },
      { id: "b", titulo: "Freela", valor: 450.9, data: "2027-03-20" },
    ]);
    assert.equal(descartados.length, 0);
    assert.equal(validos.length, 2);
  });

  test("entrada que não é array devolve listas vazias em vez de lançar erro", () => {
    const { validos, descartados } = validarESanearItens("gastos", null);
    assert.deepEqual(validos, []);
    assert.deepEqual(descartados, []);
  });
});

describe("BUG-02 — salvarColecaoCompleta não grava mais ids duplicados no mesmo shard", () => {
  test("dois itens com o mesmo id: só o último sobrevive no arquivo gravado em disco", async () => {
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();

      await armazenamento.salvarColecaoCompleta("gastos", [
        { id: "dup-1", titulo: "Duplicado A", valor: 10, data: "2027-04-01", mesReferencia: "2027-04" },
        { id: "dup-1", titulo: "Duplicado B (mesmo id)", valor: 20, data: "2027-04-02", mesReferencia: "2027-04" },
      ]);

      const gravados = await armazenamento.carregarColecao("gastos");
      assert.equal(gravados.length, 1, "o arquivo em disco não pode conter 2 itens com o mesmo id");
      assert.equal(gravados[0].titulo, "Duplicado B (mesmo id)");
    } finally {
      await limpar();
    }
  });

  test("ids diferentes continuam todos sendo gravados normalmente (a deduplicação não descarta itens de mais)", async () => {
    const { limpar } = await criarAmbienteTauri();
    try {
      const armazenamento = await import("../src/js/dados/armazenamento.js");
      await armazenamento.inicializar();

      await armazenamento.salvarColecaoCompleta("gastos", [
        { id: "a", titulo: "Gasto A", valor: 10, data: "2027-04-01", mesReferencia: "2027-04" },
        { id: "b", titulo: "Gasto B", valor: 20, data: "2027-04-02", mesReferencia: "2027-04" },
        { id: "c", titulo: "Gasto C", valor: 30, data: "2027-05-02", mesReferencia: "2027-05" },
      ]);

      const gravados = await armazenamento.carregarColecao("gastos");
      assert.equal(gravados.length, 3);
    } finally {
      await limpar();
    }
  });
});

describe("BUG-02 — fluxo real de 'Restaurar de um arquivo' (via a tela de Exportação)", () => {
  let ambiente;

  before(async () => {
    montarDom();
    ambiente = await criarAmbienteTauri();
    const armazenamento = await import("../src/js/dados/armazenamento.js");
    await armazenamento.inicializar();
  });

  after(async () => {
    await ambiente.limpar();
  });

  test("restaurar um arquivo com itens inválidos descarta só os inválidos, deduplica ids, e avisa a usuária", async () => {
    const { fs, dialog } = globalThis.window.__TAURI__;
    const { obterGastos, recarregarGastos } = await import("../src/js/modulos/gastos.js");
    const { iniciarExportacao } = await import("../src/js/modulos/exportacao.js");

    await iniciarExportacao();

    const caminhoRestauracao = ambiente.raiz + "/restauracao-teste.json";
    await fs.writeTextFile(
      caminhoRestauracao,
      JSON.stringify({
        versao: 1,
        ganhos: [],
        gastos: [
          { titulo: "Sem ID nem valor numérico", valor: "cem reais", data: "31-02-2027" },
          { id: "dup-1", titulo: "Duplicado A", valor: 10, data: "2027-04-01", mesReferencia: "2027-04" },
          { id: "dup-1", titulo: "Duplicado B (mesmo id)", valor: 20, data: "2027-04-02", mesReferencia: "2027-04" },
          { id: "ok-1", titulo: "Gasto válido", valor: 75.5, data: "2027-04-10", mesReferencia: "2027-04" },
        ],
        lembretes: [],
      })
    );

    dialog.config.proximoArquivoParaAbrir = caminhoRestauracao;
    globalThis.confirm = () => true; // usuária confirma as duas perguntas (a única aqui)

    clicar(document.getElementById("botao-restaurar-arquivo"));

    // A cadeia de restauração faz várias leituras/gravações de arquivo em
    // sequência (I/O real, não só microtasks) — espera até o status final
    // aparecer em vez de contar um número fixo de "ticks".
    await esperarAte(() => document.getElementById("exportacao-status").textContent.length > 0, {
      mensagem: "mensagem de status da restauração aparecer",
    });

    await recarregarGastos();
    const gastosRestaurados = obterGastos();

    // Só os 2 itens válidos (o duplicado resolvido para 1 + o item ok) devem existir.
    assert.equal(gastosRestaurados.length, 2, `esperava 2 gastos válidos, obteve ${gastosRestaurados.length}`);
    assert.ok(gastosRestaurados.some((g) => g.id === "ok-1"));
    const duplicados = gastosRestaurados.filter((g) => g.id === "dup-1");
    assert.equal(duplicados.length, 1, "não pode sobrar mais de um gasto com id 'dup-1'");
    assert.equal(duplicados[0].titulo, "Duplicado B (mesmo id)");

    // A usuária precisa ser avisada de que 1 item foi descartado — não mais silêncio total.
    const status = document.getElementById("exportacao-status").textContent;
    assert.match(status, /1 item.*inválid/i);
  });
});

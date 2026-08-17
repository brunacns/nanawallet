// Wishlist (Metas) — campos de produto opcionais (preço, loja, link,
// imagem), as duas visualizações (cards/lista) e a nova opção de
// prioridade "sem_definida". Cobre especificamente os pontos de risco da
// revisão: campo que deveria ser opcional virar obrigatório sem querer,
// item antigo (sem os campos novos) quebrar, link/imagem inválidos
// entrarem em href/src sem validação, preço vazio virar "R$ 0,00", e
// "sem prioridade definida" ser confundida com "baixa".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarDom, clicar, preencher, esperarAte } from "./helpers/appDom.js";
import { criarAmbienteTauri } from "./helpers/tauriFsMock.js";
import { ArmazenamentoLocalService } from "../src/js/servicos/ArmazenamentoLocalService.js";

async function prepararAmbiente() {
  montarDom();
  const ambiente = await criarAmbienteTauri();
  const armazenamento = await import("../src/js/dados/armazenamento.js");
  await armazenamento.inicializar();
  return ambiente;
}

describe("Wishlist: nome é o único campo obrigatório", () => {
  test("salvar só com nome não trava, e o card não mostra preço/loja/link/imagem vazios de forma estranha", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas, obterMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Presente de aniversário");
      // Preço, loja, link e imagem ficam vazios de propósito.
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden, { mensagem: "modal fechar após salvar" });

      const metas = obterMetas();
      assert.equal(metas.length, 1);
      assert.equal(metas[0].valorDesejado, null, "preço vazio deve virar null, nunca 0");
      assert.equal(metas[0].loja, null);
      assert.equal(metas[0].link, null);
      assert.equal(metas[0].imagemUrl, null);

      const cartao = document.querySelector(".cartao-meta");
      assert.ok(cartao, "esperava o card renderizado");
      assert.equal(cartao.querySelector(".cartao-meta__valor"), null, "sem preço, o bloco de preço não deve existir no card");
      assert.equal(cartao.querySelector(".cartao-meta__loja"), null);
      assert.equal(cartao.querySelector(".cartao-meta__link"), null);
      assert.doesNotMatch(cartao.textContent, /R\$\s*0,00/, "preço vazio nunca deve aparecer como R$ 0,00");

      // Placeholder de imagem (sem imagem cadastrada) deve existir e não
      // conter nenhuma tag <img> tentando carregar algo.
      const blocoImagem = cartao.querySelector(".cartao-meta__imagem--vazio");
      assert.ok(blocoImagem, "esperava o placeholder de imagem");
      assert.equal(blocoImagem.querySelector("img"), null);
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: card completo com todos os campos preenchidos", () => {
  test("preço, loja e link aparecem formatados e o link é clicável", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Fone de ouvido");
      preencher(document.getElementById("campo-valor-desejado-meta"), "350");
      preencher(document.getElementById("campo-loja-meta"), "Amazon");
      preencher(document.getElementById("campo-link-meta"), "https://exemplo.com/produto");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const cartao = document.querySelector(".cartao-meta");
      assert.match(cartao.querySelector(".cartao-meta__valor-numero").textContent, /350,00/);
      assert.match(cartao.querySelector(".cartao-meta__loja").textContent, /Amazon/);
      const link = cartao.querySelector(".cartao-meta__link");
      assert.ok(link, "esperava o link 'Ver produto'");
      assert.equal(link.getAttribute("href"), "https://exemplo.com/produto");
      assert.equal(link.getAttribute("target"), "_blank");
      assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: link/imagem com esquema perigoso nunca entram em href/src", () => {
  test("um link javascript: salvo (ex: via API direta) não vira href, e não quebra a renderização", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas, obterMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      // Simula um dado gravado fora da interface (a validação nativa do
      // formulário nunca deixaria isso passar pela tela).
      const storage = new ArmazenamentoLocalService();
      await storage.salvar("metas", {
        id: "meta-maliciosa",
        nome: "Item suspeito",
        valorDesejado: null,
        loja: null,
        link: "javascript:alert(1)",
        imagemUrl: "javascript:alert(2)",
        prioridade: "sem_definida",
        observacoes: "",
      });

      const { recarregarMetas } = await import("../src/js/modulos/metas.js");
      await recarregarMetas();
      void obterMetas;

      const cartao = document.querySelector('.cartao-meta[data-id="meta-maliciosa"]');
      assert.ok(cartao, "esperava o card mesmo com link/imagem inválidos");
      assert.equal(cartao.querySelector(".cartao-meta__link"), null, "link com esquema perigoso não deve virar um <a href>");
      assert.equal(cartao.querySelector(".cartao-meta__imagem img"), null, "imagem com esquema perigoso não deve virar uma <img src>");
      assert.ok(cartao.querySelector(".cartao-meta__imagem--vazio"), "deve cair no placeholder neutro");
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: prioridade 'sem prioridade definida'", () => {
  test("é o padrão de uma meta nova, e usa um selo diferente de 'Baixa prioridade'", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      assert.equal(document.getElementById("campo-nome-meta").value, "");
      clicar(document.getElementById("botao-nova-meta"));
      assert.equal(
        document.getElementById("campo-prioridade-meta").value,
        "sem_definida",
        "uma meta nova não deve assumir 'média' (nem nenhuma outra) por conta própria"
      );

      preencher(document.getElementById("campo-nome-meta"), "Sem prioridade");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const selo = document.querySelector(".cartao-meta .selo");
      assert.equal(selo.textContent.trim(), "Sem prioridade definida");
      assert.ok(selo.classList.contains("selo--tracejado"));
      assert.ok(!selo.classList.contains("selo--neutro"), "não pode reaproveitar o selo cinza sólido de 'Baixa prioridade'");
    } finally {
      await limpar();
    }
  });

  test("baixa prioridade continua com selo--neutro, distinto de selo--tracejado", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Baixa prioridade");
      document.getElementById("campo-prioridade-meta").value = "baixa";
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const selo = document.querySelector(".cartao-meta .selo");
      assert.equal(selo.textContent.trim(), "Baixa prioridade");
      assert.ok(selo.classList.contains("selo--neutro"));
      assert.ok(!selo.classList.contains("selo--tracejado"));
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: item antigo (sem os campos novos) continua funcionando", () => {
  test("uma meta salva antes desta etapa (sem loja/link/imagemUrl) carrega e renderiza sem quebrar", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const storage = new ArmazenamentoLocalService();
      // Formato "antigo": só os campos que já existiam antes desta etapa.
      await storage.salvar("metas", {
        id: "meta-antiga",
        nome: "Viagem para a praia",
        valorDesejado: 2000,
        prioridade: "alta",
        observacoes: "Ir em janeiro",
      });

      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      const cartao = document.querySelector('.cartao-meta[data-id="meta-antiga"]');
      assert.ok(cartao, "esperava o card do item antigo");
      assert.match(cartao.querySelector(".cartao-meta__valor-numero").textContent, /2\.000,00/);
      assert.equal(cartao.querySelector(".cartao-meta__loja"), null);
      assert.equal(cartao.querySelector(".cartao-meta__link"), null);
      assert.ok(cartao.querySelector(".cartao-meta__imagem--vazio"), "sem imagemUrl, deve cair no placeholder, não quebrar");

      // Editar o item antigo não deve lançar erro nem deixar os campos novos com "undefined".
      const botaoEditar = cartao.querySelector('[data-acao="editar"]');
      clicar(botaoEditar);
      assert.equal(document.getElementById("campo-loja-meta").value, "");
      assert.equal(document.getElementById("campo-link-meta").value, "");
      assert.equal(document.getElementById("campo-imagem-meta").value, "");
      assert.equal(document.getElementById("campo-valor-desejado-meta").value, "2000");
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: edição preserva os campos já cadastrados", () => {
  test("reabrir o modal de edição pré-preenche loja/link/imagem, e salvar sem mexer neles mantém os valores", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas, obterMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Câmera");
      preencher(document.getElementById("campo-loja-meta"), "Loja X");
      preencher(document.getElementById("campo-link-meta"), "https://exemplo.com/camera");
      preencher(document.getElementById("campo-imagem-meta"), "https://exemplo.com/camera.jpg");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const id = obterMetas()[0].id;
      clicar(document.querySelector(`.cartao-meta[data-id="${id}"] [data-acao="editar"]`));
      assert.equal(document.getElementById("campo-loja-meta").value, "Loja X");
      assert.equal(document.getElementById("campo-link-meta").value, "https://exemplo.com/camera");
      assert.equal(document.getElementById("campo-imagem-meta").value, "https://exemplo.com/camera.jpg");

      // Só muda a prioridade, deixando os outros campos como estavam.
      document.getElementById("campo-prioridade-meta").value = "alta";
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const metaAtualizada = obterMetas().find((m) => m.id === id);
      assert.equal(metaAtualizada.prioridade, "alta");
      assert.equal(metaAtualizada.loja, "Loja X");
      assert.equal(metaAtualizada.link, "https://exemplo.com/camera");
      assert.equal(metaAtualizada.imagemUrl, "https://exemplo.com/camera.jpg");
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: 'Ver produto' no Desktop (Tauri)", () => {
  test("com o plugin opener disponível, o clique é interceptado e abre pelo navegador padrão do sistema, sem navegar a própria janela", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Produto com link");
      preencher(document.getElementById("campo-link-meta"), "https://exemplo.com/produto");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      // `criarAmbienteTauri()` já deixa `window.__TAURI__` definido (fs/path/dialog/app) —
      // simula o plugin "opener" (fs/dialog já tinham esse mesmo tratamento).
      let urlAberta = null;
      window.__TAURI__.opener = { openUrl: (url) => { urlAberta = url; return Promise.resolve(); } };

      const link = document.querySelector('.cartao-meta [data-link-produto]');
      const evento = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(evento);

      assert.equal(urlAberta, "https://exemplo.com/produto");
      assert.equal(evento.defaultPrevented, true, "o <a target=_blank> não deve tentar navegar por conta própria");
    } finally {
      await limpar();
    }
  });

  test("sem o plugin opener (versão antiga/Web), o clique não lança erro e não interfere no link", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Produto sem opener");
      preencher(document.getElementById("campo-link-meta"), "https://exemplo.com/sem-opener");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      const link = document.querySelector('.cartao-meta [data-link-produto]');
      const evento = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      assert.doesNotThrow(() => link.dispatchEvent(evento));
      assert.equal(evento.defaultPrevented, false, "sem o plugin, o <a> deve seguir seu comportamento nativo (target=_blank)");
    } finally {
      await limpar();
    }
  });
});

describe("Wishlist: alternar entre Cards e Lista", () => {
  test("o alternador troca a estrutura renderizada e mantém as mesmas informações", async () => {
    const { limpar } = await prepararAmbiente();
    try {
      const { iniciarPaginaMetas } = await import("../src/js/modulos/metas.js");
      await iniciarPaginaMetas();

      clicar(document.getElementById("botao-nova-meta"));
      preencher(document.getElementById("campo-nome-meta"), "Livro");
      preencher(document.getElementById("campo-valor-desejado-meta"), "80");
      clicar(document.getElementById("formulario-meta").querySelector('button[type="submit"]'));
      await esperarAte(() => document.getElementById("sobreposicao-meta").hidden);

      assert.ok(document.querySelector(".cartao-meta"), "começa em cards");
      assert.equal(document.querySelector(".item-meta"), null);

      clicar(document.querySelector('[data-visualizacao="lista"]'));
      assert.equal(document.querySelector(".cartao-meta"), null, "sai da visualização em cards");
      const item = document.querySelector(".item-meta");
      assert.ok(item, "passa a mostrar a lista compacta");
      assert.match(item.querySelector(".item-meta__detalhes").textContent, /80,00/);

      clicar(document.querySelector('[data-visualizacao="cards"]'));
      assert.ok(document.querySelector(".cartao-meta"), "volta para cards");
      assert.equal(document.querySelector(".item-meta"), null);
    } finally {
      await limpar();
    }
  });
});

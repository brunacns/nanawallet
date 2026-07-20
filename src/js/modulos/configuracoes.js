import { formatarData, formatarDataHora } from "../utils/formatadores.js";

// Página Configurações: informações de versão/build (lidas automaticamente).
export async function iniciarPaginaConfiguracoes() {
  await preencherInformacoesDeVersao();
}

async function preencherInformacoesDeVersao() {
  const versaoEl = document.getElementById("config-versao");
  const dataBuildEl = document.getElementById("config-data-build");
  const ultimaAtualizacaoEl = document.getElementById("config-ultima-atualizacao");

  try {
    const { app } = window.__TAURI__;
    versaoEl.textContent = await app.getVersion();
  } catch (erro) {
    versaoEl.textContent = "—";
    console.error("Não foi possível obter a versão do app:", erro);
  }

  try {
    const resposta = await fetch("./js/build-info.json");
    const info = await resposta.json();
    dataBuildEl.textContent = formatarDataHora(info.dataBuild);
    // "Última atualização" é a mesma data da build, em formato mais simples —
    // o app não tem um atualizador automático, então a build instalada É a
    // última atualização.
    ultimaAtualizacaoEl.textContent = formatarData(info.dataBuild.slice(0, 10));
  } catch (erro) {
    dataBuildEl.textContent = "—";
    ultimaAtualizacaoEl.textContent = "—";
    console.error("Não foi possível ler build-info.json:", erro);
  }
}

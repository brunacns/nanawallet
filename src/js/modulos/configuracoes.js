import { formatarData, formatarDataHora } from "../utils/formatadores.js";
import { sair } from "../auth/AuthService.js";
import { obterSessao } from "../supabase/sessao.js";

// Página Configurações: informações de versão/build (lidas automaticamente)
// e a conta autenticada (e-mail + sair).
export async function iniciarPaginaConfiguracoes() {
  await preencherInformacoesDeVersao();
  preencherContaEEncerrarSessao();
}

function preencherContaEEncerrarSessao() {
  const emailEl = document.getElementById("config-email-usuaria");
  const botaoSair = document.getElementById("botao-sair-config");
  if (emailEl) emailEl.textContent = obterSessao()?.user?.email ?? "—";

  botaoSair?.addEventListener("click", async () => {
    botaoSair.disabled = true;
    botaoSair.textContent = "Saindo…";
    await sair();
    // Recarrega a página inteira em vez de tentar desmontar o estado em
    // memória de cada tela na mão — mais simples e confiável: o app volta a
    // rodar exatamente o mesmo fluxo de inicialização, que já sabe mostrar o
    // portão de login quando não há sessão.
    window.location.reload();
  });
}

async function preencherInformacoesDeVersao() {
  const versaoEl = document.getElementById("config-versao");
  const sidebarVersaoEl = document.getElementById("sidebar-versao");
  const dataBuildEl = document.getElementById("config-data-build");
  const ultimaAtualizacaoEl = document.getElementById("config-ultima-atualizacao");

  try {
    const { app } = window.__TAURI__;
    const versao = await app.getVersion();
    versaoEl.textContent = versao;
    if (sidebarVersaoEl) sidebarVersaoEl.textContent = `NanaWallet v${versao}`;
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

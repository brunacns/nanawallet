import { armazenamentoAtivo } from "./servicos/index.js";
import { configurarNavegacao } from "./navegacao.js";
import { iniciarPaginaGanhos } from "./modulos/ganhos.js";
import { iniciarPaginaGastos } from "./modulos/gastos.js";
import { iniciarParcelamentos } from "./modulos/parcelamentos.js";
import { iniciarPaginaLembretes } from "./modulos/lembretes.js";
import { iniciarDashboard } from "./modulos/dashboard.js";
import { iniciarGraficos } from "./modulos/graficos.js";
import { iniciarHistorico } from "./modulos/historico.js";
import { iniciarPaginaMetas } from "./modulos/metas.js";
import { iniciarExportacao } from "./modulos/exportacao.js";
import { iniciarPaginaConfiguracoes } from "./modulos/configuracoes.js";

function mostrarStatusArmazenamento(texto) {
  const el = document.getElementById("status-armazenamento");
  if (el) el.textContent = texto;
}

async function iniciarApp() {
  configurarNavegacao();
  // Não depende do armazenamento (fs) — roda fora do try/catch de baixo para
  // continuar funcionando mesmo se o armazenamento falhar.
  await iniciarPaginaConfiguracoes();

  try {
    // Passa pelo StorageService ativo (hoje: armazenamento local em
    // arquivos JSON) em vez de chamar dados/armazenamento.js direto — é
    // essa indireção que mantém as telas desacopladas da implementação
    // concreta de armazenamento.
    await armazenamentoAtivo.inicializar();
    mostrarStatusArmazenamento("Armazenamento OK");
    await iniciarPaginaGanhos();
    await iniciarPaginaGastos();
    iniciarParcelamentos();
    await iniciarPaginaLembretes();
    iniciarDashboard();
    iniciarGraficos();
    iniciarHistorico();
    await iniciarPaginaMetas();
    await iniciarExportacao();
  } catch (erro) {
    mostrarStatusArmazenamento("Erro no armazenamento");
    console.error("Erro ao inicializar o armazenamento:", erro);
  }
}

window.addEventListener("DOMContentLoaded", iniciarApp);

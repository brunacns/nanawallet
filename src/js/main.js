import { armazenamentoAtivo, sincronizacaoService } from "./servicos/index.js";
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
    // essa indireção que permite trocar por sincronização no futuro só
    // mudando servicos/index.js, sem tocar em main.js.
    await armazenamentoAtivo.inicializar();
    mostrarStatusArmazenamento("Armazenamento OK");
    // Carrega sessão/fila salvas e liga o motor de sincronização às
    // mutações dos 4 serviços de domínio. Não bloqueia o app: se a usuária
    // nunca fez login, isso só fica esperando (sincronizarAgora() não faz
    // nada sem sessão) — o app funciona 100% offline normalmente.
    await sincronizacaoService.iniciar();
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

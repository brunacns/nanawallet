import { armazenamentoAtivo, categoriasService, carteirasService, carteiraEntradasService } from "./servicos/index.js";
import { configurarNavegacao } from "./navegacao.js";
import { iniciarPaginaGanhos, recarregarGanhos } from "./modulos/ganhos.js";
import { iniciarPaginaGastos, recarregarGastos } from "./modulos/gastos.js";
import { iniciarPaginaTicketAlimentacao } from "./modulos/ticketAlimentacao.js";
import { iniciarParcelamentos } from "./modulos/parcelamentos.js";
import { iniciarPaginaLembretes, recarregarLembretes } from "./modulos/lembretes.js";
import { iniciarDashboard } from "./modulos/dashboard.js";
import { iniciarGraficos } from "./modulos/graficos.js";
import { iniciarHistorico } from "./modulos/historico.js";
import { iniciarPaginaMetas, recarregarMetas } from "./modulos/metas.js";
import { iniciarExportacao } from "./modulos/exportacao.js";
import { iniciarPaginaConfiguracoes } from "./modulos/configuracoes.js";
import { iniciarConfirmacaoExclusao } from "./confirmacaoExclusao.js";
import { garantirSessaoValida } from "./auth/AuthService.js";
import { iniciarTelaLogin, exibirPortao, esconderPortao } from "./auth/telaLogin.js";

function mostrarStatusArmazenamento(texto) {
  const el = document.getElementById("status-armazenamento");
  if (el) el.textContent = texto;
}

function horaCurta() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Roda uma etapa de inicialização isolada: se uma página falhar ao carregar
// (ex: um erro de rede pontual), as demais ainda são tentadas — antes, todas
// as páginas ficavam dentro de um único try/catch e uma falha isolada (ex:
// só em gastos) impedia até páginas sem nenhum problema (ex: metas) de
// inicializar.
async function iniciarEtapa(nome, fn) {
  try {
    await fn();
  } catch (erro) {
    console.error(`Erro ao inicializar "${nome}":`, erro);
  }
}

// true só depois que iniciarAppAutenticado() termina — evita que o listener
// de visibilitychange (ligado no fim dela) dispare uma sincronização antes
// de tudo estar pronto, ou depois de logout/antes de logar de novo.
let appAutenticado = false;

// Busca de novo o estado de cada coleção no Supabase e notifica as telas já
// abertas — é o mecanismo de sincronização entre Desktop e Web (Fase 8):
// sem fila, sem realtime, só "buscar de novo quando a usuária volta a
// olhar pro app". Chamado ao voltar o foco da janela/aba e no clique manual
// no indicador de status.
async function sincronizarAgora() {
  if (!appAutenticado) return;
  mostrarStatusArmazenamento("Sincronizando…");
  try {
    await Promise.all([
      categoriasService.listar(),
      carteirasService.listar(),
      carteiraEntradasService.listar(),
      recarregarGanhos(),
      recarregarGastos(),
      recarregarLembretes(),
      recarregarMetas(),
    ]);
    mostrarStatusArmazenamento(`Sincronizado às ${horaCurta()}`);
  } catch (erro) {
    mostrarStatusArmazenamento("Erro ao sincronizar");
    console.error("Erro ao sincronizar com o Supabase:", erro);
  }
}

// Tudo que depende de haver uma sessão válida — chamado depois do login (ou
// direto, se já havia uma sessão persistida). Separado de iniciarApp() para
// o portão de autenticação poder bloquear só esta parte, sem impedir a
// navegação/sidebar de existir no DOM por trás dele.
async function iniciarAppAutenticado() {
  await iniciarPaginaConfiguracoes();

  try {
    // Passa pelo StorageService ativo (Desktop e Web: ArmazenamentoSupabaseService)
    // em vez de falar com o Supabase direto — é essa indireção que mantém as
    // telas desacopladas da implementação concreta de armazenamento.
    await armazenamentoAtivo.inicializar();
    mostrarStatusArmazenamento(`Sincronizado às ${horaCurta()}`);
  } catch (erro) {
    mostrarStatusArmazenamento("Erro de conexão com o Supabase");
    console.error("Erro ao inicializar o armazenamento:", erro);
    return;
  }

  // Carregadas antes das telas que exibem categoria/carteira (gastos,
  // dashboard, gráficos, histórico) precisarem delas para renderizar.
  await iniciarEtapa("categorias", () => categoriasService.listar());
  await iniciarEtapa("carteiras", () => carteirasService.listar());
  await iniciarEtapa("movimentações de carteira", () => carteiraEntradasService.listar());
  await iniciarEtapa("ganhos", iniciarPaginaGanhos);
  await iniciarEtapa("gastos", iniciarPaginaGastos);
  await iniciarEtapa("ticket alimentação", iniciarPaginaTicketAlimentacao);
  await iniciarEtapa("parcelamentos", iniciarParcelamentos);
  await iniciarEtapa("lembretes", iniciarPaginaLembretes);
  await iniciarEtapa("dashboard", iniciarDashboard);
  await iniciarEtapa("gráficos", iniciarGraficos);
  await iniciarEtapa("histórico", iniciarHistorico);
  await iniciarEtapa("metas", iniciarPaginaMetas);
  await iniciarEtapa("exportação", iniciarExportacao);

  appAutenticado = true;
  document.getElementById("status-armazenamento")?.addEventListener("click", sincronizarAgora);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizarAgora();
  });
}

async function iniciarApp() {
  configurarNavegacao();
  iniciarConfirmacaoExclusao();

  iniciarTelaLogin({
    aoAutenticar: async () => {
      esconderPortao();
      await iniciarAppAutenticado();
    },
  });

  // Sessão persistente: se já havia login válido (ou renovável via
  // refresh_token) guardado de uma vez anterior, entra direto, sem mostrar
  // o portão — em qualquer outro caso, pede login.
  const sessao = await garantirSessaoValida();
  if (sessao) {
    await iniciarAppAutenticado();
  } else {
    exibirPortao();
  }
}

window.addEventListener("DOMContentLoaded", iniciarApp);

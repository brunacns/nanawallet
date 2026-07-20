// Persistência local do ESTADO da sincronização (sessão de login, data da
// última sincronização, fila de mudanças pendentes de envio) — não é dado
// financeiro da usuária, é só a "memória" do próprio mecanismo de
// sincronização, guardada num arquivo separado dos dados reais
// (dados/gastos.json etc.) para manter as responsabilidades bem separadas.
// Sem backup automático de propósito: se esse arquivo se perder, o pior caso
// é uma ressincronização completa (segura, idempotente), não perda de dados.
//
// Acesso preguiçoso (via Proxy) — ver o comentário equivalente em
// dados/armazenamento.js: este arquivo é importado (por SincronizacaoService.js
// -> servicos/index.js) mesmo quando o app roda como PWA sem Tauri nenhum,
// então não pode acessar `window.__TAURI__` direto no topo do módulo.
const fs = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.fs[propriedade] });
const path = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.path[propriedade] });

const PADRAO = { sessao: null, ultimaSincronizacao: null, automatica: false, fila: [] };

async function caminhoArquivo() {
  const raiz = await path.appLocalDataDir();
  const pasta = await path.join(raiz, "dados");
  if (!(await fs.exists(pasta))) {
    await fs.mkdir(pasta, { recursive: true });
  }
  return path.join(pasta, "sincronizacao.json");
}

export async function lerEstadoSincronizacao() {
  const caminho = await caminhoArquivo();
  if (!(await fs.exists(caminho))) return { ...PADRAO, fila: [] };
  const conteudo = JSON.parse(await fs.readTextFile(caminho));
  return { ...PADRAO, ...conteudo };
}

export async function salvarEstadoSincronizacao(estado) {
  const caminho = await caminhoArquivo();
  await fs.writeTextFile(caminho, JSON.stringify(estado, null, 2));
}

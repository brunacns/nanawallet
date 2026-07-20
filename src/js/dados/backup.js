import { CONFIG } from "../config.js";
import { carimboDataHora } from "../utils/formatadores.js";

// Acesso preguiçoso — ver o comentário equivalente em dados/armazenamento.js.
const fs = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.fs[propriedade] });
const path = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.path[propriedade] });

async function pastaBackups() {
  const raiz = await path.appLocalDataDir();
  const pasta = await path.join(raiz, CONFIG.pastaBackups);
  if (!(await fs.exists(pasta))) {
    await fs.mkdir(pasta, { recursive: true });
  }
  return pasta;
}

// Copia o arquivo atual para a pasta de backups com um nome carimbado com
// data/hora, e remove backups excedentes desse mesmo `identificador`
// (mantém apenas os mais recentes). `identificador` identifica QUAL arquivo
// está sendo salvo — "configuracoes" (arquivo único) ou "<colecao>-<AAAA-MM>"
// (um mês específico de uma coleção particionada, ex: "gastos-2026-07").
// Usa "__" para separar o identificador do carimbo de data/hora porque o
// identificador pode conter hifens (datas), então "_" sozinho seria ambíguo.
export async function criarBackup(identificador, caminhoOrigem) {
  const pasta = await pastaBackups();
  const nomeBackup = `${identificador}__${carimboDataHora()}.json`;
  const caminhoBackup = await path.join(pasta, nomeBackup);

  await fs.copyFile(caminhoOrigem, caminhoBackup);
  await limparBackupsAntigos(identificador, pasta);
}

async function limparBackupsAntigos(identificador, pasta) {
  const entradas = await fs.readDir(pasta);

  const doArquivo = entradas
    .filter((e) => e.name && e.name.startsWith(`${identificador}__`))
    .sort((a, b) => a.name.localeCompare(b.name));

  const excedentes = doArquivo.length - CONFIG.maxBackupsPorArquivo;
  for (let i = 0; i < excedentes; i++) {
    const caminho = await path.join(pasta, doArquivo[i].name);
    await fs.remove(caminho);
  }
}

import { CONFIG } from "../config.js";
import { criarBackup } from "./backup.js";
import { mesDeData } from "../utils/datas.js";

// Acesso preguiçoso (via Proxy) em vez de `const { fs, path } = window.__TAURI__`
// direto: este módulo só é importado quando o app roda dentro do Tauri (ver
// servicos/index.js), mas um `import` sempre executa o topo do arquivo — se
// destructurasse `window.__TAURI__` aqui, o simples ATO DE IMPORTAR este
// arquivo quebraria em qualquer contexto sem Tauri (ex: ao rodar os testes,
// ou na PWA, mesmo que ninguém chame nenhuma função daqui). Com o Proxy,
// `window.__TAURI__` só é acessado de verdade quando alguma função abaixo é
// efetivamente CHAMADA — e isso só acontece dentro do Tauri.
const fs = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.fs[propriedade] });
const path = new Proxy({}, { get: (_alvo, propriedade) => window.__TAURI__.path[propriedade] });

// Coleções que crescem indefinidamente com o tempo (uma ocorrência por mês,
// por gasto/ganho, ano após ano) são particionadas em um arquivo por mês:
// dados/<colecao>/<AAAA>/<MM>.json — em vez de um único JSON gigante.
// "configuracoes" não está aqui: é uma coleção pequena e não-temporal
// (preferências do usuário), então continua sendo um arquivo único.
const RESOLVEDORES_DE_MES = {
  gastos: (item) => item.mesReferencia || mesDeData(item.data),
  ganhos: (item) => mesDeData(item.data),
  lembretes: (item) => mesDeData(item.data),
};

const COLECOES_PARTICIONADAS = Object.keys(RESOLVEDORES_DE_MES);

// Dado um item de uma coleção particionada, decide em qual arquivo mensal
// ele deve morar. Exportada para que os módulos de página (gastos.js,
// ganhos.js, lembretes.js) consigam descobrir o mês ANTIGO de um item antes
// de editá-lo — necessário para mover o item de arquivo quando a edição muda
// a data/mês de referência (ver `salvarItem`).
export function resolverAnoMes(colecao, item) {
  return RESOLVEDORES_DE_MES[colecao](item);
}

async function pastaDados() {
  const raiz = await path.appLocalDataDir();
  return path.join(raiz, CONFIG.pastaDados);
}

async function pastaColecao(colecao) {
  return path.join(await pastaDados(), colecao);
}

// Garante que a pasta do ano exista e devolve o caminho do arquivo do mês.
async function caminhoShard(colecao, anoMes) {
  const [ano, mes] = anoMes.split("-");
  const pastaAno = await path.join(await pastaColecao(colecao), ano);
  if (!(await fs.exists(pastaAno))) {
    await fs.mkdir(pastaAno, { recursive: true });
  }
  return path.join(pastaAno, `${mes}.json`);
}

async function lerShard(colecao, anoMes) {
  const caminho = await caminhoShard(colecao, anoMes);
  if (!(await fs.exists(caminho))) return [];
  const conteudo = JSON.parse(await fs.readTextFile(caminho));
  return conteudo[colecao] || [];
}

// Grava o arquivo de um mês inteiro, criando backup do conteúdo anterior
// (mesmo mecanismo de backup automático que já existia por arquivo).
export async function salvarMes(colecao, anoMes, itens) {
  const caminho = await caminhoShard(colecao, anoMes);
  if (await fs.exists(caminho)) {
    await criarBackup(`${colecao}-${anoMes}`, caminho);
  }
  await fs.writeTextFile(caminho, JSON.stringify({ versao: CONFIG.versaoSchema, [colecao]: itens }, null, 2));
}

// Lista os meses ("AAAA-MM") que já têm arquivo gravado para uma coleção,
// sem precisar ler o conteúdo de nenhum deles.
export async function listarMesesExistentes(colecao) {
  const pasta = await pastaColecao(colecao);
  if (!(await fs.exists(pasta))) return [];

  const resultado = [];
  for (const entradaAno of await fs.readDir(pasta)) {
    if (!entradaAno.isDirectory) continue;
    const pastaAno = await path.join(pasta, entradaAno.name);
    for (const entradaMes of await fs.readDir(pastaAno)) {
      if (entradaMes.name && entradaMes.name.endsWith(".json")) {
        resultado.push(`${entradaAno.name}-${entradaMes.name.replace(".json", "")}`);
      }
    }
  }
  return resultado;
}

// Lê todos os meses de uma coleção e devolve um único array combinado —
// usado onde o app realmente precisa do histórico completo (telas que
// mostram tudo, exportação, etc). Prefira `salvarItem`/`removerItem` para
// escrita: eles tocam só o arquivo do mês afetado, não a coleção inteira.
export async function carregarColecao(colecao) {
  const itens = [];
  for (const anoMes of await listarMesesExistentes(colecao)) {
    itens.push(...(await lerShard(colecao, anoMes)));
  }
  return itens;
}

// Adiciona ou atualiza um único item, gravando apenas o arquivo do mês dele.
// Se a edição mudou o mês do item (ex: usuário trocou a data), passe
// `anoMesAntigo` (obtido com `resolverAnoMes` ANTES de alterar o item) para
// que o item seja removido do arquivo antigo e gravado no novo.
export async function salvarItem(colecao, item, anoMesAntigo = null) {
  const anoMesNovo = resolverAnoMes(colecao, item);

  if (anoMesAntigo && anoMesAntigo !== anoMesNovo) {
    await removerItem(colecao, item.id, anoMesAntigo);
  }

  const itensDoMes = await lerShard(colecao, anoMesNovo);
  const indice = itensDoMes.findIndex((i) => i.id === item.id);
  if (indice >= 0) itensDoMes[indice] = item;
  else itensDoMes.push(item);

  await salvarMes(colecao, anoMesNovo, itensDoMes);
}

// Remove um item pelo id, gravando apenas o arquivo do mês informado.
export async function removerItem(colecao, id, anoMes) {
  const itensDoMes = await lerShard(colecao, anoMes);
  const restantes = itensDoMes.filter((i) => i.id !== id);
  await salvarMes(colecao, anoMes, restantes);
}

// Adiciona vários itens novos de uma vez (ex: parcelas de um parcelamento,
// ocorrências de itens fixos geradas automaticamente). Agrupa por mês e grava
// só os arquivos realmente afetados, mesclando com o que já existia neles.
export async function salvarItensEmLote(colecao, novosItens) {
  const grupos = new Map();
  for (const item of novosItens) {
    const anoMes = resolverAnoMes(colecao, item);
    if (!grupos.has(anoMes)) grupos.set(anoMes, []);
    grupos.get(anoMes).push(item);
  }

  for (const [anoMes, itensDoGrupo] of grupos) {
    const existentes = await lerShard(colecao, anoMes);
    const porId = new Map(existentes.map((i) => [i.id, i]));
    for (const item of itensDoGrupo) porId.set(item.id, item);
    await salvarMes(colecao, anoMes, [...porId.values()]);
  }
}

// Substitui a coleção inteira (todos os meses) pelo conjunto de itens dado.
// Usado só em operações de restauração/importação em massa — não para
// edições do dia a dia, que devem usar `salvarItem`/`removerItem`.
export async function salvarColecaoCompleta(colecao, itens) {
  const grupos = new Map();
  for (const item of itens) {
    const anoMes = resolverAnoMes(colecao, item);
    if (!grupos.has(anoMes)) grupos.set(anoMes, []);
    grupos.get(anoMes).push(item);
  }

  // Meses que existiam antes mas não aparecem mais nos itens novos precisam
  // ser esvaziados (ex: restaurar um backup mais antigo, com menos dados).
  for (const anoMes of await listarMesesExistentes(colecao)) {
    if (!grupos.has(anoMes)) await salvarMes(colecao, anoMes, []);
  }

  for (const [anoMes, itensDoGrupo] of grupos) {
    await salvarMes(colecao, anoMes, itensDoGrupo);
  }
}

// ---------- Coleções de arquivo único (não particionadas por mês) ----------
// "configuracoes" e "metas" não crescem com o tempo como gastos/ganhos/lembretes
// (não há uma ocorrência nova todo mês) — continuam sendo um arquivo só.

const PADRAO_ARQUIVO_UNICO = {
  configuracoes: { versao: CONFIG.versaoSchema, configuracoes: {} },
  metas: { versao: CONFIG.versaoSchema, metas: [] },
};

async function caminhoArquivoUnico(nome) {
  return path.join(await pastaDados(), CONFIG.arquivos[nome]);
}

async function lerArquivoUnico(nome) {
  const caminho = await caminhoArquivoUnico(nome);
  return JSON.parse(await fs.readTextFile(caminho));
}

async function salvarArquivoUnico(nome, conteudo) {
  const caminho = await caminhoArquivoUnico(nome);
  if (await fs.exists(caminho)) {
    await criarBackup(nome, caminho);
  }
  await fs.writeTextFile(caminho, JSON.stringify(conteudo, null, 2));
}

export async function lerConfiguracoes() {
  return lerArquivoUnico("configuracoes");
}

export async function salvarConfiguracoes(conteudo) {
  await salvarArquivoUnico("configuracoes", conteudo);
}

// Metas/wishlist: nome, valor desejado, valor guardado, prioridade, observações.
// Não é particionada por mês porque não tem uma data/ocorrência mensal —
// é uma lista pequena que o usuário edita diretamente (como configurações).
export async function lerMetas() {
  return lerArquivoUnico("metas");
}

export async function salvarMetas(conteudo) {
  await salvarArquivoUnico("metas", conteudo);
}

// ---------- Migração automática do formato antigo (um JSON só por coleção) ----------

// Converte um eventual `ganhos.json`/`gastos.json`/`lembretes.json` (formato
// anterior a esta etapa, um arquivo só com todos os itens) para o novo
// formato particionado por mês. Idempotente: se o arquivo antigo não existir
// mais (já migrado, ou instalação nova), não faz nada.
async function migrarArquivoAntigoSeExistir(colecao) {
  const caminhoAntigo = await path.join(await pastaDados(), CONFIG.arquivos[colecao]);
  if (!(await fs.exists(caminhoAntigo))) return;

  const conteudo = JSON.parse(await fs.readTextFile(caminhoAntigo));
  const itens = conteudo[colecao] || [];

  const grupos = new Map();
  for (const item of itens) {
    const anoMes = resolverAnoMes(colecao, item);
    if (!grupos.has(anoMes)) grupos.set(anoMes, []);
    grupos.get(anoMes).push(item);
  }
  for (const [anoMes, itensDoGrupo] of grupos) {
    await salvarMes(colecao, anoMes, itensDoGrupo);
  }

  // Guarda o arquivo antigo como backup antes de remover, por segurança —
  // a restauração continua funcionando normalmente a partir desse backup.
  await criarBackup(`${colecao}-migrado`, caminhoAntigo);
  await fs.remove(caminhoAntigo);
}

// Cria as pastas/arquivos que ainda não existirem e migra dados antigos.
// Deve ser chamada uma vez na inicialização do aplicativo.
export async function inicializar() {
  const pasta = await pastaDados();
  if (!(await fs.exists(pasta))) {
    await fs.mkdir(pasta, { recursive: true });
  }

  for (const colecao of COLECOES_PARTICIONADAS) {
    await migrarArquivoAntigoSeExistir(colecao);
    const pastaDaColecao = await pastaColecao(colecao);
    if (!(await fs.exists(pastaDaColecao))) {
      await fs.mkdir(pastaDaColecao, { recursive: true });
    }
  }

  for (const nome of Object.keys(PADRAO_ARQUIVO_UNICO)) {
    const caminho = await caminhoArquivoUnico(nome);
    if (!(await fs.exists(caminho))) {
      await fs.writeTextFile(caminho, JSON.stringify(PADRAO_ARQUIVO_UNICO[nome], null, 2));
    }
  }
}

import { CONFIG } from "../config.js";
import { criarBackup } from "./backup.js";
import { mesDeData } from "../utils/datas.js";

// Acesso preguiçoso (via Proxy) em vez de `const { fs, path } = window.__TAURI__`
// direto: um `import` sempre executa o topo do arquivo, então destructurar
// `window.__TAURI__` aqui quebraria em qualquer contexto sem Tauri (ex: ao
// rodar os testes). Com o Proxy, `window.__TAURI__` só é acessado de verdade
// quando alguma função abaixo é efetivamente CHAMADA.
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
  try {
    const conteudo = JSON.parse(await fs.readTextFile(caminho));
    return conteudo[colecao] || [];
  } catch (erro) {
    // Um arquivo de mês corrompido (ex: gravação interrompida por queda de
    // energia) não pode derrubar `carregarColecao` inteira — os outros meses
    // são lidos em paralelo (Promise.all) e um `throw` aqui rejeitaria todos.
    // Trata como se o mês estivesse vazio, sem perder o arquivo (não é apagado).
    console.error(`Arquivo corrompido: ${colecao}/${anoMes} — tratando como vazio.`, erro);
    return [];
  }
}

// Grava só o conteúdo do arquivo do mês (sem mexer no índice — ver
// `salvarMes`, que é a função pública e mantém as duas coisas em sincronia).
async function gravarShard(colecao, anoMes, itens) {
  const caminho = await caminhoShard(colecao, anoMes);
  if (await fs.exists(caminho)) {
    await criarBackup(`${colecao}-${anoMes}`, caminho);
  }
  await fs.writeTextFile(caminho, JSON.stringify({ versao: CONFIG.versaoSchema, [colecao]: itens }, null, 2));
}

// ---------- Índice de meses (dados/<colecao>/indice.json) ----------
// Guarda a lista de meses ("AAAA-MM") que têm arquivo gravado, para não
// precisar varrer as pastas de ano toda vez que o app precisa saber quais
// meses existem — o custo de "listar meses" (`listarMesesExistentes`,
// chamada em todo carregamento de coleção) não deve crescer conforme os anos
// de uso se acumulam. Sem esse índice, cada carregamento faria 1 leitura de
// diretório por ano já usado (ex: 10 anos de uso = 10 leituras de diretório
// só para descobrir "quais meses existem", antes mesmo de ler os dados).
async function caminhoIndice(colecao) {
  return path.join(await pastaColecao(colecao), "indice.json");
}

async function lerIndice(colecao) {
  const caminho = await caminhoIndice(colecao);
  if (!(await fs.exists(caminho))) return null;
  try {
    const conteudo = JSON.parse(await fs.readTextFile(caminho));
    return Array.isArray(conteudo.meses) ? conteudo.meses : null;
  } catch {
    // Índice corrompido (ex: interrupção no meio de uma gravação) — trata
    // como se não existisse. `listarMesesExistentes` reconstrói sozinho a
    // partir das pastas de ano, sem perder nenhum dado real (o índice é só
    // um cache do que já está em disco, nunca a fonte de verdade).
    return null;
  }
}

async function salvarIndice(colecao, meses) {
  const caminho = await caminhoIndice(colecao);
  await fs.writeTextFile(caminho, JSON.stringify({ meses: [...meses].sort() }, null, 2));
}

// Atualiza o índice para refletir se `anoMes` tem dados (`presente`) ou não,
// sem reescrever o índice quando nada mudou. Usado pelas operações que
// gravam UM mês por vez (`salvarMes`) — para gravações em lote de vários
// meses de uma vez (`salvarItensEmLote`, `salvarColecaoCompleta`), o índice é
// recalculado e escrito uma única vez no final, para não arriscar duas
// gravações concorrentes do mesmo arquivo de índice se as escritas dos
// shards forem paralelizadas.
async function atualizarIndice(colecao, anoMes, presente) {
  const atual = new Set(await listarMesesExistentes(colecao));
  const tinha = atual.has(anoMes);
  if (presente === tinha) return;
  if (presente) atual.add(anoMes);
  else atual.delete(anoMes);
  await salvarIndice(colecao, [...atual]);
}

// Lista os meses ("AAAA-MM") que já têm arquivo gravado para uma coleção.
// Usa o índice quando ele existe (rápido: uma leitura só); se não existir
// ainda (instalação de antes desta otimização, ou primeira vez), varre as
// pastas de ano (mais lento, acontece só uma vez) e já grava o índice para
// as próximas chamadas serem rápidas.
export async function listarMesesExistentes(colecao) {
  const doIndice = await lerIndice(colecao);
  if (doIndice) return doIndice;

  const pasta = await pastaColecao(colecao);
  if (!(await fs.exists(pasta))) return [];

  const entradasAno = (await fs.readDir(pasta)).filter((e) => e.isDirectory);
  const mesesPorAno = await Promise.all(
    entradasAno.map(async (entradaAno) => {
      const pastaAno = await path.join(pasta, entradaAno.name);
      const entradasMes = await fs.readDir(pastaAno);
      return entradasMes.filter((e) => e.name && e.name.endsWith(".json")).map((e) => `${entradaAno.name}-${e.name.replace(".json", "")}`);
    })
  );
  const meses = mesesPorAno.flat();
  await salvarIndice(colecao, meses);
  return meses;
}

// Lê todos os meses de uma coleção e devolve um único array combinado —
// usado onde o app realmente precisa do histórico completo (telas que
// mostram tudo, exportação, etc). As leituras dos meses são paralelas (não
// uma de cada vez): com muitos anos de uso, isso é o que evita que o tempo
// de carregamento cresça linearmente com a quantidade de arquivos. Prefira
// `salvarItem`/`removerItem` para escrita: eles tocam só o arquivo do mês
// afetado, não a coleção inteira.
export async function carregarColecao(colecao) {
  const meses = await listarMesesExistentes(colecao);
  const porMes = await Promise.all(meses.map((anoMes) => lerShard(colecao, anoMes)));
  return porMes.flat();
}

// Grava o arquivo de um mês inteiro (criando backup do conteúdo anterior,
// como antes) e mantém o índice de meses em dia.
export async function salvarMes(colecao, anoMes, itens) {
  await gravarShard(colecao, anoMes, itens);
  await atualizarIndice(colecao, anoMes, itens.length > 0);
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
// só os arquivos realmente afetados, mesclando com o que já existia neles —
// as leituras e as escritas dos meses afetados são paralelas entre si (o
// índice, no entanto, é lido e gravado uma única vez no final, não por mês,
// para não arriscar duas escritas concorrentes do mesmo arquivo de índice).
export async function salvarItensEmLote(colecao, novosItens) {
  const grupos = new Map();
  for (const item of novosItens) {
    const anoMes = resolverAnoMes(colecao, item);
    if (!grupos.has(anoMes)) grupos.set(anoMes, []);
    grupos.get(anoMes).push(item);
  }

  const mesesAfetados = [...grupos.keys()];
  const existentesPorMes = await Promise.all(mesesAfetados.map((anoMes) => lerShard(colecao, anoMes)));

  await Promise.all(
    mesesAfetados.map((anoMes, i) => {
      const porId = new Map(existentesPorMes[i].map((item) => [item.id, item]));
      for (const item of grupos.get(anoMes)) porId.set(item.id, item);
      return gravarShard(colecao, anoMes, [...porId.values()]);
    })
  );

  const indiceAtual = new Set(await listarMesesExistentes(colecao));
  for (const anoMes of mesesAfetados) indiceAtual.add(anoMes);
  await salvarIndice(colecao, [...indiceAtual]);
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
  const mesesExistentes = await listarMesesExistentes(colecao);
  const escritas = [];
  for (const anoMes of mesesExistentes) {
    if (!grupos.has(anoMes)) escritas.push(gravarShard(colecao, anoMes, []));
  }
  for (const [anoMes, itensDoGrupo] of grupos) {
    escritas.push(gravarShard(colecao, anoMes, itensDoGrupo));
  }
  await Promise.all(escritas);

  // Índice final = só os meses que ficaram com itens de verdade.
  await salvarIndice(colecao, [...grupos.keys()]);
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

// ---------- Apagar todos os dados ----------
// Zera gastos, ganhos, lembretes (todos os meses) e metas — usado pelo botão
// "Apagar todos os dados" (Exportação). "configuracoes" nunca é apagado por
// essa função de propósito (não é dado financeiro do usuário).
export async function apagarTodosOsDados() {
  for (const colecao of COLECOES_PARTICIONADAS) {
    await salvarColecaoCompleta(colecao, []);
  }
  await salvarMetas({ versao: CONFIG.versaoSchema, metas: [] });
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

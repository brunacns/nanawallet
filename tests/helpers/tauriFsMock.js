// Mock de window.__TAURI__.fs/path/dialog/app para os testes automatizados.
//
// Não usa memória (Map/objeto) — chama as APIs reais do Node (fs/promises)
// sobre uma pasta temporária de verdade em disco, no mesmo espírito dos
// harnesses manuais já usados nas sessões de desenvolvimento deste projeto
// (documentado em CLAUDE.md): testar a camada de armazenamento contra
// operações de arquivo reais, não contra uma simulação em memória que
// poderia mascarar bugs de path/mkdir/leitura concorrente.
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, copyFile as copyFileFs, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArmazenamentoLocalService } from "../../src/js/servicos/ArmazenamentoLocalService.js";

export function criarMockTauri(raizAppData) {
  // Config mutável para os testes que precisam simular a escolha do usuário
  // num diálogo nativo (ex: "qual arquivo restaurar") — sobrescrita
  // diretamente pelo teste antes de disparar a ação (`mock.dialog.config.proximoArquivoParaAbrir = "..."`).
  const configDialog = { proximoArquivoParaAbrir: null, proximoCaminhoParaSalvar: null };

  return {
    dialog: {
      config: configDialog,
      save: async () => configDialog.proximoCaminhoParaSalvar,
      open: async () => configDialog.proximoArquivoParaAbrir,
    },
    fs: {
      exists: async (p) => existsSync(p),
      readTextFile: async (p) => readFile(p, "utf-8"),
      writeTextFile: async (p, conteudo) => {
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, conteudo, "utf-8");
      },
      mkdir: async (p) => mkdir(p, { recursive: true }),
      readDir: async (p) => {
        if (!existsSync(p)) return [];
        const entradas = await readdir(p, { withFileTypes: true });
        return entradas.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
      },
      remove: async (p) => rm(p, { recursive: true, force: true }),
      copyFile: async (origem, destino) => {
        await mkdir(path.dirname(destino), { recursive: true });
        await copyFileFs(origem, destino);
      },
    },
    path: {
      appLocalDataDir: async () => raizAppData,
      join: async (...partes) => path.join(...partes.filter(Boolean)),
    },
    app: { getVersion: async () => "0.0.0-teste" },
  };
}

/**
 * Cria uma pasta temporária real e instala o mock em `globalThis.window.__TAURI__`.
 * Devolve `{ raiz, limpar }` — `limpar()` remove a pasta temporária do disco.
 */
export async function criarAmbienteTauri() {
  const raiz = await mkdtemp(path.join(tmpdir(), "nanawallet-test-"));
  if (!globalThis.window) globalThis.window = {};
  globalThis.window.__TAURI__ = criarMockTauri(raiz);
  // Desde a migração para Supabase (Fase 10), servicos/index.js usa
  // ArmazenamentoSupabaseService por padrão — sem este hook, todo teste que
  // importa os serviços reais (transacoesGastos, carteirasService etc.)
  // passaria a bater no Supabase de verdade, sem sessão, em vez de usar os
  // arquivos JSON da pasta temporária acima. Só existe em ambiente de teste;
  // o app real nunca define essa variável.
  globalThis.__armazenamentoParaTestes = new ArmazenamentoLocalService();
  return {
    raiz,
    // maxRetries/retryDelay: no Windows, remover a pasta logo após uma
    // gravação (ex: backup automático) às vezes esbarra em ENOTEMPTY porque
    // o SO ainda não liberou o handle do arquivo recém-fechado — sem isso, um
    // teste que salva duas vezes em sequência rápida (ex: criar um item e
    // depois alternar seu status) falha na limpeza mesmo com as asserções OK.
    limpar: () => {
      delete globalThis.__armazenamentoParaTestes;
      return rm(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

/** Copia um diretório de fixture (JSON pré-existente) para a pasta temporária, simulando uma instalação com dados já gravados. */
export async function copiarFixture(origemDir, destinoDir) {
  await cp(origemDir, destinoDir, { recursive: true });
}

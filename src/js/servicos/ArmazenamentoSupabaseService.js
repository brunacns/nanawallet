import { StorageService } from "./StorageService.js";
import * as cliente from "../sincronizacao/ClienteSupabase.js";
import { conversores } from "../sincronizacao/mapeamentoColunas.js";

const CHAVE_SESSAO_LOCAL = "nanawallet_sessao_pwa";

// Implementação de StorageService para a PWA: busca e grava direto no
// Supabase (sem cache/fila local — diferente de ArmazenamentoLocalService,
// que é sempre a fonte de verdade offline-first do app Tauri). Faz sentido
// porque a PWA não tem acesso a arquivos locais (roda só no navegador) e o
// pedido foi explicitamente "a PWA deve buscar dados no Supabase".
//
// Também cuida da própria autenticação (login/cadastro/logout), separada da
// autenticação do app Tauri (essa vive em sincronizacao/SincronizacaoService.js,
// que tem fila offline e sincronização em segundo plano — coisas que não
// fazem sentido aqui, já que toda operação já é direto na nuvem).
export class ArmazenamentoSupabaseService extends StorageService {
  constructor() {
    super();
    this._sessao = this._lerSessaoSalva();
    this._callbacksAutenticacao = [];
  }

  // ---------- Autenticação ----------

  estaAutenticada() {
    return !!this._sessao;
  }

  obterEmail() {
    return this._sessao?.user?.email ?? null;
  }

  aoAtualizarAutenticacao(callback) {
    this._callbacksAutenticacao.push(callback);
  }

  // Devolve `{ precisaConfirmarEmail }` — se o Supabase exigir confirmação
  // por e-mail, não há sessão ainda e a usuária precisa confirmar antes de
  // conseguir usar `entrar`.
  async cadastrar(email, senha) {
    const resposta = await cliente.cadastrar(email, senha);
    if (resposta?.access_token) {
      this._definirSessao(resposta);
      return { precisaConfirmarEmail: false };
    }
    return { precisaConfirmarEmail: true };
  }

  async entrar(email, senha) {
    const sessao = await cliente.entrar(email, senha);
    this._definirSessao(sessao);
  }

  async sair() {
    try {
      await cliente.sair(this._sessao);
    } catch {
      // mesmo se o logout no servidor falhar (ex: sem internet), esquece a
      // sessão local — a usuária pediu para sair.
    }
    this._sessao = null;
    localStorage.removeItem(CHAVE_SESSAO_LOCAL);
    this._notificarAutenticacao();
  }

  _definirSessao(sessao) {
    this._sessao = { ...sessao, expiraEm: Date.now() + sessao.expires_in * 1000 };
    localStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(this._sessao));
    this._notificarAutenticacao();
  }

  _lerSessaoSalva() {
    try {
      const bruto = localStorage.getItem(CHAVE_SESSAO_LOCAL);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  }

  _notificarAutenticacao() {
    this._callbacksAutenticacao.forEach((callback) => callback(this.estaAutenticada()));
  }

  async _sessaoValida() {
    if (!this._sessao) throw new Error("Não conectada — entre com sua conta para carregar os dados.");
    const prestesAVencer = Date.now() > this._sessao.expiraEm - 60_000;
    if (prestesAVencer && this._sessao.refresh_token) {
      const nova = await cliente.renovarSessao(this._sessao.refresh_token);
      this._definirSessao(nova);
    }
    return this._sessao;
  }

  // ---------- Contrato StorageService ----------

  async inicializar() {
    // Nada para preparar (sem pastas/arquivos locais) — a sessão salva já é
    // restaurada no construtor.
  }

  async listar(colecao) {
    const sessao = await this._sessaoValida();
    const linhas = await cliente.buscarAlteracoes(colecao, sessao, null); // null = busca tudo
    const conversor = conversores[colecao];
    return linhas.filter((linha) => !linha.excluido_em).map(conversor.paraLocal);
  }

  async salvar(colecao, item) {
    const sessao = await this._sessaoValida();
    const conversor = conversores[colecao];
    await cliente.enviarSalvar(colecao, conversor.paraLinha(item, sessao.user.id), sessao);
    return item;
  }

  async salvarEmLote(colecao, itens) {
    const sessao = await this._sessaoValida();
    const conversor = conversores[colecao];
    for (const item of itens) {
      await cliente.enviarSalvar(colecao, conversor.paraLinha(item, sessao.user.id), sessao);
    }
  }

  async remover(colecao, id) {
    const sessao = await this._sessaoValida();
    await cliente.enviarRemocao(colecao, id, sessao);
  }

  // Usado só por uma eventual restauração/importação em massa — a PWA não
  // tem essa tela hoje, mas implementamos por completude do contrato.
  async substituirTudo(colecao, itens) {
    const sessao = await this._sessaoValida();
    const conversor = conversores[colecao];
    for (const item of itens) {
      await cliente.enviarSalvar(colecao, conversor.paraLinha(item, sessao.user.id), sessao);
    }
  }

  async lerConfig() {
    throw new Error("ArmazenamentoSupabaseService não gerencia configurações locais.");
  }

  async salvarConfig() {
    throw new Error("ArmazenamentoSupabaseService não gerencia configurações locais.");
  }
}

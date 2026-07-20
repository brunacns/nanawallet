import * as cliente from "./ClienteSupabase.js";
import { conversores } from "./mapeamentoColunas.js";
import { lerEstadoSincronizacao, salvarEstadoSincronizacao } from "./armazenamentoSincronizacao.js";
import { CONFIG } from "../config.js";

// Motor de sincronização: Windows (Tauri) <-> cache local (JSON, sempre a
// fonte de verdade para o app funcionar offline) <-> Supabase.
//
// Design (diferente do stub especulativo da etapa anterior, que imaginava a
// sincronização como um StorageService alternativo — substituível no lugar
// de ArmazenamentoLocalService): a arquitetura pedida deixou explícito que o
// "cache local" fica ENTRE o app e o Supabase, ou seja, o armazenamento
// local continua sendo o caminho principal de leitura/escrita (offline-first
// de verdade), e a sincronização é um processo à parte que reconcilia local
// com remoto em segundo plano — não uma troca de backend.
//
// Prevenção de conflitos: "last-write-wins" por item, usando `atualizadoEm`.
// A cada ciclo de sincronização: 1) busca no Supabase tudo que mudou desde a
// última sincronização e aplica localmente — EXCETO itens que têm uma
// mudança local ainda não enviada (fila), que sempre têm prioridade; 2)
// envia a fila pendente. Como cada gasto/ganho/lembrete/meta é uma linha
// independente, um conflito nunca derruba a coleção inteira — só afeta,
// na pior das hipóteses, o item específico editado nos dois lados enquanto
// ambos os dispositivos estavam offline (cenário raro para uma única
// usuária com dois aparelhos).
export class SincronizacaoService {
  /** @param {object} servicos - `{ gastos, ganhos, lembretes, metas }`, uma instância de ColecaoService cada. */
  constructor(servicos) {
    this.servicos = servicos;
    this._sessao = null;
    this._ultimaSincronizacao = null;
    this._automatica = false;
    this._fila = new Map(); // chave "colecao:id" -> { colecao, operacao: "salvar"|"remover", item|id }
    this._sincronizando = false;
    this._timer = null;
    this._ultimoErro = null;
    this._callbacksEstado = [];
  }

  /** Carrega o estado salvo (sessão, última sincronização, fila) e liga os serviços de domínio. */
  async iniciar() {
    const estado = await lerEstadoSincronizacao();
    this._sessao = estado.sessao;
    this._ultimaSincronizacao = estado.ultimaSincronizacao;
    this._fila = new Map(estado.fila.map((entrada) => [`${entrada.colecao}:${entrada.item?.id ?? entrada.id}`, entrada]));

    for (const [colecao, servico] of Object.entries(this.servicos)) {
      servico.aoMutar((evento) => this._enfileirar(colecao, evento));
    }

    window.addEventListener("online", () => {
      if (this.estaConectada()) this.sincronizarAgora();
    });

    if (estado.automatica) this.ativarAutomatica();
  }

  aoAtualizarEstado(callback) {
    this._callbacksEstado.push(callback);
  }

  obterEstado() {
    return {
      conectada: this.estaConectada(),
      email: this._sessao?.user?.email ?? null,
      sincronizando: this._sincronizando,
      ultimaSincronizacao: this._ultimaSincronizacao,
      tamanhoFila: this._fila.size,
      automatica: this._automatica,
      ultimoErro: this._ultimoErro,
    };
  }

  estaConectada() {
    return !!this._sessao;
  }

  // ---------- Autenticação ----------

  // Devolve `{ precisaConfirmarEmail }` — se o projeto exigir confirmação por
  // e-mail (padrão do Supabase), a usuária precisa confirmar antes de poder
  // usar `entrar`.
  async cadastrar(email, senha) {
    const resposta = await cliente.cadastrar(email, senha);
    if (resposta?.access_token) {
      await this._definirSessao(resposta);
      await this.sincronizarAgora();
      return { precisaConfirmarEmail: false };
    }
    return { precisaConfirmarEmail: true };
  }

  async entrar(email, senha) {
    const sessao = await cliente.entrar(email, senha);
    await this._definirSessao(sessao);
    await this.sincronizarAgora();
  }

  async sair() {
    this.desativarAutomatica();
    try {
      await cliente.sair(this._sessao);
    } catch {
      // mesmo se o logout no servidor falhar (ex: sem internet), esquece a
      // sessão local — a usuária pediu para sair.
    }
    this._sessao = null;
    await this._persistir();
    this._notificar();
  }

  async _definirSessao(sessao) {
    this._sessao = { ...sessao, expiraEm: Date.now() + sessao.expires_in * 1000 };
    await this._persistir();
    this._notificar();
  }

  async _garantirSessaoValida() {
    if (!this._sessao) return;
    const prestesAVencer = Date.now() > this._sessao.expiraEm - 60_000;
    if (prestesAVencer && this._sessao.refresh_token) {
      const nova = await cliente.renovarSessao(this._sessao.refresh_token);
      await this._definirSessao(nova);
    }
  }

  // ---------- Sincronização automática ----------

  ativarAutomatica() {
    this._automatica = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.sincronizarAgora(), CONFIG.sincronizacao.intervaloAutomaticoMs);
    this._persistir();
    this._notificar();
  }

  desativarAutomatica() {
    this._automatica = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._persistir();
    this._notificar();
  }

  // ---------- Sincronização manual / ciclo principal ----------

  async sincronizarAgora() {
    if (!this._sessao || this._sincronizando) return;

    this._sincronizando = true;
    this._notificar();

    try {
      await this._garantirSessaoValida();

      for (const colecao of Object.keys(this.servicos)) {
        await this._puxarAlteracoes(colecao);
      }
      await this._enviarFilaPendente();

      this._ultimaSincronizacao = new Date().toISOString();
      this._ultimoErro = null;
      await this._persistir();
    } catch (erro) {
      // Mantém a fila e a última sincronização intactas para tentar de novo
      // no próximo ciclo — nenhuma mudança local é perdida por causa disso.
      // Não relança o erro (chamadas automáticas/em segundo plano não devem
      // quebrar nada) — quem quiser saber que falhou lê `ultimoErro` no estado.
      this._ultimoErro = erro.message;
      console.error("Erro ao sincronizar:", erro);
    } finally {
      this._sincronizando = false;
      this._notificar();
    }
  }

  async _puxarAlteracoes(colecao) {
    const linhas = await cliente.buscarAlteracoes(colecao, this._sessao, this._ultimaSincronizacao);
    const conversor = conversores[colecao];
    const servico = this.servicos[colecao];

    for (const linha of linhas ?? []) {
      const chave = `${colecao}:${linha.id}`;
      if (this._fila.has(chave)) continue; // mudança local pendente tem prioridade

      if (linha.excluido_em) {
        await servico.removerRemoto(linha.id);
      } else {
        await servico.aplicarRemoto(conversor.paraLocal(linha));
      }
    }
  }

  async _enviarFilaPendente() {
    for (const [chave, entrada] of [...this._fila]) {
      const conversor = conversores[entrada.colecao];

      if (entrada.operacao === "remover") {
        await cliente.enviarRemocao(entrada.colecao, entrada.id, this._sessao);
      } else {
        await cliente.enviarSalvar(entrada.colecao, conversor.paraLinha(entrada.item, this._sessao.user.id), this._sessao);
      }

      this._fila.delete(chave);
      await this._persistir(); // progresso incremental — se cair no meio, não reenvia nem perde o que já foi
    }
  }

  // Chamado toda vez que a usuária cria/edita/exclui algo em qualquer coleção
  // (ver ColecaoService.aoMutar) — guarda na fila local, para enviar no
  // próximo ciclo de sincronização (manual ou automática).
  _enfileirar(colecao, evento) {
    if (evento.operacao === "salvarEmLote") {
      for (const item of evento.itens) this._fila.set(`${colecao}:${item.id}`, { colecao, operacao: "salvar", item });
    } else if (evento.operacao === "salvar") {
      this._fila.set(`${colecao}:${evento.item.id}`, { colecao, operacao: "salvar", item: evento.item });
    } else if (evento.operacao === "remover") {
      this._fila.set(`${colecao}:${evento.id}`, { colecao, operacao: "remover", id: evento.id });
    }
    this._persistir();
    this._notificar();
  }

  async _persistir() {
    await salvarEstadoSincronizacao({
      sessao: this._sessao,
      ultimaSincronizacao: this._ultimaSincronizacao,
      automatica: this._automatica,
      fila: [...this._fila.values()],
    });
  }

  _notificar() {
    const estado = this.obterEstado();
    this._callbacksEstado.forEach((callback) => callback(estado));
  }
}


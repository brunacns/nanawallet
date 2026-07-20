export const CONFIG = {
  versaoSchema: 1,
  pastaDados: "dados",
  pastaBackups: "backups",
  maxBackupsPorArquivo: 15,
  arquivos: {
    ganhos: "ganhos.json",
    gastos: "gastos.json",
    lembretes: "lembretes.json",
    configuracoes: "configuracoes.json",
    metas: "metas.json",
  },
  // Projeto Supabase "NanaWallet" — a chave é "publishable" (segura para
  // embutir no app: só funciona em conjunto com as políticas de RLS já
  // criadas nas tabelas, que restringem cada linha à própria usuária logada).
  sincronizacao: {
    supabaseUrl: "https://wolukqigtrwgxtizpeaq.supabase.co",
    supabaseAnonKey: "sb_publishable_u0kt-v2DG3ACL1HanVo2IA_DE684XSt",
    intervaloAutomaticoMs: 5 * 60 * 1000,
  },
};

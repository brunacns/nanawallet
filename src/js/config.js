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
    categorias: "categorias.json",
  },
  // URL e chave publicável do projeto Supabase ("nanawallet"). Não são
  // segredo: a chave publicável é protegida por Row Level Security, feita
  // pelo próprio Supabase para ficar visível no frontend — a mesma
  // informação aparece no DevTools de qualquer site que usa Supabase. A
  // "service_role key" (essa sim secreta) nunca deve ser colocada aqui.
  supabase: {
    url: "https://hqrigzitalqgdrelmxja.supabase.co",
    publishableKey: "sb_publishable_tLvybNB99mLvKHnFlQ87vg_QKVKTFpA",
  },
};

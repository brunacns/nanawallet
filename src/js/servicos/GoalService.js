import { ColecaoService } from "./ColecaoService.js";

// Serviço de domínio para metas/wishlist. Assim como ReminderService, usa só
// o CRUD genérico de ColecaoService — a diferença de "metas" ser guardada
// como arquivo único (não particionado por mês) fica escondida dentro de
// ArmazenamentoLocalService, invisível aqui.
export class GoalService extends ColecaoService {
  constructor(storage) {
    super({
      colecao: "metas",
      storage,
      // Migração: metas salvas antes dos campos de produto da Wishlist
      // (preço deixou de ser obrigatório; loja/link/imagemUrl são novos)
      // não tinham loja/link/imagemUrl — tratados como "não informado".
      // O Supabase já devolve essas colunas como null para linhas antigas;
      // esta migração cobre só o caminho local usado pelos testes.
      aplicarMigracaoCampos: (m) => ({ loja: null, link: null, imagemUrl: null, ...m }),
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, reauthenticateAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import { BUCKET_COMPROVANTES, chunk } from "@/lib/backup-comprovantes";

// Backups com centenas de itens precisam de mais tempo do que o padrão da
// função para excluir todos os arquivos do Storage e atualizar as despesas.
export const maxDuration = 300;
export const runtime = "nodejs";

const TAMANHO_LOTE_REMOCAO = 100;

interface ConfirmarExclusaoBody {
  senha: string;
}

/**
 * Exclui definitivamente, do bucket `comprovantes`, os arquivos originais de
 * um backup já gerado. Exige reautenticação por senha do próprio admin
 * autenticado imediatamente antes de apagar qualquer arquivo — a sessão por
 * si só não é suficiente para esta ação destrutiva.
 *
 * Nunca exclui linhas de `despesas`: apenas limpa comprovante_url/nome e
 * marca comprovante_arquivado_em/comprovante_backup_id.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: backupId } = await params;

  const auth = await requireAdmin(["administrador", "financeiro"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ConfirmarExclusaoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!auth.admin.email) {
    return NextResponse.json({ error: "Não foi possível identificar o e-mail do administrador logado." }, { status: 400 });
  }

  const reauth = await reauthenticateAdmin(auth.admin.email, body.senha);
  if (!reauth.ok) {
    return NextResponse.json({ error: reauth.error }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: backupRow, error: backupError } = await supabase
      .from("backup_comprovantes")
      .select("id, status")
      .eq("id", backupId)
      .single();

    if (backupError || !backupRow) {
      return NextResponse.json({ error: "Backup não encontrado." }, { status: 404 });
    }
    if (backupRow.status === "excluido") {
      return NextResponse.json({ error: "Este backup já teve seus arquivos originais excluídos." }, { status: 409 });
    }

    const { data: itens, error: itensError } = await supabase
      .from("backup_comprovantes_itens")
      .select("id, despesa_id, storage_path_original, excluido")
      .eq("backup_id", backupId)
      .eq("excluido", false);

    if (itensError) {
      return NextResponse.json({ error: `Erro ao buscar itens do backup: ${itensError.message}` }, { status: 500 });
    }
    if (!itens || itens.length === 0) {
      return NextResponse.json({ error: "Nenhum item pendente de exclusão neste backup." }, { status: 400 });
    }

    // Remove os arquivos do Storage em lotes (a API aceita múltiplos paths
    // por chamada) em vez de uma requisição por item — para 161+ itens isso
    // reduz de centenas de round-trips para poucas chamadas.
    const lotes = chunk(itens, TAMANHO_LOTE_REMOCAO);
    const pathsComErro = new Set<string>();

    for (const lote of lotes) {
      const { data: removidos, error: removeError } = await supabase.storage
        .from(BUCKET_COMPROVANTES)
        .remove(lote.map((i) => i.storage_path_original));

      if (removeError) {
        // Falha na chamada inteira do lote — trata todos os itens do lote como não removidos.
        lote.forEach((i) => pathsComErro.add(i.storage_path_original));
        continue;
      }

      const removidosSet = new Set((removidos ?? []).map((r) => r.name));
      lote.forEach((i) => {
        // Alguns provedores retornam sucesso mesmo se o arquivo já não existia;
        // só tratamos como falha se o path não aparecer na resposta E não for
        // um "já não existe" (tratado como sucesso, pois o objetivo é liberar espaço).
        if (removidosSet.size > 0 && !removidosSet.has(i.storage_path_original)) {
          pathsComErro.add(i.storage_path_original);
        }
      });
    }

    const itensComSucesso = itens.filter((i) => !pathsComErro.has(i.storage_path_original));
    const itensComFalha = itens.filter((i) => pathsComErro.has(i.storage_path_original));
    const agora = new Date().toISOString();

    if (itensComSucesso.length > 0) {
      const idsItens = itensComSucesso.map((i) => i.id);
      const idsDespesas = itensComSucesso.map((i) => i.despesa_id);

      await supabase.from("backup_comprovantes_itens").update({ excluido: true }).in("id", idsItens);
      await supabase
        .from("despesas")
        .update({ comprovante_url: null, comprovante_nome: null, comprovante_arquivado_em: agora, comprovante_backup_id: backupId })
        .in("id", idsDespesas);
    }

    if (itensComFalha.length > 0) {
      await supabase
        .from("backup_comprovantes_itens")
        .update({ erro_exclusao: "Falha ao remover do Storage." })
        .in("id", itensComFalha.map((i) => i.id));
    }

    const falhas = itensComFalha.map((i) => i.storage_path_original);

    await supabase
      .from("backup_comprovantes")
      .update({
        status: falhas.length === 0 ? "excluido" : "gerado",
        excluido_por: auth.admin.userId,
        excluido_em: falhas.length === 0 ? agora : null,
      })
      .eq("id", backupId);

    await supabase.from("auditoria").insert({
      acao: "DELETE",
      entidade: "backup_comprovantes",
      entidade_id: backupId,
      user_id: auth.admin.userId,
      detalhes: `Exclusão definitiva de ${itensComSucesso.length} comprovante(s) original(is) do Storage${
        falhas.length > 0 ? ` (${falhas.length} falha(s))` : ""
      }.`,
      created_at: agora,
    });

    return NextResponse.json({
      excluidos: itensComSucesso.length,
      falhas,
      concluido: falhas.length === 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao confirmar a exclusão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

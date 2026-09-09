import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, reauthenticateAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import { BUCKET_COMPROVANTES } from "@/lib/backup-comprovantes";

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

  const auth = await requireAdmin();
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

  let excluidosComSucesso = 0;
  const falhas: string[] = [];
  const agora = new Date().toISOString();

  for (const item of itens) {
    const { error: removeError } = await supabase.storage.from(BUCKET_COMPROVANTES).remove([item.storage_path_original]);

    if (removeError) {
      falhas.push(item.storage_path_original);
      await supabase
        .from("backup_comprovantes_itens")
        .update({ erro_exclusao: removeError.message })
        .eq("id", item.id);
      continue;
    }

    await supabase.from("backup_comprovantes_itens").update({ excluido: true }).eq("id", item.id);
    await supabase
      .from("despesas")
      .update({ comprovante_url: null, comprovante_nome: null, comprovante_arquivado_em: agora, comprovante_backup_id: backupId })
      .eq("id", item.despesa_id);
    excluidosComSucesso += 1;
  }

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
    detalhes: `Exclusão definitiva de ${excluidosComSucesso} comprovante(s) original(is) do Storage${
      falhas.length > 0 ? ` (${falhas.length} falha(s))` : ""
    }.`,
    created_at: agora,
  });

  return NextResponse.json({
    excluidos: excluidosComSucesso,
    falhas,
    concluido: falhas.length === 0,
  });
}

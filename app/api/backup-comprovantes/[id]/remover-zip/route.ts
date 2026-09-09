import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, reauthenticateAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import { BUCKET_BACKUPS } from "@/lib/backup-comprovantes";

export const maxDuration = 60;
export const runtime = "nodejs";

interface RemoverZipBody {
  senha: string;
}

/**
 * Remove definitivamente o(s) arquivo(s) ZIP de um backup do bucket
 * `backups-comprovantes`, liberando o armazenamento ocupado por ele.
 *
 * Só é permitido quando os comprovantes originais já foram excluídos
 * (status === 'excluido') — o ZIP é a única cópia restante desses arquivos,
 * então removê-lo antes disso apagaria dados sem deixar nenhum backup.
 * Exige a mesma reautenticação por senha usada na exclusão dos originais,
 * pois também é uma ação destrutiva e irreversível.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: backupId } = await params;

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RemoverZipBody;
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
      .select("id, status, zip_storage_paths")
      .eq("id", backupId)
      .single();

    if (backupError || !backupRow) {
      return NextResponse.json({ error: "Backup não encontrado." }, { status: 404 });
    }
    if (backupRow.status !== "excluido") {
      return NextResponse.json(
        { error: "Só é possível remover o ZIP depois que os comprovantes originais tiverem sido excluídos." },
        { status: 409 },
      );
    }

    const paths = (backupRow.zip_storage_paths ?? []) as string[];
    if (paths.length === 0) {
      return NextResponse.json({ error: "Este backup não possui arquivo ZIP para remover." }, { status: 400 });
    }

    const { error: removeError } = await supabase.storage.from(BUCKET_BACKUPS).remove(paths);
    if (removeError) {
      return NextResponse.json({ error: `Erro ao remover o(s) arquivo(s) ZIP: ${removeError.message}` }, { status: 500 });
    }

    await supabase
      .from("backup_comprovantes")
      .update({ status: "expirado", zip_storage_paths: [] })
      .eq("id", backupId);

    await supabase.from("auditoria").insert({
      acao: "DELETE",
      entidade: "backup_comprovantes",
      entidade_id: backupId,
      user_id: auth.admin.userId,
      detalhes: `Arquivo(s) ZIP do backup removido(s) do armazenamento (${paths.length} arquivo(s)).`,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ removido: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao remover o arquivo ZIP.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

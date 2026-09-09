import { NextResponse } from "next/server";
import { requireAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import { BUCKET_BACKUPS } from "@/lib/backup-comprovantes";

/** Lista o histórico de backups já gerados, com link de download quando o ZIP ainda existe. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("backup_comprovantes")
    .select(
      "id, criado_em, corte_data, total_itens, total_bytes_estimado, status, excluido_em, zip_storage_path, criador:criado_por(nome), excluidor:excluido_por(nome)",
    )
    .order("criado_em", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: `Erro ao buscar histórico: ${error.message}` }, { status: 500 });
  }

  const itens = await Promise.all(
    (data ?? []).map(async (row) => {
      let downloadUrl: string | null = null;
      if (row.zip_storage_path) {
        const { data: signed } = await supabase.storage.from(BUCKET_BACKUPS).createSignedUrl(row.zip_storage_path, 60 * 15);
        downloadUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        criadoEm: row.criado_em,
        corteData: row.corte_data,
        totalItens: row.total_itens,
        totalBytesEstimado: row.total_bytes_estimado,
        status: row.status,
        excluidoEm: row.excluido_em,
        criadorNome: (row as unknown as { criador: { nome: string } | null }).criador?.nome ?? "—",
        excluidorNome: (row as unknown as { excluidor: { nome: string } | null }).excluidor?.nome ?? null,
        downloadUrl,
      };
    }),
  );

  return NextResponse.json({ itens });
}

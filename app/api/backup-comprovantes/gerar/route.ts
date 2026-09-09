import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { requireAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import {
  avaliarElegibilidade,
  extractStoragePathFromSignedUrl,
  sanitizeZipEntryName,
  BUCKET_COMPROVANTES,
  BUCKET_BACKUPS,
  type DespesaElegivel,
} from "@/lib/backup-comprovantes";

interface GerarBackupBody {
  corteData: string;
  despesaIds: string[];
}

/**
 * Gera um backup em ZIP dos comprovantes selecionados e faz upload no bucket
 * privado backups-comprovantes. NÃO exclui nenhum arquivo do bucket
 * `comprovantes` — a exclusão definitiva só ocorre depois, na rota de
 * confirmação, que exige reautenticação por senha.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: GerarBackupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { corteData, despesaIds } = body;
  if (!corteData || !/^\d{4}-\d{2}-\d{2}$/.test(corteData)) {
    return NextResponse.json({ error: "Data de corte inválida." }, { status: 400 });
  }
  if (!Array.isArray(despesaIds) || despesaIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma despesa." }, { status: 400 });
  }
  if (despesaIds.length > 2000) {
    return NextResponse.json({ error: "Selecione no máximo 2000 despesas por backup." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Revalida elegibilidade no servidor — nunca confia na lista enviada pelo
  // cliente sem confirmar de novo contra o banco (a lista pode estar
  // desatualizada entre a busca e a geração do backup).
  const { data: despesasData, error: despesasError } = await supabase
    .from("despesas")
    .select("id, data_despesa, status_erp, status_aprovacao, comprovante_url, comprovante_nome, comprovante_arquivado_em, valor, cliente, numero_os, tecnico_id")
    .in("id", despesaIds);

  if (despesasError) {
    return NextResponse.json({ error: `Erro ao revalidar despesas: ${despesasError.message}` }, { status: 500 });
  }

  const elegiveis = (despesasData ?? []).filter(
    (d) => avaliarElegibilidade(d as DespesaElegivel, corteData).elegivel,
  ) as DespesaElegivel[];

  if (elegiveis.length === 0) {
    return NextResponse.json({ error: "Nenhuma das despesas selecionadas está mais elegível." }, { status: 400 });
  }

  // Cria o cabeçalho do backup primeiro para ter um id estável para o path do ZIP.
  const { data: backupRow, error: backupError } = await supabase
    .from("backup_comprovantes")
    .insert({ criado_por: auth.admin.userId, corte_data: corteData, total_itens: elegiveis.length, status: "gerado" })
    .select("id")
    .single();

  if (backupError || !backupRow) {
    return NextResponse.json({ error: `Erro ao registrar backup: ${backupError?.message}` }, { status: 500 });
  }

  const backupId = backupRow.id as string;
  const usedNames = new Set<string>();
  const itensParaInserir: Array<{
    backup_id: string;
    despesa_id: string;
    comprovante_url_original: string;
    comprovante_nome_original: string | null;
    storage_path_original: string;
  }> = [];

  // Monta o ZIP em memória via stream do archiver, baixando cada comprovante do bucket de origem.
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err: Error) => reject(err));
  });

  let totalBytes = 0;
  const falhas: string[] = [];

  for (const despesa of elegiveis) {
    const path = extractStoragePathFromSignedUrl(despesa.comprovante_url!, BUCKET_COMPROVANTES);
    if (!path) {
      falhas.push(`Despesa ${despesa.numero_os}: não foi possível identificar o arquivo do comprovante.`);
      continue;
    }

    const { data: fileData, error: downloadError } = await supabase.storage.from(BUCKET_COMPROVANTES).download(path);
    if (downloadError || !fileData) {
      falhas.push(`Despesa ${despesa.numero_os}: falha ao baixar comprovante (${downloadError?.message ?? "arquivo não encontrado"}).`);
      continue;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    totalBytes += buffer.byteLength;

    const baseName = sanitizeZipEntryName(despesa.comprovante_nome || path.split("/").pop() || `${despesa.id}.bin`);
    let entryName = `${despesa.data_despesa}_${despesa.numero_os}_${baseName}`;
    let suffix = 1;
    while (usedNames.has(entryName)) {
      entryName = `${despesa.data_despesa}_${despesa.numero_os}_${suffix}_${baseName}`;
      suffix += 1;
    }
    usedNames.add(entryName);

    archive.append(buffer, { name: entryName });

    itensParaInserir.push({
      backup_id: backupId,
      despesa_id: despesa.id,
      comprovante_url_original: despesa.comprovante_url!,
      comprovante_nome_original: despesa.comprovante_nome,
      storage_path_original: path,
    });
  }

  if (itensParaInserir.length === 0) {
    await supabase.from("backup_comprovantes").delete().eq("id", backupId);
    return NextResponse.json(
      { error: "Nenhum comprovante pôde ser baixado para compor o backup.", falhas },
      { status: 500 },
    );
  }

  archive.finalize();
  await archiveFinished;
  const zipBuffer = Buffer.concat(chunks);

  const zipPath = `${backupId}.zip`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_BACKUPS)
    .upload(zipPath, zipBuffer, { contentType: "application/zip", upsert: true });

  if (uploadError) {
    await supabase.from("backup_comprovantes").delete().eq("id", backupId);
    return NextResponse.json({ error: `Erro ao salvar o arquivo ZIP: ${uploadError.message}` }, { status: 500 });
  }

  const { error: itensError } = await supabase.from("backup_comprovantes_itens").insert(itensParaInserir);
  if (itensError) {
    return NextResponse.json({ error: `Erro ao registrar itens do backup: ${itensError.message}` }, { status: 500 });
  }

  await supabase
    .from("backup_comprovantes")
    .update({ total_itens: itensParaInserir.length, total_bytes_estimado: totalBytes, zip_storage_path: zipPath })
    .eq("id", backupId);

  const { data: signedZip } = await supabase.storage.from(BUCKET_BACKUPS).createSignedUrl(zipPath, 60 * 15);

  await supabase.from("auditoria").insert({
    acao: "CREATE",
    entidade: "backup_comprovantes",
    entidade_id: backupId,
    user_id: auth.admin.userId,
    detalhes: `Backup gerado com ${itensParaInserir.length} comprovante(s) até ${corteData}.`,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    backupId,
    totalItens: itensParaInserir.length,
    totalBytes,
    falhas,
    downloadUrl: signedZip?.signedUrl ?? null,
  });
}

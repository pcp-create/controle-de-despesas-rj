import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { requireAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import {
  avaliarElegibilidade,
  extractStoragePathFromSignedUrl,
  sanitizeZipEntryName,
  mapWithConcurrency,
  BUCKET_COMPROVANTES,
  BUCKET_BACKUPS,
  type DespesaElegivel,
} from "@/lib/backup-comprovantes";

// Backups grandes baixam e compactam centenas de arquivos do Storage — o
// limite padrão da função (poucos segundos) não é suficiente. 300s é o
// máximo aceito pela Vercel; em planos com limite menor a plataforma
// simplesmente aplica o próprio teto, sem quebrar o build.
export const maxDuration = 300;
export const runtime = "nodejs";

const CONCORRENCIA_DOWNLOAD = 8;

interface GerarBackupBody {
  corteData: string;
  despesaIds: string[];
}

interface ItemProcessado {
  ok: boolean;
  despesa: DespesaElegivel;
  path?: string;
  buffer?: Buffer;
  entryName?: string;
  falha?: string;
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
  let backupId: string | null = null;

  try {
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
      return NextResponse.json({ error: `Erro ao registrar backup: ${backupError?.message ?? "erro desconhecido"}` }, { status: 500 });
    }

    backupId = backupRow.id as string;

    // Baixa os comprovantes em paralelo (com limite de concorrência) em vez de
    // um por vez — essencial para backups com centenas de itens caberem no
    // tempo de execução da função.
    const processados = await mapWithConcurrency(elegiveis, CONCORRENCIA_DOWNLOAD, async (despesa): Promise<ItemProcessado> => {
      const path = extractStoragePathFromSignedUrl(despesa.comprovante_url!, BUCKET_COMPROVANTES);
      if (!path) {
        return { ok: false, despesa, falha: `Despesa ${despesa.numero_os}: não foi possível identificar o arquivo do comprovante.` };
      }

      const { data: fileData, error: downloadError } = await supabase.storage.from(BUCKET_COMPROVANTES).download(path);
      if (downloadError || !fileData) {
        return {
          ok: false,
          despesa,
          falha: `Despesa ${despesa.numero_os}: falha ao baixar comprovante (${downloadError?.message ?? "arquivo não encontrado"}).`,
        };
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      return { ok: true, despesa, path, buffer };
    });

    const falhas = processados.filter((p) => !p.ok).map((p) => p.falha!).filter(Boolean);
    const sucesso = processados.filter((p) => p.ok && p.buffer && p.path);

    if (sucesso.length === 0) {
      await supabase.from("backup_comprovantes").delete().eq("id", backupId);
      return NextResponse.json(
        { error: "Nenhum comprovante pôde ser baixado para compor o backup.", falhas },
        { status: 500 },
      );
    }

    // Monta o ZIP em memória via stream do archiver — os nomes de entrada
    // precisam de sufixo em caso de colisão, então isso continua sequencial
    // (é uma operação em memória, não uma chamada de rede, então é rápido).
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

    const archiveFinished = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", (err: Error) => reject(err));
    });

    const usedNames = new Set<string>();
    let totalBytes = 0;
    const itensParaInserir: Array<{
      backup_id: string;
      despesa_id: string;
      comprovante_url_original: string;
      comprovante_nome_original: string | null;
      storage_path_original: string;
    }> = [];

    for (const item of sucesso) {
      const { despesa, path, buffer } = item as { despesa: DespesaElegivel; path: string; buffer: Buffer };
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
      await supabase.storage.from(BUCKET_BACKUPS).remove([zipPath]);
      await supabase.from("backup_comprovantes").delete().eq("id", backupId);
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
  } catch (err) {
    // Qualquer exceção inesperada (ex: erro de rede a meio de um download)
    // não deve deixar um registro de backup órfão, sem itens e sem ZIP.
    if (backupId) {
      await supabase.from("backup_comprovantes").delete().eq("id", backupId);
    }
    const message = err instanceof Error ? err.message : "Erro inesperado ao gerar o backup.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

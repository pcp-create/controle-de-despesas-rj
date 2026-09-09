import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { requireAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import {
  avaliarElegibilidade,
  extractStoragePathFromSignedUrl,
  sanitizeZipEntryName,
  getPrimeiroNome,
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

// O bucket de backups usa o limite global de tamanho de objeto do projeto no
// Storage (não configurável por aqui). 40MB fica com margem segura abaixo do
// menor limite padrão praticado pelo Supabase, então backups grandes são
// particionados em vários arquivos ZIP em vez de um único arquivo enorme.
const LIMITE_BYTES_POR_PARTE = 40 * 1024 * 1024;

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
      .select(
        "id, data_despesa, status_erp, status_aprovacao, comprovante_url, comprovante_nome, comprovante_arquivado_em, valor, cliente, numero_os, tecnico_id, lancado_sistema, tecnico:tecnico_id(nome)",
      )
      .in("id", despesaIds);

    if (despesasError) {
      return NextResponse.json({ error: `Erro ao revalidar despesas: ${despesasError.message}` }, { status: 500 });
    }

    const elegiveis = (despesasData ?? [])
      .map((d) => {
        const tecnico = (d as unknown as { tecnico: { nome: string } | { nome: string }[] | null }).tecnico;
        const tecnico_nome = Array.isArray(tecnico) ? tecnico[0]?.nome ?? null : tecnico?.nome ?? null;
        return { ...d, tecnico_nome } as DespesaElegivel;
      })
      .filter((d) => avaliarElegibilidade(d, corteData).elegivel);

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

    // Monta os nomes de entrada (com sufixo em caso de colisão) e particiona
    // os itens em grupos que ficam abaixo do limite de tamanho por ZIP —
    // um único arquivo enorme facilmente excede o limite de objeto do
    // Storage quando há centenas de comprovantes.
    const usedNames = new Set<string>();
    let totalBytes = 0;
    const itensParaInserir: Array<{
      backup_id: string;
      despesa_id: string;
      comprovante_url_original: string;
      comprovante_nome_original: string | null;
      storage_path_original: string;
    }> = [];

    type ItemComNome = { despesa: DespesaElegivel; path: string; buffer: Buffer; entryName: string };
    const itensComNome: ItemComNome[] = [];

    for (const item of sucesso) {
      const { despesa, path, buffer } = item as { despesa: DespesaElegivel; path: string; buffer: Buffer };
      totalBytes += buffer.byteLength;

      const baseName = sanitizeZipEntryName(despesa.comprovante_nome || path.split("/").pop() || `${despesa.id}.bin`);
      const primeiroNome = getPrimeiroNome(despesa.tecnico_nome);
      let entryName = `${despesa.data_despesa}_${primeiroNome}_${despesa.numero_os}_${baseName}`;
      let suffix = 1;
      while (usedNames.has(entryName)) {
        entryName = `${despesa.data_despesa}_${primeiroNome}_${despesa.numero_os}_${suffix}_${baseName}`;
        suffix += 1;
      }
      usedNames.add(entryName);
      itensComNome.push({ despesa, path, buffer, entryName });

      itensParaInserir.push({
        backup_id: backupId,
        despesa_id: despesa.id,
        comprovante_url_original: despesa.comprovante_url!,
        comprovante_nome_original: despesa.comprovante_nome,
        storage_path_original: path,
      });
    }

    const partes: ItemComNome[][] = [];
    let parteAtual: ItemComNome[] = [];
    let bytesParteAtual = 0;
    for (const item of itensComNome) {
      if (parteAtual.length > 0 && bytesParteAtual + item.buffer.byteLength > LIMITE_BYTES_POR_PARTE) {
        partes.push(parteAtual);
        parteAtual = [];
        bytesParteAtual = 0;
      }
      parteAtual.push(item);
      bytesParteAtual += item.buffer.byteLength;
    }
    if (parteAtual.length > 0) partes.push(parteAtual);

    const zipPaths: string[] = [];
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      const archiveFinished = new Promise<void>((resolve, reject) => {
        archive.on("end", () => resolve());
        archive.on("error", (err: Error) => reject(err));
      });

      for (const item of parte) {
        archive.append(item.buffer, { name: item.entryName });
      }
      archive.finalize();
      await archiveFinished;
      const zipBuffer = Buffer.concat(chunks);

      const zipPath = partes.length > 1 ? `${backupId}_parte-${i + 1}-de-${partes.length}.zip` : `${backupId}.zip`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_BACKUPS)
        .upload(zipPath, zipBuffer, { contentType: "application/zip", upsert: true });

      if (uploadError) {
        if (zipPaths.length > 0) await supabase.storage.from(BUCKET_BACKUPS).remove(zipPaths);
        await supabase.from("backup_comprovantes").delete().eq("id", backupId);
        return NextResponse.json(
          { error: `Erro ao salvar a parte ${i + 1} de ${partes.length} do arquivo ZIP: ${uploadError.message}` },
          { status: 500 },
        );
      }
      zipPaths.push(zipPath);
    }

    const { error: itensError } = await supabase.from("backup_comprovantes_itens").insert(itensParaInserir);
    if (itensError) {
      await supabase.storage.from(BUCKET_BACKUPS).remove(zipPaths);
      await supabase.from("backup_comprovantes").delete().eq("id", backupId);
      return NextResponse.json({ error: `Erro ao registrar itens do backup: ${itensError.message}` }, { status: 500 });
    }

    await supabase
      .from("backup_comprovantes")
      .update({ total_itens: itensParaInserir.length, total_bytes_estimado: totalBytes, zip_storage_paths: zipPaths })
      .eq("id", backupId);

    const downloadUrls = (
      await Promise.all(zipPaths.map((p) => supabase.storage.from(BUCKET_BACKUPS).createSignedUrl(p, 60 * 15)))
    ).map((r) => r.data?.signedUrl ?? null);

    await supabase.from("auditoria").insert({
      acao: "CREATE",
      entidade: "backup_comprovantes",
      entidade_id: backupId,
      user_id: auth.admin.userId,
      detalhes: `Backup gerado com ${itensParaInserir.length} comprovante(s) até ${corteData}, em ${zipPaths.length} arquivo(s) ZIP.`,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      backupId,
      totalItens: itensParaInserir.length,
      totalBytes,
      falhas,
      downloadUrls,
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

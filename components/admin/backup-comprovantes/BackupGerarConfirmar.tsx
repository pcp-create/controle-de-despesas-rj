"use client";

import { useState } from "react";
import { Loader2, Download, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatBytes, extractApiErrorMessage } from "@/lib/backup-comprovantes";
import ConfirmarExclusaoModal from "@/components/admin/backup-comprovantes/ConfirmarExclusaoModal";

interface Props {
  corteData: string;
  despesaIds: string[];
  onConcluido: () => void;
}

interface BackupGerado {
  backupId: string;
  totalItens: number;
  totalBytes: number;
  falhas: string[];
  downloadUrl: string | null;
}

export default function BackupGerarConfirmar({ corteData, despesaIds, onConcluido }: Props) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupGerado | null>(null);
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);

  async function gerarBackup() {
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/backup-comprovantes/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corteData, despesaIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(json, "Erro ao gerar backup."));
      setBackup(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGerando(false);
    }
  }

  if (backup) {
    return (
      <div className="border-t border-border p-4 flex flex-col gap-3 bg-emerald-50/50">
        <div className="flex items-start gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              Backup gerado com {backup.totalItens} comprovante(s) — {formatBytes(backup.totalBytes)}.
            </p>
            <p className="text-emerald-700/80 mt-0.5">
              Baixe e verifique o arquivo ZIP antes de confirmar a exclusão definitiva dos comprovantes originais.
            </p>
          </div>
        </div>

        {backup.falhas.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{backup.falhas.length} item(ns) não incluído(s) no ZIP:</p>
              <ul className="list-disc list-inside mt-1">
                {backup.falhas.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {backup.downloadUrl && (
            <a
              href={backup.downloadUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-white text-sm font-medium hover:bg-muted/40 transition"
            >
              <Download className="size-4" />
              Baixar ZIP do backup
            </a>
          )}
          <button
            onClick={() => setModalExclusaoAberto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <ShieldAlert className="size-4" />
            Confirmar exclusão dos originais
          </button>
        </div>

        {modalExclusaoAberto && (
          <ConfirmarExclusaoModal
            backupId={backup.backupId}
            totalItens={backup.totalItens}
            onClose={() => setModalExclusaoAberto(false)}
            onConfirmado={() => {
              setModalExclusaoAberto(false);
              onConcluido();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border p-4 flex flex-col gap-2">
      {erro && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {erro}
        </div>
      )}
      <button
        onClick={gerarBackup}
        disabled={gerando}
        className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
      >
        {gerando ? <Loader2 className="size-4 animate-spin" /> : null}
        {gerando ? "Gerando backup..." : `Gerar backup ZIP dos ${despesaIds.length} comprovante(s) selecionado(s)`}
      </button>
    </div>
  );
}

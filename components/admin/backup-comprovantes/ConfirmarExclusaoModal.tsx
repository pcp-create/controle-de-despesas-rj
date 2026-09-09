"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, AlertTriangle, X } from "lucide-react";
import { extractApiErrorMessage } from "@/lib/backup-comprovantes";

interface Props {
  backupId: string;
  totalItens: number;
  onClose: () => void;
  onConfirmado: () => void;
}

export default function ConfirmarExclusaoModal({ backupId, totalItens, onClose, onConfirmado }: Props) {
  const [senha, setSenha] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const textoEsperado = "EXCLUIR";
  const podeConfirmar = senha.length > 0 && confirmText.trim().toUpperCase() === textoEsperado;

  async function confirmarExclusao() {
    if (!podeConfirmar) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backup-comprovantes/${backupId}/confirmar-exclusao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(json, "Erro ao confirmar exclusão."));
      onConfirmado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl border border-border shadow-lg max-w-md w-full p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-5 shrink-0" />
            <h2 className="text-base font-bold">Confirmar exclusão definitiva</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Esta ação removerá permanentemente <span className="font-semibold text-foreground">{totalItens} arquivo(s)</span>{" "}
          de comprovante do armazenamento. As despesas e seu histórico financeiro não serão apagados — apenas o
          arquivo original. Esta ação não pode ser desfeita.
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-text" className="text-sm font-medium text-foreground">
            Digite <span className="font-mono font-bold">EXCLUIR</span> para confirmar
          </label>
          <input
            id="confirm-text"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-senha" className="text-sm font-medium text-foreground">
            Confirme sua senha
          </label>
          <input
            id="confirm-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="current-password"
          />
        </div>

        {erro && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/40 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmarExclusao}
            disabled={!podeConfirmar || enviando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
            Excluir definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}

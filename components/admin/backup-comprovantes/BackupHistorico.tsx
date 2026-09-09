"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/helpers";
import { formatBytes, extractApiErrorMessage } from "@/lib/backup-comprovantes";
import ConfirmarExclusaoModal from "@/components/admin/backup-comprovantes/ConfirmarExclusaoModal";

interface BackupHistoricoItem {
  id: string;
  criadoEm: string;
  corteData: string;
  totalItens: number;
  totalBytesEstimado: number;
  status: "gerado" | "excluido" | "expirado";
  excluidoEm: string | null;
  criadorNome: string;
  excluidorNome: string | null;
  downloadUrls: (string | null)[];
}

const fetchHistorico = async (): Promise<BackupHistoricoItem[]> => {
  const res = await fetch("/api/backup-comprovantes");
  const json = await res.json();
  if (!res.ok) throw new Error(extractApiErrorMessage(json, "Erro ao buscar histórico."));
  return json.itens;
};

const STATUS_BADGE: Record<string, string> = {
  gerado: "bg-amber-100 text-amber-700",
  excluido: "bg-emerald-100 text-emerald-700",
  expirado: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  gerado: "Aguardando exclusão",
  excluido: "Originais excluídos",
  expirado: "Expirado",
};

export default function BackupHistorico() {
  const { data, isLoading, mutate } = useSWR("backup-comprovantes-historico", fetchHistorico);
  const [modalBackupId, setModalBackupId] = useState<string | null>(null);

  const itens = data ?? [];
  const modalItem = itens.find((i) => i.id === modalBackupId) ?? null;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["Gerado em", "Corte", "Itens", "Tamanho", "Status", "Responsável", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin inline mr-2" />
                  Carregando histórico...
                </td>
              </tr>
            )}
            {!isLoading && itens.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum backup gerado ainda.
                </td>
              </tr>
            )}
            {itens.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(item.criadoEm)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-foreground">até {formatDate(item.corteData)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-foreground">{item.totalItens}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{formatBytes(item.totalBytesEstimado)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status]}`}>
                    {item.status === "excluido" && <CheckCircle2 className="size-3" />}
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {item.criadorNome}
                  {item.excluidorNome && <span className="block text-muted-foreground/70">excluído por {item.excluidorNome}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2 justify-end">
                    {item.downloadUrls.map((url, i) =>
                      url ? (
                        <a
                          key={url}
                          href={url}
                          title={item.downloadUrls.length > 1 ? `Baixar parte ${i + 1} de ${item.downloadUrls.length}` : "Baixar ZIP"}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 transition"
                        >
                          <Download className="size-3.5" />
                          {item.downloadUrls.length > 1 && <span>{i + 1}</span>}
                        </a>
                      ) : null,
                    )}
                    {item.status === "gerado" && (
                      <button
                        onClick={() => setModalBackupId(item.id)}
                        title="Confirmar exclusão dos originais"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90 transition"
                      >
                        <ShieldAlert className="size-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalItem && (
        <ConfirmarExclusaoModal
          backupId={modalItem.id}
          totalItens={modalItem.totalItens}
          onClose={() => setModalBackupId(null)}
          onConfirmado={() => {
            setModalBackupId(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

"use client";

import useSWR from "swr";
import { useProfiles } from "@/lib/supabase/hooks";
import { formatDateTime } from "@/lib/helpers";

interface AuditoriaRow {
  id: string;
  user_id: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  detalhes: string | null;
  created_at: string;
}

const fetchAuditoria = async (): Promise<AuditoriaRow[]> => {
  const res = await fetch("/api/auditoria");
  if (!res.ok) throw new Error("Erro ao buscar auditoria");
  const json = await res.json();
  return json.data ?? [];
};

const ACAO_BADGE: Record<string, string> = {
  LOGIN:            "bg-green-100 text-green-700",
  LOGOUT:           "bg-slate-100 text-slate-600",
  CREATE:           "bg-blue-100 text-blue-700",
  UPDATE:           "bg-yellow-100 text-yellow-700",
  DELETE:           "bg-red-100 text-red-700",
  APPROVE:          "bg-emerald-100 text-emerald-700",
  REJECT:           "bg-orange-100 text-orange-700",
  SEND_FOR_APPROVAL:"bg-purple-100 text-purple-700",
};

export default function AuditoriaPageSupabase() {
  const { data: auditoria, isLoading } = useSWR("auditoria-live", fetchAuditoria, {
    refreshInterval: 30000, // revalida a cada 30 segundos
    revalidateOnFocus: true,
  });
  const { profiles } = useProfiles();

  const safeProfiles = profiles ?? [];
  const rows = auditoria ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {rows.length} registro(s) de auditoria
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Data / Hora", "Usuário", "Ação", "Entidade", "Detalhes"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    Carregando registros...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum registro de auditoria.
                  </td>
                </tr>
              )}
              {rows.map((entry) => {
                const user = safeProfiles.find((u) => u.id === entry.user_id);
                const badgeClass = ACAO_BADGE[entry.acao] ?? "bg-primary/10 text-primary";
                return (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {entry.created_at ? formatDateTime(entry.created_at) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-foreground text-xs">
                        {user?.nome ?? entry.user_id ?? "—"}
                      </p>
                      {user?.perfil && (
                        <p className="text-xs text-muted-foreground capitalize">{user.perfil}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                        {entry.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.entidade ?? "—"}
                      {entry.entidade_id && (
                        <span className="ml-1 text-foreground font-mono">
                          #{entry.entidade_id.slice(-6)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={entry.detalhes ?? ""}>
                      {entry.detalhes ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useAppStore } from "@/lib/store";
import { formatDateTime } from "@/lib/helpers";

export default function AuditoriaPageSupabase() {
  const { auditoria, profiles } = useAppStore();

  const sorted = [...auditoria].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {sorted.length} registro(s) de auditoria
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Data / Hora","Usuário","Ação","Entidade","Detalhes"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum registro de auditoria.
                  </td>
                </tr>
              )}
              {sorted.map((entry) => {
                const user = profiles.find((u) => u.id === entry.user_id);
                return (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-foreground text-xs">{user?.nome ?? entry.user_id}</p>
                      <p className="text-xs text-muted-foreground">{user?.perfil}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {entry.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.entidade ?? "-"}
                      {entry.entidade_id && <span className="ml-1 text-foreground">#{entry.entidade_id.slice(-6)}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {entry.detalhes ?? "-"}
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

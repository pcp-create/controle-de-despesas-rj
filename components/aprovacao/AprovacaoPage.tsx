"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { CheckCircle, XCircle, Eye, Search } from "lucide-react";
import { formatCurrency, formatDate, erpStatusColor, erpStatusLabel } from "@/lib/helpers";
import DespesaDetailModal from "@/components/despesas/DespesaDetailModal";
import type { Despesa } from "@/lib/types";

export default function AprovacaoPage() {
  const { currentUser, despesas, users, tiposDespesa, cartoes, updateDespesaStatus, addAuditoria } = useAppStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Despesa | null>(null);
  const [reprovarModal, setReprovarModal] = useState<Despesa | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [justErr, setJustErr] = useState("");

  // Gestor sees despesas of his team
  const teamDespesas = despesas.filter((d) => {
    const tecnico = users.find((u) => u.id === d.tecnicoId);
    return tecnico?.gestorId === currentUser?.id;
  });

  const pendentes = teamDespesas.filter((d) => d.statusAprovacao === "AguardandoGestor");
  const historico = teamDespesas.filter((d) => d.statusAprovacao !== "AguardandoGestor");

  const filter = (list: Despesa[]) => {
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
      const tecnico = users.find((u) => u.id === d.tecnicoId);
      return (
        d.cliente.toLowerCase().includes(q) ||
        d.numeroOS.toLowerCase().includes(q) ||
        tipo?.nome.toLowerCase().includes(q) ||
        tecnico?.nome.toLowerCase().includes(q)
      );
    });
  };

  const handleAprovar = (d: Despesa) => {
    const now = new Date().toISOString();
    updateDespesaStatus(d.id, "AprovadoGestor", "AprovadoGestorERPAtualizado", {
      gestorAprovadorId: currentUser!.id,
      dataAprovacao: now,
    });
    addAuditoria({
      usuarioId: currentUser!.id,
      acao: "Despesa aprovada",
      entidade: "Despesa",
      entidadeId: d.id,
      detalhes: `Gestor ${currentUser!.nome} aprovou despesa ${d.numeroOS}.`,
      data: now,
    });
  };

  const handleReprovar = () => {
    if (!reprovarModal) return;
    if (!justificativa.trim()) { setJustErr("Informe a justificativa da reprovação."); return; }
    const now = new Date().toISOString();
    updateDespesaStatus(reprovarModal.id, "Reprovado", "ReprovadoERPAtualizado", {
      gestorAprovadorId: currentUser!.id,
      dataAprovacao: now,
      justificativaReprovacao: justificativa,
    });
    addAuditoria({
      usuarioId: currentUser!.id,
      acao: "Despesa reprovada",
      entidade: "Despesa",
      entidadeId: reprovarModal.id,
      detalhes: `Gestor reprovou despesa ${reprovarModal.numeroOS}. Motivo: ${justificativa}`,
      data: now,
    });
    setReprovarModal(null);
    setJustificativa("");
    setJustErr("");
  };

  const DespesaCard = ({ d }: { d: Despesa }) => {
    const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
    const tecnico = users.find((u) => u.id === d.tecnicoId);
    const cartao = cartoes.find((c) => c.id === d.cartaoId);
    const acimaLimite = tipo?.limiteMaximo !== undefined && d.valor > tipo.limiteMaximo;

    return (
      <div className="bg-white rounded-xl border border-border shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-foreground">{tipo?.nome ?? "-"}</p>
            <p className="text-sm text-muted-foreground">{tecnico?.nome} · {formatDate(d.dataDespesa)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-lg font-bold text-foreground">{formatCurrency(d.valor)}</span>
            {acimaLimite && tipo?.limiteMaximo && (
              <span className="text-[10px] text-destructive font-medium">
                Acima do limite ({formatCurrency(tipo.limiteMaximo)})
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{d.cliente}</span></div>
          <div><span className="text-muted-foreground">OS: </span><span className="font-medium">{d.numeroOS}</span></div>
          {cartao && <div className="col-span-2"><span className="text-muted-foreground">Cartão: </span><span className="font-medium">{cartao.nome} **** {cartao.ultimos4}</span></div>}
          {d.observacao && <div className="col-span-2"><span className="text-muted-foreground">Obs: </span><span>{d.observacao}</span></div>}
          {d.comprovanteNome && <div className="col-span-2 text-accent">Comprovante: {d.comprovanteNome}</div>}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${erpStatusColor[d.statusERP]}`}>
            {erpStatusLabel[d.statusERP]}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSelected(d)} className="p-1.5 rounded-lg border border-input hover:bg-muted transition text-muted-foreground" title="Ver detalhes">
              <Eye className="w-4 h-4" />
            </button>
            <button onClick={() => handleAprovar(d)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/15 text-success text-xs font-semibold hover:bg-success/25 transition">
              <CheckCircle className="w-3.5 h-3.5" />
              Aprovar
            </button>
            <button onClick={() => { setReprovarModal(d); setJustificativa(""); setJustErr(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition">
              <XCircle className="w-3.5 h-3.5" />
              Reprovar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Aprovação de Despesas</h1>
          <p className="text-sm text-muted-foreground">{pendentes.length} despesa(s) aguardando aprovação</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar por técnico, cliente, OS ou tipo..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Pendentes */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Aguardando Aprovação</h2>
        {filter(pendentes).length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
            Nenhuma despesa pendente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filter(pendentes).map((d) => <DespesaCard key={d.id} d={d} />)}
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Histórico</h2>
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Técnico</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">OS</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filter(historico).map((d) => {
                    const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
                    const tecnico = users.find((u) => u.id === d.tecnicoId);
                    return (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                        <td className="px-4 py-3">{tecnico?.nome}</td>
                        <td className="px-4 py-3">{tipo?.nome}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.numeroOS}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(d.valor)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${erpStatusColor[d.statusERP]}`}>
                            {erpStatusLabel[d.statusERP]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Detalhe modal */}
      {selected && <DespesaDetailModal despesa={selected} onClose={() => setSelected(null)} />}

      {/* Reprovar modal */}
      {reprovarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <h2 className="font-semibold text-foreground">Reprovar Despesa</h2>
            <p className="text-sm text-muted-foreground">
              Informe a justificativa para reprovar a despesa de{" "}
              <strong>{users.find((u) => u.id === reprovarModal.tecnicoId)?.nome}</strong> ({reprovarModal.numeroOS}).
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Justificativa <span className="text-destructive">*</span></label>
              <textarea rows={3} value={justificativa} onChange={(e) => { setJustificativa(e.target.value); setJustErr(""); }}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Descreva o motivo da reprovação..." />
              {justErr && <p className="text-xs text-destructive">{justErr}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReprovarModal(null)}
                className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
                Cancelar
              </button>
              <button onClick={handleReprovar}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 transition">
                Confirmar Reprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

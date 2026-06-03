"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Plus, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import { formatCurrency } from "@/lib/helpers";
import type { TipoDespesa } from "@/lib/types";

export default function TiposDespesaPage() {
  const { tiposDespesa, addTipoDespesa, updateTipoDespesa } = useAppStore();
  const [modalTipo, setModalTipo] = useState<TipoDespesa | "new" | null>(null);

  const emptyTipo: Omit<TipoDespesa, "id"> = {
    nome: "", ativo: true, limiteMaximo: undefined,
    exigeAprovacaoAcimaLimite: false, exigeComprovante: false,
    contaContabilDespesaId: "", historicoDespesaId: "", centroCustoId: "",
    tipoDocumentoPadrao: "", observacaoPadrao: "",
  };

  const [form, setForm] = useState<Omit<TipoDespesa, "id">>(emptyTipo);

  const openNew = () => { setForm(emptyTipo); setModalTipo("new"); };
  const openEdit = (t: TipoDespesa) => { const { id, ...rest } = t; setForm(rest); setModalTipo(t); };

  const handleSave = () => {
    if (!form.nome.trim()) return;
    if (modalTipo === "new") addTipoDespesa(form);
    else if (modalTipo) updateTipoDespesa((modalTipo as TipoDespesa).id, form);
    setModalTipo(null);
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "text-xs font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Tipos de Despesa</h1>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition">
          <Plus className="w-4 h-4" />
          Novo Tipo
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiposDespesa.map((t) => (
          <div key={t.id} className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${t.ativo ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{t.nome}</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => updateTipoDespesa(t.id, { ativo: !t.ativo })}
                  className={`p-1 rounded transition ${t.ativo ? "text-success" : "text-muted-foreground"}`} title={t.ativo ? "Inativar" : "Ativar"}>
                  {t.ativo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Limite máximo:</span>
                <span className="font-medium text-foreground">
                  {t.limiteMaximo !== undefined ? formatCurrency(t.limiteMaximo) : "Sem limite"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {t.exigeComprovante && (
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">Exige comprovante</span>
                )}
                {t.exigeAprovacaoAcimaLimite && (
                  <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning">Aprova. acima do limite</span>
                )}
              </div>
              {t.tipoDocumentoPadrao && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Documento padrão:</span>
                  <span className="text-foreground">{t.tipoDocumentoPadrao}</span>
                </div>
              )}
              {t.observacaoPadrao && (
                <p className="text-muted-foreground italic mt-1 leading-relaxed">{t.observacaoPadrao}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modalTipo !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              <h2 className="font-semibold text-foreground">
                {modalTipo === "new" ? "Novo Tipo de Despesa" : `Editar: ${(modalTipo as TipoDespesa).nome}`}
              </h2>
              <button onClick={() => setModalTipo(null)} className="text-muted-foreground hover:text-foreground transition text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Nome <span className="text-destructive">*</span></label>
                <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputClass} />
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>Limite Máximo (R$) — deixe vazio para sem limite</label>
                <input type="number" step="0.01" min="0"
                  value={form.limiteMaximo !== undefined ? form.limiteMaximo : ""}
                  onChange={(e) => setForm({ ...form, limiteMaximo: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                  className={inputClass} placeholder="Sem limite" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  ["contaContabilDespesaId","Conta Contábil Despesa ID"],
                  ["historicoDespesaId","Histórico Despesa ID"],
                  ["centroCustoId","Centro de Custo ID"],
                  ["tipoDocumentoPadrao","Tipo Documento Padrão"],
                ] as [keyof typeof form, string][]).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className={labelClass}>{label}</label>
                    <input type="text" value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>Observação Padrão</label>
                <textarea value={form.observacaoPadrao ?? ""} rows={2} onChange={(e) => setForm({ ...form, observacaoPadrao: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>

              <div className="flex flex-col gap-2">
                {([
                  ["exigeComprovante","Exige comprovante"],
                  ["exigeAprovacaoAcimaLimite","Exige aprovação acima do limite"],
                  ["ativo","Tipo ativo"],
                ] as [keyof typeof form, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={(form[key] as boolean) ?? false} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="w-4 h-4 rounded accent-primary" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-5 border-t border-border flex gap-3 flex-shrink-0">
              <button onClick={() => setModalTipo(null)} className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">Cancelar</button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

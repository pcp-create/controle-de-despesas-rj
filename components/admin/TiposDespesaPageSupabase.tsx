"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/helpers";
import {
  Search,
  PlusCircle,
  Edit2,
  Power,
  FileText,
  DollarSign,
  Check,
  X,
  Loader2,
} from "lucide-react";

export default function TiposDespesaPageSupabase() {
  const { tiposDespesa, loadSupabaseData } = useAppStore();

  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    limite_maximo: "",
    exige_comprovante: true,
    documento_padrao: "",
  });

  const tiposFiltrados = tiposDespesa
    .filter((t) => {
      if (search) {
        const term = search.toLowerCase();
        return t.nome.toLowerCase().includes(term) || (t.descricao || "").toLowerCase().includes(term);
      }
      return true;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const handleToggleStatus = async (id: string, ativo: boolean) => {
    try {
      setLoading(true);
      const supabase = createClient();

      const { error } = await supabase
        .from("tipos_despesa")
        .update({ ativo: !ativo })
        .eq("id", id);

      if (error) {
        setFeedback({ type: "error", msg: error.message });
      } else {
        setFeedback({ type: "success", msg: ativo ? "Tipo desativado" : "Tipo ativado" });
        await loadSupabaseData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Erro ao atualizar" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      setFeedback({ type: "error", msg: "Nome é obrigatório" });
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      const data = {
        nome: form.nome,
        descricao: form.descricao || null,
        limite_maximo: form.limite_maximo ? Number(form.limite_maximo) : null,
        exige_comprovante: form.exige_comprovante,
        documento_padrao: form.documento_padrao || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("tipos_despesa")
          .update(data)
          .eq("id", editingId);

        if (error) {
          setFeedback({ type: "error", msg: error.message });
        } else {
          setFeedback({ type: "success", msg: "Tipo atualizado com sucesso!" });
          setEditingId(null);
          await loadSupabaseData();
        }
      } else {
        const { error } = await supabase.from("tipos_despesa").insert([data]);

        if (error) {
          setFeedback({ type: "error", msg: error.message });
        } else {
          setFeedback({ type: "success", msg: "Tipo criado com sucesso!" });
          setShowNew(false);
          await loadSupabaseData();
        }
      }

      setForm({ nome: "", descricao: "", limite_maximo: "", exige_comprovante: true, documento_padrao: "" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (tipo: (typeof tiposDespesa)[0]) => {
    setForm({
      nome: tipo.nome,
      descricao: tipo.descricao || "",
      limite_maximo: tipo.limiteMaximo?.toString() || "",
      exige_comprovante: tipo.exigeComprovante,
      documento_padrao: tipo.documentoPadrao || "",
    });
    setEditingId(tipo.id);
    setShowNew(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowNew(false);
    setForm({ nome: "", descricao: "", limite_maximo: "", exige_comprovante: true, documento_padrao: "" });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tipos de Despesa</h1>
          <p className="text-sm text-muted-foreground">{tiposDespesa.length} tipo(s) cadastrado(s)</p>
        </div>
        <button
          onClick={() => {
            setShowNew(true);
            setEditingId(null);
          }}
          disabled={loading}
          className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:bg-accent/50 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Novo Tipo
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "bg-success/10 border border-success/20 text-success"
              : "bg-destructive/10 border border-destructive/20 text-destructive"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Formulário */}
      {(showNew || editingId) && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h2 className="font-semibold text-foreground mb-4">{editingId ? "Editar Tipo" : "Novo Tipo"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
                placeholder="Ex: Combustível"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Limite Máximo (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.limite_maximo}
                onChange={(e) => setForm({ ...form, limite_maximo: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
                placeholder="Opcional"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Documento Padrão</label>
              <input
                type="text"
                value={form.documento_padrao}
                onChange={(e) => setForm({ ...form, documento_padrao: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
                placeholder="Ex: Cupom Fiscal"
                disabled={loading}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="exige_comprovante"
                checked={form.exige_comprovante}
                onChange={(e) => setForm({ ...form, exige_comprovante: e.target.checked })}
                className="w-4 h-4 rounded"
                disabled={loading}
              />
              <label htmlFor="exige_comprovante" className="text-sm">
                Exige comprovante
              </label>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label className="text-sm font-medium">Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
                rows={2}
                placeholder="Descrição opcional"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={cancelEdit}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-input text-sm hover:bg-muted disabled:opacity-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:bg-accent/50 transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tipos..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm"
        />
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiposFiltrados.map((t) => (
          <div key={t.id} className={`bg-white rounded-xl border border-border shadow-sm p-4 ${!t.ativo ? "opacity-60" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">{t.nome}</h3>
                  {!t.ativo && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inativo</span>}
                </div>
                {t.descricao && <p className="text-sm text-muted-foreground mt-1">{t.descricao}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {t.limiteMaximo && (
                    <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                      <DollarSign className="w-3 h-3" />
                      Limite: {formatCurrency(t.limiteMaximo)}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      t.exigeComprovante ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.exigeComprovante ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    Comprovante
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button
                onClick={() => startEdit(t)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-input text-sm hover:bg-muted disabled:opacity-50 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={() => handleToggleStatus(t.id, t.ativo)}
                disabled={loading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm transition disabled:opacity-50 ${
                  t.ativo
                    ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
                    : "border border-success/30 text-success hover:bg-success/10"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {t.ativo ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {tiposFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhum tipo encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">Cadastre um novo tipo de despesa</p>
        </div>
      )}
    </div>
  );
}

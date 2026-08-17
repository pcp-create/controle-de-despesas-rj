"use client";

import { useState, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { useTipoDespesaCentroCusto, useAreas, type Area as AreaRecord } from "@/lib/supabase/hooks";
import { formatCurrency } from "@/lib/helpers";
import {
  Search,
  PlusCircle,
  Edit2,
  Trash2,
  FileText,
  DollarSign,
  Check,
  X,
  Loader2,
  BedDouble,
  Building2,
  Pencil,
  Save,
} from "lucide-react";

// ─── Sub-componente: painel de CC por área ────────────────────────────────────
function CentroCustoPanel({ tipoDespesaId, areas }: { tipoDespesaId: string; areas: AreaRecord[] }) {
  const { centrosCusto, isLoading, upsertCentroCusto, deleteCentroCusto } =
    useTipoDespesaCentroCusto(tipoDespesaId);

  const [editing, setEditing] = useState<Record<string, string>>({});
  const [editingDescritivo, setEditingDescritivo] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const getValor = (areaNome: string) => {
    const cc = centrosCusto.find((c) => c.area === areaNome);
    return cc?.centro_custo_erp || "";
  };

  const getDescritivo = (areaNome: string) => {
    const cc = centrosCusto.find((c) => c.area === areaNome);
    return cc?.descritivo_custo_erp || "";
  };

  const handleEdit = (areaNome: string) => {
    setEditing((prev) => ({ ...prev, [areaNome]: getValor(areaNome) }));
    setEditingDescritivo((prev) => ({ ...prev, [areaNome]: getDescritivo(areaNome) }));
  };

  const handleCancel = (areaNome: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[areaNome];
      return next;
    });
    setEditingDescritivo((prev) => {
      const next = { ...prev };
      delete next[areaNome];
      return next;
    });
  };

  const handleSave = async (areaNome: string) => {
    const valor = editing[areaNome] ?? "";
    const descritivo = editingDescritivo[areaNome] ?? "";
    setSaving((prev) => ({ ...prev, [areaNome]: true }));
    setSaveError(null);

    let result: { error: string | null } | undefined;

    if (!valor.trim()) {
      const cc = centrosCusto.find((c) => c.area === areaNome);
      if (cc) result = await deleteCentroCusto(cc.id);
    } else {
      result = await upsertCentroCusto(areaNome, valor.trim(), descritivo.trim() || null);
    }

    setSaving((prev) => { const n = { ...prev }; delete n[areaNome]; return n; });

    if (result?.error) {
      setSaveError(result.error);
    } else {
      handleCancel(areaNome);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Centro de Custo ERP (M8) por Área / Setor
        </span>
      </div>
      {saveError && (
        <div className="px-3 py-2 bg-destructive/5 border-b border-destructive/20 text-xs text-destructive">
          Erro ao salvar: {saveError}
        </div>
      )}
      <div className="divide-y divide-border">
        {areas.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Nenhuma área cadastrada. Adicione áreas em Usuários → Gerenciar áreas.
          </p>
        )}
        {areas.map((areaItem) => {
          const area = areaItem.nome;
          const valor = getValor(area);
          const descritivo = getDescritivo(area);
          const isEditing = editing[area] !== undefined;
          const isSaving = saving[area] === true;

          return (
            <div key={areaItem.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="text-sm font-medium text-foreground w-32 shrink-0 pt-1.5">{area}</span>

              {isEditing ? (
                <div className="flex items-start gap-1.5 flex-1">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <input
                      autoFocus
                      type="text"
                      value={editing[area] ?? ""}
                      onChange={(e) =>
                        setEditing((prev) => ({ ...prev, [area]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(area);
                        if (e.key === "Escape") handleCancel(area);
                      }}
                      placeholder="Centro de Custo ERP — Ex: 142"
                      className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      disabled={isSaving}
                    />
                    <input
                      type="text"
                      value={editingDescritivo[area] ?? ""}
                      onChange={(e) =>
                        setEditingDescritivo((prev) => ({ ...prev, [area]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(area);
                        if (e.key === "Escape") handleCancel(area);
                      }}
                      placeholder="Descritivo do Centro de Custo — Ex: Assistência Técnica"
                      className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      disabled={isSaving}
                    />
                  </div>
                  <button
                    onClick={() => handleSave(area)}
                    disabled={isSaving}
                    title="Salvar"
                    className="p-1 rounded hover:bg-success/10 text-success disabled:opacity-40 transition"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCancel(area)}
                    title="Cancelar"
                    className="p-1 rounded hover:bg-destructive/10 text-destructive transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 group pt-1">
                  {valor ? (
                    <span className="text-sm font-mono text-primary bg-primary/8 px-2 py-0.5 rounded">
                      {valor}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Não definido</span>
                  )}
                  {valor && (
                    <span className="text-sm text-foreground">
                      {descritivo || <span className="text-muted-foreground italic">Sem descritivo</span>}
                    </span>
                  )}
                  <button
                    onClick={() => handleEdit(area)}
                    title="Editar"
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TiposDespesaPageSupabase() {
  const { tiposDespesa, loadSupabaseData } = useAppStore();
  const { areas } = useAreas();
  const formRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null); // ID do tipo recém-salvo, para exibir painel CC

  const emptyForm = {
    nome: "",
    descricao: "",
    limite_maximo: "",
    limite_ocorrencias_diarias: "",
    calcula_diarias: false,
    exige_comprovante: true,
    documento_padrao: "",
    codigo_produto_erp: "",
    ativo: true,
  };
  const [form, setForm] = useState(emptyForm);

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
      const { error } = await supabase.from("tipos_despesa").update({ ativo: !ativo }).eq("id", id);
      if (error) {
        setFeedback({ type: "error", msg: error.message });
      } else {
        setFeedback({ type: "success", msg: ativo ? "Tipo desativado" : "Tipo ativado" });
        await loadSupabaseData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este tipo de despesa? Esta ação não pode ser desfeita.")) return;
    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.from("tipos_despesa").delete().eq("id", id);
      if (error) {
        setFeedback({ type: "error", msg: error.message });
      } else {
        setFeedback({ type: "success", msg: "Tipo de despesa excluído com sucesso!" });
        if (savedId === id) setSavedId(null);
        await loadSupabaseData();
        setTimeout(() => setFeedback(null), 3000);
      }
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
        limite_ocorrencias_diarias: form.limite_ocorrencias_diarias
          ? Number(form.limite_ocorrencias_diarias)
          : null,
        calcula_diarias: form.calcula_diarias,
        exige_comprovante: form.exige_comprovante,
        documento_padrao: form.documento_padrao || null,
        codigo_produto_erp: form.codigo_produto_erp || null,
        ativo: form.ativo,
      };

      if (editingId) {
        const { error } = await supabase.from("tipos_despesa").update(data).eq("id", editingId).select();
        if (error) {
          setFeedback({ type: "error", msg: `Erro: ${error.message}` });
        } else {
          setFeedback({ type: "success", msg: "Tipo de despesa atualizado com sucesso!" });
          setEditingId(null);
          setShowNew(false);
          setForm(emptyForm);
          setSavedId(null);
          await loadSupabaseData();
          setTimeout(() => setFeedback(null), 4000);
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("tipos_despesa")
          .insert([data])
          .select()
          .single();
        if (error) {
          setFeedback({ type: "error", msg: `Erro: ${error.message}` });
        } else {
          setFeedback({ type: "success", msg: "Tipo criado! Agora configure os Centros de Custo por área abaixo." });
          setSavedId(inserted.id);
          setShowNew(false);
          setForm(emptyForm);
          await loadSupabaseData();
          setTimeout(() => setFeedback(null), 4000);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (tipo: (typeof tiposDespesa)[0]) => {
    setForm({
      nome: tipo.nome,
      descricao: tipo.descricao || "",
      limite_maximo: tipo.limiteMaximo?.toString() || "",
      limite_ocorrencias_diarias: (tipo as any).limiteOcorrenciasDiarias?.toString() || "",
      calcula_diarias: (tipo as any).calculaDiarias === true,
      exige_comprovante: tipo.exigeComprovante,
      documento_padrao: tipo.documentoPadrao || "",
      codigo_produto_erp: tipo.codigo_produto_erp || "",
      ativo: tipo.ativo,
    });
    setEditingId(tipo.id);
    setSavedId(tipo.id); // abre painel CC imediatamente ao editar
    setShowNew(false);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowNew(false);
    setForm(emptyForm);
    setSavedId(null);
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
          onClick={() => { setShowNew(true); setEditingId(null); setSavedId(null); }}
          disabled={loading}
          className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:bg-accent/50 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Novo Tipo
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          feedback.type === "success"
            ? "bg-success/10 border border-success/20 text-success"
            : "bg-destructive/10 border border-destructive/20 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Formulário */}
      {(showNew || editingId) && (
        <div ref={formRef} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-5">
          <h2 className="font-semibold text-foreground">{editingId ? "Editar Tipo" : "Novo Tipo"}</h2>

          {/* Campos gerais */}
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
              <label className="text-sm font-medium">Limite diário de ocorrências</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.limite_ocorrencias_diarias}
                onChange={(e) => setForm({ ...form, limite_ocorrencias_diarias: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
                placeholder="Ex: 1 (ilimitado se vazio)"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Acima deste número por dia, irá para aprovação mesmo dentro do valor limite.
              </p>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Código de Produto ERP M8</label>
              <input
                type="text"
                value={form.codigo_produto_erp}
                onChange={(e) => setForm({ ...form, codigo_produto_erp: e.target.value })}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono"
                placeholder="Ex: PROD-0042"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Código do item correspondente no sistema ERP M8.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="calcula_diarias"
                checked={form.calcula_diarias}
                onChange={(e) => setForm({ ...form, calcula_diarias: e.target.checked })}
                className="w-4 h-4 rounded"
                disabled={loading}
              />
              <label htmlFor="calcula_diarias" className="text-sm">
                Calcula por diária — exige check-in e check-out ao lançar despesa
              </label>
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
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="w-4 h-4 rounded"
                disabled={loading}
              />
              <label htmlFor="ativo" className="text-sm">Ativo</label>
            </div>
          </div>

          {/* Painel de Centro de Custo por área — visível ao editar tipo existente */}
          {savedId && <CentroCustoPanel tipoDespesaId={savedId} areas={areas} />}

          {/* Aviso quando é tipo novo ainda não salvo */}
          {!savedId && showNew && (
            <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-3">
              Salve o tipo primeiro para configurar o Centro de Custo ERP por área.
            </p>
          )}

          <div className="flex gap-2">
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
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {tiposFiltrados.length > 0 ? (
          <>
            {/* Cards — mobile */}
            <ul className="sm:hidden divide-y divide-border">
              {tiposFiltrados.map((t) => (
                <li key={t.id} className={`p-4 space-y-3 ${!t.ativo ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{t.nome}</p>
                      {t.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.descricao}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${t.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {t.limiteMaximo !== null && t.limiteMaximo !== undefined ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-warning/10 text-warning">
                        <DollarSign className="w-3 h-3" />
                        Limite: {formatCurrency(t.limiteMaximo)}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Sem limite</span>
                    )}
                    {(t as any).limiteOcorrenciasDiarias != null && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {(t as any).limiteOcorrenciasDiarias}x/dia
                      </span>
                    )}
                    {(t as any).calculaDiarias && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                        <BedDouble className="w-3 h-3" />
                        Diárias
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${t.exigeComprovante ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {t.exigeComprovante ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {t.exigeComprovante ? "Exige comprovante" : "Sem comprovante"}
                    </span>
                  </div>

                  {/* CC por área inline no card mobile */}
                  {savedId === t.id && <CentroCustoPanel tipoDespesaId={t.id} areas={areas} />}

                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(t)}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-input text-sm hover:bg-muted disabled:opacity-50 transition"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 disabled:opacity-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tabela — desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Limite Máximo</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">Limite/dia</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">Comprovante</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tiposFiltrados.map((t) => (
                    <>
                      <tr
                        key={t.id}
                        className={`border-b border-border hover:bg-muted/30 transition ${!t.ativo ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-foreground text-sm">{t.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{t.descricao || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          {t.limiteMaximo !== null && t.limiteMaximo !== undefined ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">
                              <DollarSign className="w-3 h-3" />
                              {formatCurrency(t.limiteMaximo)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(t as any).limiteOcorrenciasDiarias != null ? (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {(t as any).limiteOcorrenciasDiarias}x
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${t.exigeComprovante ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {t.exigeComprovante ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex text-xs px-2 py-0.5 rounded ${t.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {t.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => startEdit(t)}
                              disabled={loading}
                              className="p-1.5 rounded-lg border border-input hover:bg-muted disabled:opacity-50 transition"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4 text-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              disabled={loading}
                              className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Linha expandida com painel CC — aparece ao clicar em Editar */}
                      {savedId === t.id && !editingId && (
                        <tr key={`${t.id}-cc`} className="bg-muted/20">
                          <td colSpan={7} className="px-4 py-3">
                            <CentroCustoPanel tipoDespesaId={t.id} areas={areas} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Nenhum tipo encontrado</h3>
            <p className="text-sm text-muted-foreground mt-1">Cadastre um novo tipo de despesa</p>
          </div>
        )}
      </div>
    </div>
  );
}

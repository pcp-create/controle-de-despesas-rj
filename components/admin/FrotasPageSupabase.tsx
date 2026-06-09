"use client";

import { useState } from "react";
import { useFrotas, type Frota } from "@/lib/supabase/hooks";
import {
  Car,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

const TIPOS_VEICULO = ["Carro", "Moto", "Caminhão", "Van", "Pickup", "Utilitário", "Outro"];

const EMPTY_FORM = {
  placa: "",
  modelo: "",
  marca: "",
  ano: new Date().getFullYear().toString(),
  cor: "",
  tipo: "Carro",
  quilometragem: "0",
  observacao: "",
  ativo: true,
};

export default function FrotasPageSupabase() {
  const { frotas, isLoading, addFrota, updateFrota, deleteFrota } = useFrotas();

  const [search, setSearch] = useState("");
  const [showAtivos, setShowAtivos] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Frota | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const frostasFiltradas = frotas.filter((f) => {
    const matchAtivo = showAtivos ? f.ativo : !f.ativo;
    const term = search.toLowerCase();
    const matchSearch =
      !term ||
      f.placa.toLowerCase().includes(term) ||
      f.modelo.toLowerCase().includes(term) ||
      f.marca.toLowerCase().includes(term) ||
      (f.tipo?.toLowerCase().includes(term) ?? false);
    return matchAtivo && matchSearch;
  });

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setFeedback(null);
    setEditing(null);
    setModal("add");
  };

  const openEdit = (frota: Frota) => {
    setForm({
      placa: frota.placa,
      modelo: frota.modelo,
      marca: frota.marca,
      ano: frota.ano?.toString() || "",
      cor: frota.cor || "",
      tipo: frota.tipo || "Carro",
      quilometragem: frota.quilometragem.toString(),
      observacao: frota.observacao || "",
      ativo: frota.ativo,
    });
    setErrors({});
    setFeedback(null);
    setEditing(frota);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setFeedback(null);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.placa.trim()) errs.placa = "Informe a placa";
    else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i.test(form.placa.replace(/[-\s]/g, "")))
      errs.placa = "Placa inválida (ex: ABC1234 ou ABC1D23)";
    if (!form.modelo.trim()) errs.modelo = "Informe o modelo";
    if (!form.marca.trim()) errs.marca = "Informe a marca";
    if (form.ano && (isNaN(Number(form.ano)) || Number(form.ano) < 1900 || Number(form.ano) > new Date().getFullYear() + 1))
      errs.ano = "Ano inválido";
    if (form.quilometragem && (isNaN(Number(form.quilometragem)) || Number(form.quilometragem) < 0))
      errs.quilometragem = "KM inválido";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});

    const payload = {
      placa: form.placa.toUpperCase().replace(/[-\s]/g, ""),
      modelo: form.modelo.trim(),
      marca: form.marca.trim(),
      ano: form.ano ? Number(form.ano) : null,
      cor: form.cor.trim() || null,
      tipo: form.tipo || null,
      quilometragem: Number(form.quilometragem) || 0,
      observacao: form.observacao.trim() || null,
      ativo: form.ativo,
    };

    let result;
    if (modal === "edit" && editing) {
      result = await updateFrota(editing.id, payload);
    } else {
      result = await addFrota(payload);
    }

    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: modal === "edit" ? "Veículo atualizado!" : "Veículo cadastrado!" });
      setTimeout(() => closeModal(), 1200);
    }
    setLoading(false);
  };

  const handleToggleAtivo = async (frota: Frota) => {
    await updateFrota(frota.id, { ativo: !frota.ativo });
  };

  const handleDelete = async (id: string) => {
    await deleteFrota(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Frotas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie os veículos da empresa</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Novo Veículo
        </button>
      </div>

      {/* Barra de busca + toggle */}
      <div className="bg-white rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por placa, modelo, marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setShowAtivos(true)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${showAtivos ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Ativos
          </button>
          <button
            onClick={() => setShowAtivos(false)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${!showAtivos ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Inativos
          </button>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : frostasFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center gap-3 text-center">
          <Car className="w-12 h-12 text-muted-foreground/30" />
          <p className="font-medium text-foreground">Nenhum veículo encontrado</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Tente outros termos de busca." : "Cadastre o primeiro veículo clicando em \"Novo Veículo\"."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {frostasFiltradas.map((frota) => (
            <div key={frota.id} className="bg-white rounded-xl border border-border p-4 flex flex-col gap-3">
              {/* Top */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground tracking-wider text-sm">{frota.placa}</p>
                    <p className="text-xs text-muted-foreground">{frota.marca} {frota.modelo}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${frota.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {frota.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              {/* Info */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {frota.tipo && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="font-medium text-foreground">{frota.tipo}</span>
                  </div>
                )}
                {frota.ano && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Ano</span>
                    <span className="font-medium text-foreground">{frota.ano}</span>
                  </div>
                )}
                {frota.cor && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Cor</span>
                    <span className="font-medium text-foreground">{frota.cor}</span>
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">KM</span>
                  <span className="font-medium text-foreground">{frota.quilometragem.toLocaleString("pt-BR")} km</span>
                </div>
              </div>

              {frota.observacao && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">{frota.observacao}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <button
                  onClick={() => openEdit(frota)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => handleToggleAtivo(frota)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                >
                  {frota.ativo
                    ? <ToggleRight className="w-3.5 h-3.5 text-success" />
                    : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                  {frota.ativo ? "Desativar" : "Ativar"}
                </button>
                {deleteConfirm === frota.id ? (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => handleDelete(frota.id)}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium bg-destructive text-white hover:bg-destructive/90 transition"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(frota.id)}
                    className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Car className="w-5 h-5 text-accent" />
                <h2 className="font-bold text-foreground">
                  {modal === "edit" ? "Editar Veículo" : "Novo Veículo"}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`mx-5 mt-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                feedback.type === "success"
                  ? "bg-success/10 border border-success/20 text-success"
                  : "bg-destructive/10 border border-destructive/20 text-destructive"
              }`}>
                {feedback.type === "success"
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />
                }
                {feedback.msg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Placa */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Placa *</label>
                  <input
                    type="text"
                    value={form.placa}
                    onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                    placeholder="ABC1234"
                    maxLength={7}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring uppercase"
                  />
                  {errors.placa && <span className="text-xs text-destructive">{errors.placa}</span>}
                </div>

                {/* Tipo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TIPOS_VEICULO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Marca */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Marca *</label>
                  <input
                    type="text"
                    value={form.marca}
                    onChange={(e) => setForm({ ...form, marca: e.target.value })}
                    placeholder="Ex: Volkswagen"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.marca && <span className="text-xs text-destructive">{errors.marca}</span>}
                </div>

                {/* Modelo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Modelo *</label>
                  <input
                    type="text"
                    value={form.modelo}
                    onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                    placeholder="Ex: Gol"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.modelo && <span className="text-xs text-destructive">{errors.modelo}</span>}
                </div>

                {/* Ano */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Ano</label>
                  <input
                    type="number"
                    value={form.ano}
                    onChange={(e) => setForm({ ...form, ano: e.target.value })}
                    placeholder="2024"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.ano && <span className="text-xs text-destructive">{errors.ano}</span>}
                </div>

                {/* Cor */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Cor</label>
                  <input
                    type="text"
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                    placeholder="Ex: Branco"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* KM */}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Quilometragem atual</label>
                  <input
                    type="number"
                    value={form.quilometragem}
                    onChange={(e) => setForm({ ...form, quilometragem: e.target.value })}
                    placeholder="0"
                    min={0}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.quilometragem && <span className="text-xs text-destructive">{errors.quilometragem}</span>}
                </div>
              </div>

              {/* Observação */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Observação</label>
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Informações adicionais sobre o veículo..."
                  rows={2}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Ativo */}
              {modal === "edit" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <span className="text-sm font-medium text-foreground">Veículo ativo</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, ativo: !form.ativo })}
                    className={`w-11 h-6 rounded-full transition-colors relative ${form.ativo ? "bg-success" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.ativo ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {modal === "edit" ? "Salvar alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

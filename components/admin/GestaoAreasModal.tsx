"use client";

import { useState } from "react";
import { useAreas } from "@/lib/supabase/hooks";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Save,
  Loader2,
  Tags,
  AlertTriangle,
} from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function GestaoAreasModal({ onClose }: Props) {
  const { areas, isLoading, addArea, updateArea, deleteArea } = useAreas();

  const [novaArea, setNovaArea] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingNova, setLoadingNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [setupSql, setSetupSql] = useState<string | null>(null);

  // Verifica se a tabela existe
  useState(() => {
    fetch("/api/setup-areas")
      .then((r) => r.json())
      .then((d) => { if (d.needsMigration) setSetupSql(d.sql); })
      .catch(() => {});
  });

  const handleAdd = async () => {
    const nome = novaArea.trim();
    if (!nome) return;
    if (areas.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) {
      setErro("Já existe uma área com esse nome.");
      return;
    }
    setLoadingNova(true);
    setErro(null);
    const res = await addArea(nome);
    if (res?.error) setErro(res.error);
    else setNovaArea("");
    setLoadingNova(false);
  };

  const handleUpdate = async (id: string) => {
    const nome = editandoNome.trim();
    if (!nome) return;
    if (areas.some((a) => a.nome.toLowerCase() === nome.toLowerCase() && a.id !== id)) {
      setErro("Já existe uma área com esse nome.");
      return;
    }
    setLoadingId(id);
    setErro(null);
    const res = await updateArea(id, nome);
    if (res?.error) setErro(res.error);
    else { setEditandoId(null); setEditandoNome(""); }
    setLoadingId(null);
  };

  const handleDelete = async (id: string) => {
    setLoadingId(id);
    setErro(null);
    const res = await deleteArea(id);
    if (res?.error) setErro(res.error);
    setConfirmDeleteId(null);
    setLoadingId(null);
  };

  const startEdit = (id: string, nome: string) => {
    setEditandoId(id);
    setEditandoNome(nome);
    setErro(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tags className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Gerenciar Áreas / Setores</h2>
              <p className="text-xs text-muted-foreground">Essas áreas aparecem no cadastro de usuários e nos Tipos de Despesa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Banner setup */}
          {setupSql && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-xs font-medium text-foreground">Execute o SQL abaixo no Supabase SQL Editor</p>
              </div>
              <pre className="text-xs font-mono bg-muted rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">{setupSql}</pre>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {erro}
            </div>
          )}

          {/* Adicionar nova */}
          <div className="flex gap-2">
            <input
              type="text"
              value={novaArea}
              onChange={(e) => setNovaArea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
              placeholder="Nova área ou setor..."
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loadingNova}
            />
            <button
              onClick={handleAdd}
              disabled={loadingNova || !novaArea.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loadingNova ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : areas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma área cadastrada.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {areas.map((area) => (
                <li
                  key={area.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {editandoId === area.id ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={editandoNome}
                        onChange={(e) => setEditandoNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) handleUpdate(area.id);
                          if (e.key === "Escape") { setEditandoId(null); setEditandoNome(""); }
                        }}
                        className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => handleUpdate(area.id)}
                        disabled={loadingId === area.id}
                        className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                        title="Salvar"
                      >
                        {loadingId === area.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditandoId(null); setEditandoNome(""); }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : confirmDeleteId === area.id ? (
                    <>
                      <span className="flex-1 text-sm text-destructive font-medium">Remover &quot;{area.nome}&quot;?</span>
                      <button
                        onClick={() => handleDelete(area.id)}
                        disabled={loadingId === area.id}
                        className="px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
                      >
                        {loadingId === area.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-foreground">{area.nome}</span>
                      <button
                        onClick={() => startEdit(area.id, area.nome)}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(area.id)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

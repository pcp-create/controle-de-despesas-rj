"use client";

import { useState } from "react";
import { useProfiles } from "@/lib/supabase/hooks";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  Search,
  PlusCircle,
  Edit2,
  Power,
  User,
  Shield,
  Users,
  Briefcase,
  ChevronDown,
} from "lucide-react";

const perfilConfig = {
  tecnico: { label: "Técnico", color: "bg-primary/10 text-primary", icon: Briefcase },
  gestor: { label: "Gestor", color: "bg-accent/10 text-accent", icon: Users },
  financeiro: { label: "Financeiro", color: "bg-success/10 text-success", icon: Shield },
  administrador: { label: "Admin", color: "bg-warning/10 text-warning", icon: Shield },
};

export default function UsuariosPageSupabase() {
  const { profile: currentProfile } = useAuth();
  const { profiles, isLoading, toggleProfileStatus } = useProfiles();
  
  const [search, setSearch] = useState("");
  const [filterPerfil, setFilterPerfil] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const usuariosFiltrados = profiles
    .filter((u) => {
      if (filterPerfil !== "todos" && u.perfil !== filterPerfil) return false;
      if (search) {
        const term = search.toLowerCase();
        return (
          u.nome.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          u.usuario.toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const handleToggleStatus = async (id: string, ativo: boolean) => {
    const result = await toggleProfileStatus(id, !ativo);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: ativo ? "Usuário desativado" : "Usuário ativado" });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const gestores = profiles.filter((p) => p.perfil === "gestor" || p.perfil === "administrador");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">{profiles.length} usuário(s) cadastrado(s)</p>
        </div>
        <button
          className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Novo Usuário
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

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou usuário..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterPerfil}
            onChange={(e) => setFilterPerfil(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm appearance-none"
          >
            <option value="todos">Todos os perfis</option>
            <option value="tecnico">Técnicos</option>
            <option value="gestor">Gestores</option>
            <option value="financeiro">Financeiro</option>
            <option value="administrador">Administradores</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {usuariosFiltrados.map((u) => {
          const perfil = perfilConfig[u.perfil];
          const PerfilIcon = perfil.icon;
          const gestor = gestores.find((g) => g.id === u.gestor_id);

          return (
            <div
              key={u.id}
              className={`bg-white rounded-xl border border-border shadow-sm p-4 ${!u.ativo ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold">
                    {u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground truncate">{u.nome}</h3>
                    {!u.ativo && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inativo</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${perfil.color}`}>
                      <PerfilIcon className="w-3 h-3" />
                      {perfil.label}
                    </span>
                    {gestor && (
                      <span className="text-xs text-muted-foreground">
                        Gestor: {gestor.nome.split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {currentProfile?.perfil === "administrador" && u.id !== currentProfile.id && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleStatus(u.id, u.ativo)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm transition ${
                      u.ativo
                        ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "border border-success/30 text-success hover:bg-success/10"
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {u.ativo ? "Desativar" : "Ativar"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {usuariosFiltrados.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhum usuário encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros ou cadastre novos usuários</p>
        </div>
      )}
    </div>
  );
}

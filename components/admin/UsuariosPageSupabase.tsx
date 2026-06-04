"use client";

import { useState } from "react";
import { useProfiles, type Profile } from "@/lib/supabase/hooks";
import { useAuth, type Perfil } from "@/lib/supabase/auth-context";
import { createClient } from "@/lib/supabase/client";
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
  X,
  Trash2,
  Loader2,
} from "lucide-react";

const perfilConfig = {
  tecnico: { label: "Tecnico", color: "bg-primary/10 text-primary", icon: Briefcase },
  gestor: { label: "Gestor", color: "bg-accent/10 text-accent", icon: Users },
  financeiro: { label: "Financeiro", color: "bg-success/10 text-success", icon: Shield },
  administrador: { label: "Admin", color: "bg-warning/10 text-warning", icon: Shield },
};

interface UsuarioForm {
  nome: string;
  email: string;
  usuario: string;
  perfil: Perfil;
  gestor_id: string | null;
  senha?: string;
}

const initialForm: UsuarioForm = {
  nome: "",
  email: "",
  usuario: "",
  perfil: "tecnico",
  gestor_id: null,
  senha: "",
};

export default function UsuariosPageSupabase() {
  const { profile: currentProfile } = useAuth();
  const { profiles, isLoading, mutate, toggleProfileStatus } = useProfiles();
  
  const [search, setSearch] = useState("");
  const [filterPerfil, setFilterPerfil] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [form, setForm] = useState<UsuarioForm>(initialForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);

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
      setFeedback({ type: "success", msg: ativo ? "Usuario desativado" : "Usuario ativado" });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleOpenModal = (user?: Profile) => {
    if (user) {
      setEditingUser(user);
      setForm({
        nome: user.nome,
        email: user.email,
        usuario: user.usuario,
        perfil: user.perfil,
        gestor_id: user.gestor_id,
        senha: "",
      });
    } else {
      setEditingUser(null);
      setForm(initialForm);
    }
    setFormError("");
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setForm(initialForm);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);

    try {
      if (editingUser) {
        // Editar usuario existente
        const supabase = createClient();
        const { error } = await supabase
          .from("profiles")
          .update({
            nome: form.nome,
            usuario: form.usuario,
            perfil: form.perfil,
            gestor_id: form.gestor_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingUser.id);

        if (error) {
          setFormError(error.message);
          setFormLoading(false);
          return;
        }

        setFeedback({ type: "success", msg: "Usuario atualizado com sucesso!" });
      } else {
        // Criar novo usuario via API
        const response = await fetch("/api/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            password: form.senha,
            nome: form.nome,
            usuario: form.usuario,
            perfil: form.perfil,
            gestor_id: form.gestor_id,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setFormError(data.error || "Erro ao criar usuario");
          setFormLoading(false);
          return;
        }

        setFeedback({ type: "success", msg: "Usuario criado com sucesso!" });
      }

      await mutate();
      handleCloseModal();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFormError("Erro ao processar solicitacao");
    }

    setFormLoading(false);
  };

  const handleDelete = async (user: Profile) => {
    setFormLoading(true);
    
    try {
      const response = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: "error", msg: data.error || "Erro ao remover usuario" });
      } else {
        setFeedback({ type: "success", msg: "Usuario removido com sucesso!" });
        await mutate();
      }
    } catch (err) {
      setFeedback({ type: "error", msg: "Erro ao processar solicitacao" });
    }

    setDeleteConfirm(null);
    setFormLoading(false);
    setTimeout(() => setFeedback(null), 3000);
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
          <h1 className="text-xl font-bold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground">{profiles.length} usuario(s) cadastrado(s)</p>
        </div>
        {currentProfile?.perfil === "administrador" && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Usuario
          </button>
        )}
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
            placeholder="Buscar por nome, email ou usuario..."
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
            <option value="tecnico">Tecnicos</option>
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
                    onClick={() => handleOpenModal(u)}
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
                  <button
                    onClick={() => setDeleteConfirm(u)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
          <h3 className="text-lg font-semibold text-foreground">Nenhum usuario encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros ou cadastre novos usuarios</p>
        </div>
      )}

      {/* Modal de Criar/Editar Usuario */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingUser ? "Editar Usuario" : "Novo Usuario"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg hover:bg-muted transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
              {/* Nome */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Nome completo</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Digite o nome completo"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              {/* Email - apenas para novo usuario */}
              {!editingUser && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Digite o email"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              )}

              {/* Usuario */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Usuario</label>
                <input
                  type="text"
                  value={form.usuario}
                  onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                  placeholder="Digite o nome de usuario"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              {/* Senha - apenas para novo usuario */}
              {!editingUser && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Senha</label>
                  <input
                    type="password"
                    value={form.senha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                    placeholder="Digite a senha (min. 6 caracteres)"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                    minLength={6}
                  />
                </div>
              )}

              {/* Perfil */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Perfil</label>
                <select
                  value={form.perfil}
                  onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="tecnico">Tecnico</option>
                  <option value="gestor">Gestor</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>

              {/* Gestor (apenas para tecnicos) */}
              {form.perfil === "tecnico" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Gestor responsavel</label>
                  <select
                    value={form.gestor_id || ""}
                    onChange={(e) => setForm({ ...form, gestor_id: e.target.value || null })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione um gestor</option>
                    {gestores.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Erro */}
              {formError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              {/* Botoes */}
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
                >
                  {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingUser ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmacao de Exclusao */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Confirmar exclusao</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja remover o usuario <strong>{deleteConfirm.nome}</strong>? 
              Esta acao nao pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={formLoading}
                className="flex-1 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

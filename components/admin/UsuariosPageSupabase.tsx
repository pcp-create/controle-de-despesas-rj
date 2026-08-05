"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useFrotas, useAreas } from "@/lib/supabase/hooks";
import GestaoAreasModal from "./GestaoAreasModal";
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
  Key,
  CreditCard,
  Car,
  Pencil,
} from "lucide-react";
import { mockEmpresas, mockFornecedores, mockCondicoesPagamento, mockOperacoesFinanceiras, mockMoedas } from "@/lib/mock-data";

const perfilConfig = {
  funcionario: { label: "Funcionário", color: "bg-primary/10 text-primary", icon: Briefcase },
  gestor: { label: "Gestor", color: "bg-accent/10 text-accent", icon: Users },
  financeiro: { label: "Financeiro", color: "bg-success/10 text-success", icon: Shield },
  administrador: { label: "Admin", color: "bg-warning/10 text-warning", icon: Shield },
};

interface UsuarioForm {
  nome: string;
  email: string;
  usuario: string;
  perfil: "funcionario" | "gestor" | "financeiro" | "administrador";
  area: string;
  telefone: string;
  gestor_id: string | null;
  frota_padrao_id: string | null;
  chave_pix: string;
  senha?: string;
  pessoaId?: string;
}

const initialForm: UsuarioForm = {
  nome: "",
  email: "",
  usuario: "",
  perfil: "funcionario",
  area: "",
  telefone: "",
  gestor_id: null,
  frota_padrao_id: null,
  chave_pix: "",
  senha: "",
  pessoaId: "",
};

export default function UsuariosPageSupabase() {
  const { currentUser, users, login, logout, addUser, updateUser, deleteUser } = useAppStore();
  
  const [search, setSearch] = useState("");
  const [filterPerfil, setFilterPerfil] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState<string | null>(null);

  // Verifica se a coluna pessoa_id já existe no banco
  useEffect(() => {
    if (currentUser?.perfil !== "administrador") return;
    fetch("/api/setup-pessoa-id")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsMigration) setMigrationNeeded(data.sql);
      })
      .catch(() => {});
  }, [currentUser]);

  // Verifica se a coluna frota_padrao_id já existe no banco
  useEffect(() => {
    if (currentUser?.perfil !== "administrador") return;
    fetch("/api/setup-frota-padrao")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsMigration) setMigrationNeeded(data.sql);
      })
      .catch(() => {});
  }, [currentUser?.perfil]);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [form, setForm] = useState<UsuarioForm>(initialForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [activeTab, setActiveTab] = useState("basico");
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);

  // Cartões state
  const [userCartoes, setUserCartoes] = useState<any[]>([]);
  const [showNovoCartao, setShowNovoCartao] = useState(false);
  const [novoCartao, setNovoCartao] = useState({
    banco: "",
    bandeira: "VISA",
    ultimosDigitos: "",
    apelido: "",
    isPadrao: false,
    empresaIdM8: "",
  });
  const [cartoesLoading, setCartoesLoading] = useState(false);
  // Edição inline de cartão
  const [editingCartaoId, setEditingCartaoId] = useState<string | null>(null);
  const [editingCartaoData, setEditingCartaoData] = useState<{
    banco: string; bandeira: string; ultimosDigitos: string;
    apelido: string; isPadrao: boolean; empresaIdM8: string;
  } | null>(null);

  const usuariosFiltrados = users
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

  const handleOpenModal = (user?: any) => {
    if (user) {
      setEditingUser(user);
      loadUserCartoes(user.id);
      setForm({
        nome: user.nome,
        email: user.email,
        usuario: user.usuario,
        perfil: user.perfil,
        area: user.area || "",
        telefone: user.telefone || "",
        gestor_id: user.gestor_id || null,
        frota_padrao_id: user.frota_padrao_id || null,
        chave_pix: user.chave_pix || "",
        senha: "",
        pessoaId: user.pessoa_id ? String(user.pessoa_id) : "",
      });
    } else {
      setEditingUser(null);
      setUserCartoes([]);
      setForm(initialForm);
    }
    setFormError("");
    setActiveTab("basico");
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
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      if (!supabase) {
        setFormError("Supabase não disponível");
        setFormLoading(false);
        return;
      }

      if (editingUser) {
        // Atualizar usuário
        const { error } = await supabase
          .from("profiles")
          .update({
            nome: form.nome,
            email: form.email,
            usuario: form.usuario,
            perfil: form.perfil,
            area: form.area || null,
            telefone: form.telefone || null,
            gestor_id: form.gestor_id || null,
            frota_padrao_id: form.frota_padrao_id || null,
            chave_pix: form.chave_pix.trim() || null,
            pessoa_id: form.pessoaId ? Number(form.pessoaId) : null,
          })
          .eq("id", editingUser.id);

        if (error) {
          setFormError("Erro ao atualizar usuário: " + error.message);
          setFormLoading(false);
          return;
        }
        
        updateUser(editingUser.id, form);
        setFeedback({ type: "success", msg: "Usuário atualizado com sucesso!" });
      } else {
        // Criar usuário via API server-side (cria no Auth e depois no profiles)
        if (!form.senha || form.senha.trim().length < 6) {
          setFormError("A senha deve ter pelo menos 6 caracteres");
          setFormLoading(false);
          return;
        }

        const createRes = await fetch("/api/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            password: form.senha,
            nome: form.nome,
            usuario: form.usuario,
            perfil: form.perfil,
            gestor_id: form.gestor_id || null,
            telefone: form.telefone || null,
          }),
        });

        const createData = await createRes.json();

        if (!createRes.ok) {
          setFormError("Erro ao criar usuário: " + (createData.error || "Erro desconhecido"));
          setFormLoading(false);
          return;
        }

        const userId = createData.user.id;

        // Atualizar os campos extras no profile criado pelo Auth
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            primeiro_acesso: true, // força troca de senha no primeiro login
            senha: form.senha,
            area: form.area && form.area.trim() ? form.area : null,
            telefone: form.telefone && form.telefone.trim() ? form.telefone : null,
            pessoa_id: form.pessoaId && form.pessoaId.trim() ? Number(form.pessoaId) : null,
          })
          .eq("id", userId);

        if (updateError) {
          setFormError("Usuário criado, mas houve erro ao salvar campos extras: " + updateError.message);
          setFormLoading(false);
          return;
        }

        addUser({
          ...form,
          id: userId,
          ativo: true,
          primeiroAcesso: false,
        });
        setFeedback({ type: "success", msg: "Usuário criado com sucesso!" });
      }

      // Recarregar dados do Supabase
      const { loadSupabaseData } = useAppStore.getState();
      await loadSupabaseData();

      handleCloseModal();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("[v0] Erro ao processar usuário:", err);
      setFormError("Erro ao processar solicitação: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }

    setFormLoading(false);
  };

  const handleDelete = async (user: any) => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      if (!supabase) {
        setFeedback({ type: "error", msg: "Supabase não disponível" });
        return;
      }

      // Deletar do profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user.id);

      if (profileError) {
        setFeedback({ type: "error", msg: "Erro ao deletar usuário: " + profileError.message });
        return;
      }

      deleteUser(user.id);
      setDeleteConfirm(null);
      setFeedback({ type: "success", msg: "Usuário removido com sucesso!" });
      
      // Recarregar dados
      const { loadSupabaseData } = useAppStore.getState();
      await loadSupabaseData();
      
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("[v0] Erro ao deletar usuário:", err);
      setFeedback({ type: "error", msg: "Erro ao deletar usuário" });
    }
  };

  const handleResetPassword = async (user: any) => {
    try {
      setFormLoading(true);

      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setFeedback({ type: "error", msg: "Erro ao resetar senha: " + (data.error ?? res.statusText) });
      } else {
        const { loadSupabaseData } = useAppStore.getState();
        await loadSupabaseData();
        setFeedback({ type: "success", msg: `Senha de ${user.nome} resetada para: ${data.senha}` });
      }

      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      setFeedback({ type: "error", msg: "Erro ao resetar senha" });
    } finally {
      setFormLoading(false);
    }
  };

  const loadUserCartoes = async (userId: string) => {
    try {
      setCartoesLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data: cartoes, error } = await supabase
        .from("cartoes")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.error("[v0] Error loading cartoes:", error);
        return;
      }

      setUserCartoes(cartoes || []);
    } catch (err) {
      console.error("[v0] Failed to load cartoes:", err);
    } finally {
      setCartoesLoading(false);
    }
  };

  const handleAddCartao = async () => {
    if (!novoCartao.banco || !novoCartao.ultimosDigitos) {
      setFeedback({ type: "error", msg: "Banco e últimos dígitos são obrigatórios." });
      return;
    }
    if (!novoCartao.empresaIdM8.trim()) {
      setFeedback({ type: "error", msg: "O campo Empresa ID M8 é obrigatório." });
      return;
    }

    if (!editingUser) return;

    try {
      setCartoesLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data, error } = await supabase
        .from("cartoes")
        .insert([
          {
            user_id: editingUser.id,
            banco: novoCartao.banco,
            bandeira: novoCartao.bandeira,
            ultimos_digitos: novoCartao.ultimosDigitos,
            apelido: novoCartao.apelido || null,
            is_padrao: novoCartao.isPadrao,
            empresa_id_m8: parseInt(novoCartao.empresaIdM8, 10),
            ativo: true,
          },
        ])
        .select();

      if (error) {
        setFeedback({ type: "error", msg: `Erro: ${error.message}` });
        return;
      }

      setUserCartoes([...userCartoes, data[0]]);
      setNovoCartao({ banco: "", bandeira: "VISA", ultimosDigitos: "", apelido: "", isPadrao: false, empresaIdM8: "" });
      setShowNovoCartao(false);
      setFeedback({ type: "success", msg: "Cartão adicionado com sucesso!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: "error", msg: `Erro: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    } finally {
      setCartoesLoading(false);
    }
  };

  const handleStartEditCartao = (cartao: any) => {
    setEditingCartaoId(cartao.id);
    setEditingCartaoData({
      banco: cartao.banco,
      bandeira: cartao.bandeira,
      ultimosDigitos: cartao.ultimos_digitos,
      apelido: cartao.apelido || "",
      isPadrao: cartao.is_padrao,
      empresaIdM8: cartao.empresa_id_m8 != null ? String(cartao.empresa_id_m8) : "",
    });
  };

  const handleSaveCartaoEdit = async () => {
    if (!editingCartaoId || !editingCartaoData) return;
    if (!editingCartaoData.banco || !editingCartaoData.ultimosDigitos) {
      setFeedback({ type: "error", msg: "Banco e últimos dígitos são obrigatórios." });
      return;
    }
    if (!editingCartaoData.empresaIdM8.trim()) {
      setFeedback({ type: "error", msg: "O campo Empresa ID M8 é obrigatório." });
      return;
    }

    try {
      setCartoesLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { error } = await supabase
        .from("cartoes")
        .update({
          banco: editingCartaoData.banco,
          bandeira: editingCartaoData.bandeira,
          ultimos_digitos: editingCartaoData.ultimosDigitos,
          apelido: editingCartaoData.apelido || null,
          is_padrao: editingCartaoData.isPadrao,
          empresa_id_m8: parseInt(editingCartaoData.empresaIdM8, 10),
        })
        .eq("id", editingCartaoId);

      if (error) {
        setFeedback({ type: "error", msg: `Erro: ${error.message}` });
        return;
      }

      setUserCartoes(userCartoes.map((c) =>
        c.id === editingCartaoId
          ? {
              ...c,
              banco: editingCartaoData.banco,
              bandeira: editingCartaoData.bandeira,
              ultimos_digitos: editingCartaoData.ultimosDigitos,
              apelido: editingCartaoData.apelido || null,
              is_padrao: editingCartaoData.isPadrao,
              empresa_id_m8: parseInt(editingCartaoData.empresaIdM8, 10),
            }
          : c
      ));
      setEditingCartaoId(null);
      setEditingCartaoData(null);
      setFeedback({ type: "success", msg: "Cartão atualizado com sucesso!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: "error", msg: `Erro: ${err instanceof Error ? err.message : "Erro desconhecido"}` });
    } finally {
      setCartoesLoading(false);
    }
  };

  const handleDeleteCartao = async (cartaoId: string) => {
    try {
      setCartoesLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { error } = await supabase.from("cartoes").delete().eq("id", cartaoId);

      if (error) {
        setFeedback({ type: "error", msg: "Erro ao deletar cartão" });
        console.error("[v0] Error deleting cartao:", error);
        return;
      }

      setUserCartoes(userCartoes.filter((c) => c.id !== cartaoId));
      setFeedback({ type: "success", msg: "Cartão removido com sucesso!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ type: "error", msg: "Erro ao deletar cartão" });
      console.error("[v0] Failed to delete cartao:", err);
    } finally {
      setCartoesLoading(false);
    }
  };

  const gestores = users.filter((p) => p.perfil === "gestor" || p.perfil === "administrador");
  const { frotas } = useFrotas();
  const frotasAtivas = frotas.filter((f) => f.ativo);
  const { areas } = useAreas();
  const [showGestaoAreas, setShowGestaoAreas] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        {currentUser?.perfil === "administrador" && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Banner de migration pendente */}
      {migrationNeeded && (
        <div className="rounded-lg px-4 py-3 text-sm bg-warning/10 border border-warning/30 text-warning-foreground flex flex-col gap-2">
          <p className="font-medium text-foreground flex items-center gap-2">
            <Car className="w-4 h-4 text-warning" />
            Configuração necessária: campo "Veículo padrão"
          </p>
          <p className="text-muted-foreground text-xs">
            Execute o SQL abaixo no <strong>Supabase SQL Editor</strong> (Dashboard → SQL Editor) para ativar o veículo padrão por funcionário:
          </p>
          <code className="bg-muted text-foreground text-xs px-3 py-2 rounded-md block font-mono break-all">
            {migrationNeeded}
          </code>
        </div>
      )}

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
            <option value="funcionario">Funcionários</option>
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
          const perfil = perfilConfig[u.perfil as keyof typeof perfilConfig];
          const PerfilIcon = perfil.icon;
          const gestor = gestores.find((g) => g.id === u.gestor_id);
          const frotaPadrao = frotasAtivas.find((f) => f.id === u.frota_padrao_id);

          return (
            <div
              key={u.id}
              className={`bg-white rounded-xl border border-border shadow-sm p-4 ${!u.ativo ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold">
                    {u.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
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
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${perfil.color}`}>
                      <PerfilIcon className="w-3 h-3" />
                      {perfil.label}
                    </span>
                    {u.area && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {u.area}
                      </span>
                    )}
                    {gestor && (
                      <span className="text-xs text-muted-foreground">
                        Gestor: {gestor.nome.split(" ")[0]}
                      </span>
                    )}
                    {frotaPadrao && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        <Car className="w-3 h-3" />
                        {frotaPadrao.placa}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {currentUser?.perfil === "administrador" && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <button
                    onClick={() => handleOpenModal(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    {u.id === currentUser.id ? "Editar meu perfil" : "Editar"}
                  </button>
                  {u.id !== currentUser.id && (
                    <>
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition"
                        title="Resetar senha"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(u)}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
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

      {/* Modal de Criar/Editar Usuário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg hover:bg-muted transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-border bg-muted/30">
              <button
                onClick={() => setActiveTab("basico")}
                className={`flex-1 px-4 py-2 text-sm font-medium transition border-b-2 ${
                  activeTab === "basico"
                    ? "border-b-accent text-foreground"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Informações Básicas
              </button>
              <button
                onClick={() => setActiveTab("cartoes")}
                className={`flex-1 px-4 py-2 text-sm font-medium transition border-b-2 ${
                  activeTab === "cartoes"
                    ? "border-b-accent text-foreground"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Cartões
              </button>
              <button
                onClick={() => setActiveTab("erp")}
                className={`flex-1 px-4 py-2 text-sm font-medium transition border-b-2 ${
                  activeTab === "erp"
                    ? "border-b-accent text-foreground"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Configurações ERP
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Tab: Básico */}
              {activeTab === "basico" && (
                <>
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

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Digite o email"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      required={!editingUser}
                      disabled={!!editingUser}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Usuário</label>
                    <input
                      type="text"
                      value={form.usuario}
                      onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                      placeholder="Digite o nome de usuário"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Telefone</label>
                    <input
                      type="tel"
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                      placeholder="(21) 9999-9999"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {!editingUser && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">Senha</label>
                      <input
                        type="password"
                        value={form.senha}
                        onChange={(e) => setForm({ ...form, senha: e.target.value })}
                        placeholder="Digite a senha"
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                        minLength={6}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Perfil</label>
                    <select
                      value={form.perfil}
                      onChange={(e) => setForm({ ...form, perfil: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    >
                      <option value="funcionario">Funcionário</option>
                      <option value="gestor">Gestor</option>
                      <option value="financeiro">Financeiro</option>
                      <option value="administrador">Administrador</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground">Área / Setor</label>
                      {currentUser?.perfil === "administrador" && (
                        <button
                          type="button"
                          onClick={() => setShowGestaoAreas(true)}
                          className="text-xs text-primary hover:underline"
                        >
                          Gerenciar áreas
                        </button>
                      )}
                    </div>
                    <select
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Selecione a área...</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.nome}>{a.nome}</option>
                      ))}
                    </select>
                  </div>

                  {form.perfil === "funcionario" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-foreground">Gestor responsável</label>
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

                  {/* Veículo padrão — visível para todos os perfis */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-muted-foreground" />
                      Veículo padrão
                    </label>
                    <select
                      value={form.frota_padrao_id || ""}
                      onChange={(e) => setForm({ ...form, frota_padrao_id: e.target.value || null })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Nenhum (selecionar ao iniciar viagem)</option>
                      {frotasAtivas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.placa} — {f.marca} {f.modelo}{f.ano ? ` (${f.ano})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Quando definido, o veículo será pré-selecionado no Controle de KM.
                    </p>
                  </div>

                  {/* Chave PIX */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      Chave PIX
                    </label>
                    <input
                      type="text"
                      value={form.chave_pix}
                      onChange={(e) => setForm({ ...form, chave_pix: e.target.value })}
                      placeholder="CPF, e-mail, telefone ou chave aleatória"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      Utilizada no relatório de reembolsos para facilitar o pagamento. Campo opcional.
                    </p>
                  </div>
                </>
              )}

              {/* Tab: Cartões */}
              {activeTab === "cartoes" && editingUser && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-foreground">Cartões de Crédito</h3>
                    {!showNovoCartao && (
                      <button
                        type="button"
                        onClick={() => setShowNovoCartao(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/90 transition"
                        disabled={cartoesLoading}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Adicionar
                      </button>
                    )}
                  </div>

                  {/* Formulário novo cartão */}
                  {showNovoCartao && (
                    <div className="bg-muted/30 border border-border rounded-lg p-4 mb-4 space-y-3">
                      <h4 className="font-medium text-foreground text-sm">Novo Cartão</h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-foreground">Banco *</label>
                          <input
                            type="text"
                            value={novoCartao.banco}
                            onChange={(e) => setNovoCartao({ ...novoCartao, banco: e.target.value })}
                            placeholder="Ex: Itaú, Bradesco"
                            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-foreground">Bandeira</label>
                          <select
                            value={novoCartao.bandeira}
                            onChange={(e) => setNovoCartao({ ...novoCartao, bandeira: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="VISA">VISA</option>
                            <option value="MASTERCARD">Mastercard</option>
                            <option value="AMEX">American Express</option>
                            <option value="ELO">Elo</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-foreground">Últimos 4 dígitos *</label>
                          <input
                            type="text"
                            value={novoCartao.ultimosDigitos}
                            onChange={(e) => setNovoCartao({ ...novoCartao, ultimosDigitos: e.target.value.slice(0, 4) })}
                            placeholder="Ex: 1234"
                            maxLength={4}
                            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-foreground">Apelido</label>
                          <input
                            type="text"
                            value={novoCartao.apelido}
                            onChange={(e) => setNovoCartao({ ...novoCartao, apelido: e.target.value })}
                            placeholder="Ex: Cartão Principal"
                            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>

                      {/* Empresa ID M8 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">
                          Empresa ID M8 <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={novoCartao.empresaIdM8}
                          onChange={(e) => setNovoCartao({ ...novoCartao, empresaIdM8: e.target.value })}
                          placeholder="Ex: 1"
                          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Identificador da empresa no ERP M8. Utilizado na integração do lançamento.
                        </p>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={novoCartao.isPadrao}
                          onChange={(e) => setNovoCartao({ ...novoCartao, isPadrao: e.target.checked })}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-sm text-foreground">Definir como padrão</span>
                      </label>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleAddCartao}
                          disabled={cartoesLoading}
                          className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/90 disabled:bg-accent/50 transition flex items-center justify-center gap-2"
                        >
                          {cartoesLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNovoCartao(false)}
                          className="flex-1 px-3 py-2 rounded-lg border border-input text-sm hover:bg-muted transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de cartões */}
                  {userCartoes.length > 0 ? (
                    <div className="space-y-2">
                      {userCartoes.map((cartao) => (
                        <div key={cartao.id} className="border border-border rounded-lg overflow-hidden">
                          {/* Linha de exibição */}
                          {editingCartaoId !== cartao.id && (
                            <div className="bg-muted/50 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <CreditCard className="w-6 h-6 text-accent shrink-0" />
                                <div>
                                  <h4 className="font-medium text-foreground text-sm">
                                    {cartao.apelido || cartao.banco}
                                  </h4>
                                  <p className="text-xs text-muted-foreground">
                                    {cartao.banco} · {cartao.bandeira} · **** {cartao.ultimos_digitos}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {cartao.is_padrao && (
                                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Padrão</span>
                                    )}
                                    {cartao.empresa_id_m8 != null ? (
                                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                                        Empresa M8: {cartao.empresa_id_m8}
                                      </span>
                                    ) : (
                                      <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded">
                                        Empresa ID M8 não definido
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCartao(cartao)}
                                  disabled={cartoesLoading}
                                  className="p-1.5 rounded-lg hover:bg-muted transition disabled:opacity-50"
                                  title="Editar cartão"
                                >
                                  <Pencil className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCartao(cartao.id)}
                                  disabled={cartoesLoading}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition disabled:opacity-50"
                                  title="Excluir cartão"
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Formulário de edição inline */}
                          {editingCartaoId === cartao.id && editingCartaoData && (
                            <div className="bg-muted/30 p-4 space-y-3">
                              <h4 className="font-medium text-foreground text-sm">Editar Cartão</h4>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-medium text-foreground">Banco *</label>
                                  <input
                                    type="text"
                                    value={editingCartaoData.banco}
                                    onChange={(e) => setEditingCartaoData({ ...editingCartaoData, banco: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-medium text-foreground">Bandeira</label>
                                  <select
                                    value={editingCartaoData.bandeira}
                                    onChange={(e) => setEditingCartaoData({ ...editingCartaoData, bandeira: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  >
                                    <option value="VISA">VISA</option>
                                    <option value="MASTERCARD">Mastercard</option>
                                    <option value="AMEX">American Express</option>
                                    <option value="ELO">Elo</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-medium text-foreground">Últimos 4 dígitos *</label>
                                  <input
                                    type="text"
                                    value={editingCartaoData.ultimosDigitos}
                                    onChange={(e) => setEditingCartaoData({ ...editingCartaoData, ultimosDigitos: e.target.value.slice(0, 4) })}
                                    maxLength={4}
                                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-sm font-medium text-foreground">Apelido</label>
                                  <input
                                    type="text"
                                    value={editingCartaoData.apelido}
                                    onChange={(e) => setEditingCartaoData({ ...editingCartaoData, apelido: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-foreground">
                                  Empresa ID M8 <span className="text-destructive">*</span>
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={editingCartaoData.empresaIdM8}
                                  onChange={(e) => setEditingCartaoData({ ...editingCartaoData, empresaIdM8: e.target.value })}
                                  placeholder="Ex: 1"
                                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Identificador da empresa no ERP M8. Utilizado na integração do lançamento.
                                </p>
                              </div>

                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingCartaoData.isPadrao}
                                  onChange={(e) => setEditingCartaoData({ ...editingCartaoData, isPadrao: e.target.checked })}
                                  className="w-4 h-4 rounded border-input"
                                />
                                <span className="text-sm text-foreground">Definir como padrão</span>
                              </label>

                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleSaveCartaoEdit}
                                  disabled={cartoesLoading}
                                  className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/90 disabled:bg-accent/50 transition flex items-center justify-center gap-2"
                                >
                                  {cartoesLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                  Salvar alterações
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingCartaoId(null); setEditingCartaoData(null); }}
                                  className="flex-1 px-3 py-2 rounded-lg border border-input text-sm hover:bg-muted transition"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !showNovoCartao && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        <CreditCard className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p>Nenhum cartão cadastrado</p>
                      </div>
                    )
                  )}
                </>
              )}

              {activeTab === "cartoes" && !editingUser && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  <p>Salve o usuário primeiro para adicionar cartões de crédito.</p>
                </div>
              )}
              {activeTab === "erp" && (
                <div className="flex flex-col gap-3">
                  {migrationNeeded && (
                    <div className="flex flex-col gap-2 px-3 py-3 rounded-lg border border-warning/40 bg-warning/8">
                      <p className="text-xs font-medium text-warning">
                        A coluna <code>pessoa_id</code> ainda nao existe no banco. Execute o SQL abaixo no Supabase SQL Editor para habilitar este campo:
                      </p>
                      <code className="text-[11px] bg-muted px-2 py-1.5 rounded font-mono text-foreground break-all select-all">
                        {migrationNeeded}
                      </code>
                      <button
                        type="button"
                        onClick={() => fetch("/api/setup-pessoa-id").then((r) => r.json()).then((d) => { if (d.success) setMigrationNeeded(null); })}
                        className="self-start text-xs px-3 py-1 rounded-md bg-warning/10 border border-warning/30 text-warning hover:bg-warning/20 transition"
                      >
                        Tentar aplicar automaticamente
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Pessoa ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!!migrationNeeded}
                      value={form.pessoaId || ""}
                      onChange={(e) => setForm({ ...form, pessoaId: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="Ex: 27977"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                      Identificador da pessoa no ERP M8. Usado na integração de despesas.
                    </p>
                  </div>
                </div>
              )}

              {/* Erro */}
              {formError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t border-border bg-muted/30">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={formLoading}
                className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingUser ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Confirmar exclusão</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja remover o usuário <strong>{deleteConfirm.nome}</strong>? 
              Esta ação não pode ser desfeita.
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
                className="flex-1 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestão de áreas */}
      {showGestaoAreas && (
        <GestaoAreasModal onClose={() => setShowGestaoAreas(false)} />
      )}
    </div>
  );
}

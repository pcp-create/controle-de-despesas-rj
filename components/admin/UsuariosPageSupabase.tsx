"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
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
  gestor_id: string | null;
  senha?: string;
  empresaId?: string;
  fornecedorId?: string;
  condicaoPagamentoId?: string;
  operacaoFinanceiraId?: string;
  moedaId?: string;
  centroCustoId?: string;
}

const initialForm: UsuarioForm = {
  nome: "",
  email: "",
  usuario: "",
  perfil: "funcionario",
  gestor_id: null,
  senha: "",
  empresaId: "",
  fornecedorId: "",
  condicaoPagamentoId: "",
  operacaoFinanceiraId: "",
  moedaId: "",
  centroCustoId: "",
};

export default function UsuariosPageSupabase() {
  const { currentUser, users, login, logout, addUser, updateUser, deleteUser } = useAppStore();
  
  const [search, setSearch] = useState("");
  const [filterPerfil, setFilterPerfil] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  
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
  });
  const [cartoesLoading, setCartoesLoading] = useState(false);

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
        gestor_id: user.gestor_id || null,
        senha: "",
        empresaId: user.empresaId || "",
        fornecedorId: user.fornecedorId || "",
        condicaoPagamentoId: user.condicaoPagamentoId || "",
        operacaoFinanceiraId: user.operacaoFinanceiraId || "",
        moedaId: user.moedaId || "",
        centroCustoId: user.centroCustoId || "",
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
            gestor_id: form.gestor_id || null,
            empresa_id: form.empresaId || null,
            fornecedor_id: form.fornecedorId || null,
            condicao_pagamento_id: form.condicaoPagamentoId || null,
            operacao_financeira_id: form.operacaoFinanceiraId || null,
            moeda_id: form.moedaId || null,
            centro_custo_id: form.centroCustoId || null,
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
        // Criar novo usuário com UUID gerado localmente
        const userId = crypto.randomUUID();

        // Inserir diretamente em profiles (sem usar Auth)
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            nome: form.nome,
            email: form.email,
            usuario: form.usuario,
            perfil: form.perfil,
            gestor_id: form.gestor_id && form.gestor_id.trim() ? form.gestor_id : null,
            empresa_id: form.empresaId && form.empresaId.trim() ? form.empresaId : null,
            fornecedor_id: form.fornecedorId && form.fornecedorId.trim() ? form.fornecedorId : null,
            condicao_pagamento_id: form.condicaoPagamentoId && form.condicaoPagamentoId.trim() ? form.condicaoPagamentoId : null,
            operacao_financeira_id: form.operacaoFinanceiraId && form.operacaoFinanceiraId.trim() ? form.operacaoFinanceiraId : null,
            moeda_id: form.moedaId && form.moedaId.trim() ? form.moedaId : null,
            centro_custo_id: form.centroCustoId && form.centroCustoId.trim() ? form.centroCustoId : null,
            ativo: true,
            primeiro_acesso: false,
            senha: form.senha || "12345",
          });

        if (profileError) {
          setFormError("Erro ao criar usuário: " + profileError.message);
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
    const novaSenh = "12345";
    
    try {
      setFormLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Atualizar senha no Supabase
      const { error } = await supabase
        .from("profiles")
        .update({ 
          senha: novaSenh,
          primeiro_acesso: true 
        })
        .eq("id", user.id);

      if (error) {
        console.error("[v0] Erro ao resetar senha:", error);
        setFeedback({ type: "error", msg: "Erro ao resetar senha: " + error.message });
      } else {
        // Recarregar dados do Supabase
        const { loadSupabaseData } = useAppStore.getState();
        await loadSupabaseData();
        
        setFeedback({ type: "success", msg: `Senha de ${user.nome} resetada para: ${novaSenh}` });
      }
      
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      console.error("[v0] Erro ao resetar senha:", err);
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
      setFeedback({ type: "error", msg: "Banco e últimos dígitos são obrigatórios" });
      return;
    }

    if (!editingUser) return;

    try {
      setCartoesLoading(true);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      console.log("[v0] Adding cartao with data:", {
        user_id: editingUser.id,
        banco: novoCartao.banco,
        bandeira: novoCartao.bandeira,
        ultimos_digitos: novoCartao.ultimosDigitos,
        apelido: novoCartao.apelido,
        is_padrao: novoCartao.isPadrao,
        ativo: true,
      });

      const { data, error } = await supabase
        .from("cartoes")
        .insert([
          {
            user_id: editingUser.id,
            banco: novoCartao.banco,
            bandeira: novoCartao.bandeira,
            ultimos_digitos: novoCartao.ultimosDigitos,
            apelido: novoCartao.apelido,
            is_padrao: novoCartao.isPadrao,
            ativo: true,
          },
        ])
        .select();

      console.log("[v0] Supabase response:", { data, error });

      if (error) {
        console.error("[v0] Supabase error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setFeedback({ type: "error", msg: `Erro: ${error.message}` });
        return;
      }

      console.log("[v0] Cartao added successfully:", data);
      setUserCartoes([...userCartoes, data[0]]);
      setNovoCartao({
        banco: "",
        bandeira: "VISA",
        ultimosDigitos: "",
        apelido: "",
        isPadrao: false,
      });
      setShowNovoCartao(false);
      setFeedback({ type: "success", msg: "Cartão adicionado com sucesso!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("[v0] Exception caught:", err);
      setFeedback({ type: "error", msg: `Erro: ${err instanceof Error ? err.message : 'Erro desconhecido'}` });
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
                        <div key={cartao.id} className="bg-muted/50 border border-border rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CreditCard className="w-6 h-6 text-accent" />
                            <div>
                              <h4 className="font-medium text-foreground text-sm">
                                {cartao.apelido || `${cartao.banco}`}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                {cartao.banco} - {cartao.bandeira} - **** {cartao.ultimos_digitos}
                              </p>
                              {cartao.is_padrao && (
                                <span className="inline-block mt-1 text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                                  Padrão
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCartao(cartao.id)}
                            disabled={cartoesLoading}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 transition disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
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
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Empresa ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.empresaId || ""}
                      onChange={(e) => setForm({ ...form, empresaId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Fornecedor ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.fornecedorId || ""}
                      onChange={(e) => setForm({ ...form, fornecedorId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 101"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Condição de Pagamento ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.condicaoPagamentoId || ""}
                      onChange={(e) => setForm({ ...form, condicaoPagamentoId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Operação Financeira ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.operacaoFinanceiraId || ""}
                      onChange={(e) => setForm({ ...form, operacaoFinanceiraId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 5"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Moeda ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.moedaId || ""}
                      onChange={(e) => setForm({ ...form, moedaId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Centro de Custo ID</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.centroCustoId || ""}
                      onChange={(e) => setForm({ ...form, centroCustoId: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </>
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
    </div>
  );
}

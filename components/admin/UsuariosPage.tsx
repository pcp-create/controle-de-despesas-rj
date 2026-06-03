"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Plus, Edit2, UserX, UserCheck, Search, CreditCard, KeyRound } from "lucide-react";
import { perfilLabel } from "@/lib/helpers";
import type { User, Cartao } from "@/lib/types";

export default function UsuariosPage() {
  const { users, cartoes, currentUser, addUser, updateUser, toggleUserAtivo, resetSenha, addCartao, updateCartao, removeCartao } = useAppStore();
  const [search, setSearch] = useState("");
  const [modalUser, setModalUser] = useState<User | "new" | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "erp" | "cartoes">("dados");
  const [cartaoModal, setCartaoModal] = useState<{ userId: string; cartao?: Cartao } | null>(null);
  const [resetModal, setResetModal] = useState<User | null>(null);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.nome.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const emptyUser: Omit<User, "id"> = {
    nome: "", email: "", telefone: "", usuario: "", perfil: "tecnico",
    ativo: true, senha: "12345", primeiroAcesso: true,
  };

  const [form, setForm] = useState<Omit<User, "id">>(emptyUser);

  const openNew = () => { setForm(emptyUser); setModalUser("new"); setActiveTab("dados"); };
  const openEdit = (u: User) => { const { id, ...rest } = u; setForm(rest); setModalUser(u); setActiveTab("dados"); };

  const handleSave = () => {
    if (!form.nome.trim() || !form.usuario.trim()) return;
    if (modalUser === "new") addUser(form);
    else if (modalUser) updateUser((modalUser as User).id, form);
    setModalUser(null);
  };

  const gestores = users.filter((u) => u.perfil === "gestor" && u.ativo);
  const editingUserId = modalUser !== "new" && modalUser ? (modalUser as User).id : null;
  const editingCartoes = editingUserId ? cartoes.filter((c) => c.usuarioId === editingUserId) : [];

  const emptyCartao: Omit<Cartao, "id"> = {
    usuarioId: editingUserId ?? "", nome: "", banco: "", bandeira: "", ultimos4: "",
    contaBancariaId: "", padrao: false, ativo: true,
  };
  const [cartaoForm, setCartaoForm] = useState<Omit<Cartao, "id">>(emptyCartao);

  const openNewCartao = () => {
    setCartaoForm({ ...emptyCartao, usuarioId: editingUserId ?? "" });
    setCartaoModal({ userId: editingUserId! });
  };
  const openEditCartao = (c: Cartao) => {
    const { id, ...rest } = c;
    setCartaoForm(rest);
    setCartaoModal({ userId: editingUserId!, cartao: c });
  };
  const saveCartao = () => {
    if (!cartaoForm.nome.trim() || !cartaoForm.ultimos4.trim()) return;
    if (cartaoModal?.cartao) updateCartao(cartaoModal.cartao.id, cartaoForm);
    else addCartao(cartaoForm);
    setCartaoModal(null);
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "text-xs font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-bold text-foreground">Usuários</h1>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition">
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar por nome, usuário ou e-mail..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Nome","Usuário","Perfil","Status","Gestor","Ações"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const gestor = users.find((g) => g.id === u.gestorId);
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{u.nome}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.usuario}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {perfilLabel[u.perfil]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{gestor?.nome ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setResetModal(u)}
                          className="p-1.5 rounded-lg hover:bg-accent/10 text-accent transition"
                          title="Resetar senha">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleUserAtivo(u.id)}
                          className={`p-1.5 rounded-lg transition ${u.ativo ? "hover:bg-destructive/10 text-destructive" : "hover:bg-success/10 text-success"}`}
                          title={u.ativo ? "Inativar" : "Ativar"}>
                          {u.ativo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Usuário */}
      {modalUser !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {modalUser === "new" ? "Novo Usuário" : `Editar: ${(modalUser as User).nome}`}
              </h2>
              <button onClick={() => setModalUser(null)} className="text-muted-foreground hover:text-foreground transition text-xl leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-5">
              {(["dados","erp","cartoes"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === tab ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {tab === "dados" ? "Dados Gerais" : tab === "erp" ? "Dados ERP" : "Cartões"}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto p-5 flex-1">
              {activeTab === "dados" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ["nome","Nome Completo","text",true],
                    ["email","E-mail","email",false],
                    ["telefone","Telefone","text",false],
                    ["usuario","Usuário","text",true],
                  ] as [keyof typeof form, string, string, boolean][]).map(([key, label, type, req]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className={labelClass}>{label}{req && <span className="text-destructive ml-0.5">*</span>}</label>
                      <input type={type} value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Perfil <span className="text-destructive">*</span></label>
                    <select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as User["perfil"] })} className={inputClass}>
                      <option value="tecnico">Técnico</option>
                      <option value="gestor">Gestor</option>
                      <option value="financeiro">Financeiro</option>
                      <option value="administrador">Administrador</option>
                    </select>
                  </div>
                  {form.perfil === "tecnico" && (
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>Gestor Responsável</label>
                      <select value={form.gestorId ?? ""} onChange={(e) => setForm({ ...form, gestorId: e.target.value })} className={inputClass}>
                        <option value="">Selecione...</option>
                        {gestores.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                      </select>
                    </div>
                  )}
                  {modalUser === "new" && (
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>Senha Inicial</label>
                      <input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className={inputClass} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 col-span-full">
                    <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="w-4 h-4 rounded accent-primary" />
                    <label htmlFor="ativo" className="text-sm cursor-pointer">Usuário ativo</label>
                  </div>
                </div>
              )}

              {activeTab === "erp" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {([
                    ["empresaId","Empresa ID",true],
                    ["fornecedorId","Fornecedor ID",true],
                    ["pessoaCompraId","Pessoa Compra ID",false],
                    ["condicaoPagamentoId","Condição Pagamento ID",true],
                    ["operacaoFinanceiraId","Operação Financeira ID",true],
                    ["moedaId","Moeda ID",true],
                    ["especieId","Espécie ID",false],
                    ["contaContabilCreditoId","Conta Contábil Crédito ID",false],
                    ["historicoId","Histórico ID",false],
                    ["contaContabilDespesaId","Conta Contábil Despesa ID",false],
                    ["historicoDespesaId","Histórico Despesa ID",false],
                    ["centroCustoId","Centro de Custo ID",false],
                    ["projetoExecucaoTarefaItemId","Projeto Execução Tarefa Item ID",false],
                    ["contaBancariaId","Conta Bancária ID",false],
                    ["unidadeNegocioId","Unidade Negócio ID",false],
                    ["projetoExecucaoId","Projeto Execução ID",false],
                    ["lancamentoTipoId","Lançamento Tipo ID",false],
                  ] as [keyof typeof form, string, boolean][]).map(([key, label, required]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className={`${labelClass} ${required ? "text-primary font-semibold" : ""}`}>
                        {label}{required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <input type="text" value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className={`${inputClass} ${required ? "border-primary/50" : ""}`} />
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "cartoes" && modalUser !== "new" && (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-end">
                    <button onClick={openNewCartao}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition">
                      <Plus className="w-3.5 h-3.5" />
                      Novo Cartão
                    </button>
                  </div>
                  {editingCartoes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum cartão cadastrado.</p>
                  )}
                  {editingCartoes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/20 transition">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">{c.banco} · {c.bandeira} **** {c.ultimos4}{c.padrao ? " · Padrão" : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </span>
                        <button onClick={() => openEditCartao(c)} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeCartao(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition">
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-border flex gap-3 flex-shrink-0">
              <button onClick={() => setModalUser(null)}
                className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
                Cancelar
              </button>
              {activeTab !== "cartoes" && (
                <button onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition">
                  Salvar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cartao Modal */}
      {cartaoModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground">{cartaoModal.cartao ? "Editar Cartão" : "Novo Cartão"}</h3>
            <div className="grid grid-cols-2 gap-3">
              {([["nome","Nome do Cartão"],["banco","Banco"],["bandeira","Bandeira"],["ultimos4","Últimos 4 dígitos"],["contaBancariaId","Conta Bancária ID"]] as [keyof typeof cartaoForm, string][]).map(([key, label]) => (
                <div key={key} className={`flex flex-col gap-1 ${key === "nome" ? "col-span-2" : ""}`}>
                  <label className={labelClass}>{label}</label>
                  <input type="text" value={(cartaoForm[key] as string) ?? ""} maxLength={key === "ultimos4" ? 4 : undefined}
                    onChange={(e) => setCartaoForm({ ...cartaoForm, [key]: e.target.value })} className={inputClass} />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="padrao" checked={cartaoForm.padrao} onChange={(e) => setCartaoForm({ ...cartaoForm, padrao: e.target.checked })} className="w-4 h-4 rounded accent-primary" />
                <label htmlFor="padrao" className="text-sm cursor-pointer">Cartão padrão</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cativo" checked={cartaoForm.ativo} onChange={(e) => setCartaoForm({ ...cartaoForm, ativo: e.target.checked })} className="w-4 h-4 rounded accent-primary" />
                <label htmlFor="cativo" className="text-sm cursor-pointer">Ativo</label>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCartaoModal(null)} className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">Cancelar</button>
              <button onClick={saveCartao} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Senha Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground">Resetar Senha</h3>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <KeyRound className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground">
                  Você está redefinindo a senha de <strong>{resetModal.nome}</strong>.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  A senha será resetada para <strong className="text-primary">12345</strong> e o usuário será obrigado a criar uma nova senha no próximo login.
                </p>
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Ação irreversível:</strong> Esta ação não pode ser desfeita. O usuário precisará fazer login com a senha padrão.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetModal(null)} className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (currentUser) {
                    resetSenha(resetModal.id, currentUser.id);
                    setResetModal(null);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-warning text-white text-sm font-semibold hover:bg-warning/90 transition">
                Confirmar Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

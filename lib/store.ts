"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  User,
  Cartao,
  TipoDespesa,
  Despesa,
  AuditoriaEntry,
  ERPStatus,
  ApprovalStatus,
} from "./types";
import {
  mockUsers,
  mockCartoes,
  mockTiposDespesa,
  mockDespesas,
  mockAuditoria,
} from "./mock-data";
import { format } from "date-fns";

interface AppState {
  // Auth
  currentUser: User | null;
  login: (usuario: string, senha: string) => { ok: boolean; msg: string };
  logout: () => void;
  alterarSenha: (
    userId: string,
    senhaAtual: string,
    novaSenha: string
  ) => { ok: boolean; msg: string };

  // Reset senha (admin only)
  resetSenha: (userId: string, adminId: string) => { ok: boolean; msg: string };

  // Data
  users: User[];
  cartoes: Cartao[];
  tiposDespesa: TipoDespesa[];
  despesas: Despesa[];
  auditoria: AuditoriaEntry[];

  // Users CRUD
  addUser: (user: Omit<User, "id">) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  toggleUserAtivo: (id: string) => void;

  // Cartoes CRUD
  addCartao: (cartao: Omit<Cartao, "id">) => void;
  updateCartao: (id: string, data: Partial<Cartao>) => void;
  removeCartao: (id: string) => void;

  // Tipos Despesa CRUD
  addTipoDespesa: (tipo: Omit<TipoDespesa, "id">) => void;
  updateTipoDespesa: (id: string, data: Partial<TipoDespesa>) => void;

  // Despesas
  addDespesa: (despesa: Omit<Despesa, "id" | "dataCriacao" | "dataAtualizacao">) => string;
  updateDespesa: (id: string, data: Partial<Despesa>) => void;
  enviarDespesa: (id: string) => { ok: boolean; msg: string };
  updateDespesaStatus: (
    id: string,
    statusAprovacao: ApprovalStatus,
    statusERP: ERPStatus,
    extras?: Partial<Despesa>
  ) => void;

  // Auditoria
  addAuditoria: (entry: Omit<AuditoriaEntry, "id">) => void;
}

let idCounter = 1000;
const genId = () => `gen_${++idCounter}`;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: mockUsers,
      cartoes: mockCartoes,
      tiposDespesa: mockTiposDespesa,
      despesas: mockDespesas,
      auditoria: mockAuditoria,

      login: (usuario, senha) => {
        const user = get().users.find(
          (u) => u.usuario.toLowerCase() === usuario.toLowerCase() && u.senha === senha
        );
        if (!user) return { ok: false, msg: "Usuário ou senha inválidos." };
        if (!user.ativo) return { ok: false, msg: "Usuário inativo. Contate o administrador." };
        set({ currentUser: user });
        return { ok: true, msg: "" };
      },

      logout: () => set({ currentUser: null }),

      alterarSenha: (userId, senhaAtual, novaSenha) => {
        const users = get().users;
        const user = users.find((u) => u.id === userId);
        if (!user) return { ok: false, msg: "Usuário não encontrado." };
        if (user.senha !== senhaAtual) return { ok: false, msg: "Senha atual incorreta." };
        set({
          users: users.map((u) =>
            u.id === userId ? { ...u, senha: novaSenha, primeiroAcesso: false } : u
          ),
          currentUser:
            get().currentUser?.id === userId
              ? { ...get().currentUser!, senha: novaSenha, primeiroAcesso: false }
              : get().currentUser,
        });
        get().addAuditoria({
          usuarioId: userId,
          acao: "Senha alterada",
          data: new Date().toISOString(),
        });
        return { ok: true, msg: "Senha alterada com sucesso." };
      },

      resetSenha: (userId, adminId) => {
        const users = get().users;
        const user = users.find((u) => u.id === userId);
        if (!user) return { ok: false, msg: "Usuário não encontrado." };
        set({
          users: users.map((u) =>
            u.id === userId ? { ...u, senha: "12345", primeiroAcesso: true } : u
          ),
        });
        get().addAuditoria({
          usuarioId: adminId,
          acao: "Senha resetada",
          entidade: "Usuário",
          entidadeId: userId,
          detalhes: `Senha do usuário ${user.nome} foi resetada para 12345 com obrigação de trocar no primeiro acesso.`,
          data: new Date().toISOString(),
        });
        return { ok: true, msg: "Senha resetada com sucesso." };
      },

      addUser: (user) => {
        set({ users: [...get().users, { ...user, id: genId() }] });
      },

      updateUser: (id, data) => {
        set({ users: get().users.map((u) => (u.id === id ? { ...u, ...data } : u)) });
        if (get().currentUser?.id === id) {
          set({ currentUser: { ...get().currentUser!, ...data } });
        }
      },

      toggleUserAtivo: (id) => {
        set({
          users: get().users.map((u) =>
            u.id === id ? { ...u, ativo: !u.ativo } : u
          ),
        });
      },

      addCartao: (cartao) => {
        set({ cartoes: [...get().cartoes, { ...cartao, id: genId() }] });
      },

      updateCartao: (id, data) => {
        set({ cartoes: get().cartoes.map((c) => (c.id === id ? { ...c, ...data } : c)) });
      },

      removeCartao: (id) => {
        set({ cartoes: get().cartoes.filter((c) => c.id !== id) });
      },

      addTipoDespesa: (tipo) => {
        set({ tiposDespesa: [...get().tiposDespesa, { ...tipo, id: genId() }] });
      },

      updateTipoDespesa: (id, data) => {
        set({
          tiposDespesa: get().tiposDespesa.map((t) =>
            t.id === id ? { ...t, ...data } : t
          ),
        });
      },

      addDespesa: (despesa) => {
        const now = new Date().toISOString();
        const newId = genId();
        const newDespesa: Despesa = {
          ...despesa,
          id: newId,
          dataCriacao: now,
          dataAtualizacao: now,
        };
        set({ despesas: [...get().despesas, newDespesa] });
        get().addAuditoria({
          usuarioId: despesa.tecnicoId,
          acao: "Despesa criada",
          entidade: "Despesa",
          entidadeId: newId,
          detalhes: `Despesa ${despesa.numeroOS} criada como rascunho.`,
          data: now,
        });
        return newId;
      },

      updateDespesa: (id, data) => {
        const now = new Date().toISOString();
        const despesa = get().despesas.find((d) => d.id === id);
        if (!despesa || despesa.statusERP !== "Rascunho") return;
        set({
          despesas: get().despesas.map((d) =>
            d.id === id ? { ...d, ...data, dataAtualizacao: now } : d
          ),
        });
        get().addAuditoria({
          usuarioId: despesa.tecnicoId,
          acao: "Despesa editada",
          entidade: "Despesa",
          entidadeId: id,
          detalhes: `Despesa ${despesa.numeroOS} foi editada.`,
          data: now,
        });
      },

      enviarDespesa: (id) => {
        const now = new Date().toISOString();
        const despesa = get().despesas.find((d) => d.id === id);
        if (!despesa) return { ok: false, msg: "Despesa não encontrada." };
        if (despesa.statusERP !== "Rascunho") return { ok: false, msg: "Despesa já foi enviada." };

        const tipo = get().tiposDespesa.find((t) => t.id === despesa.tipoDespesaId);
        const dentroDoLimite = tipo?.limiteMaximo !== undefined && despesa.valor <= tipo.limiteMaximo;

        // Se dentro do limite, pula aprovação do gestor
        const newStatusAprovacao: ApprovalStatus = dentroDoLimite ? "AprovadoGestor" : "AguardandoGestor";
        const newStatusERP: ERPStatus = dentroDoLimite ? "AprovadoGestorERPAtualizado" : "EnviadoAguardandoGestor";

        const erpPayload = {
          id: despesa.id,
          cliente: despesa.cliente,
          os: despesa.numeroOS,
          tipo: tipo?.nome,
          valor: despesa.valor,
          documento: despesa.documento,
          observacao: despesa.observacao,
          statusAprovacao: newStatusAprovacao,
          status: dentroDoLimite ? "Aprovado" : "Pendente",
          dataEnvio: now,
        };

        set({
          despesas: get().despesas.map((d) =>
            d.id === id
              ? {
                  ...d,
                  statusAprovacao: newStatusAprovacao,
                  statusERP: newStatusERP,
                  erpId: `ERP-${Date.now()}`,
                  erpPayload: JSON.stringify(erpPayload),
                  erpResposta: JSON.stringify({ success: true, id: `ERP-${Date.now()}`, message: "Enviado com sucesso" }),
                  dataAtualizacao: now,
                  ...(dentroDoLimite ? { dataAprovacao: now, gestorAprovadorId: "sistema" } : {}),
                }
              : d
          ),
        });

        get().addAuditoria({
          usuarioId: despesa.tecnicoId,
          acao: dentroDoLimite ? "Despesa enviada (aprovação automática)" : "Despesa enviada para aprovação",
          entidade: "Despesa",
          entidadeId: id,
          detalhes: dentroDoLimite
            ? `Despesa ${despesa.numeroOS} no valor de R$ ${despesa.valor.toFixed(2)} foi enviada e aprovada automaticamente (dentro do limite de R$ ${tipo?.limiteMaximo?.toFixed(2)}).`
            : `Despesa ${despesa.numeroOS} no valor de R$ ${despesa.valor.toFixed(2)} foi enviada e aguarda aprovação do gestor.`,
          data: now,
        });

        return { ok: true, msg: dentroDoLimite ? "Despesa enviada e aprovada automaticamente!" : "Despesa enviada para aprovação do gestor." };
      },

      updateDespesaStatus: (id, statusAprovacao, statusERP, extras) => {
        const now = new Date().toISOString();
        set({
          despesas: get().despesas.map((d) =>
            d.id === id
              ? { ...d, statusAprovacao, statusERP, dataAtualizacao: now, ...extras }
              : d
          ),
        });
      },

      addAuditoria: (entry) => {
        set({
          auditoria: [{ ...entry, id: genId() }, ...get().auditoria],
        });
      },
    }),
    {
      name: "rj-compressores-store",
      partialize: (state) => ({
        currentUser: state.currentUser,
        users: state.users,
        cartoes: state.cartoes,
        tiposDespesa: state.tiposDespesa,
        despesas: state.despesas,
        auditoria: state.auditoria,
      }),
    }
  )
);

"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";

const supabase = createClient();

// Types
export interface TipoDespesa {
  id: string;
  nome: string;
  descricao: string | null;
  limite_maximo: number | null;
  exige_comprovante: boolean;
  documento_padrao: string | null;
  ativo: boolean;
}

export interface Cartao {
  id: string;
  user_id: string;
  banco: string;
  bandeira: string;
  ultimos_digitos: string;
  apelido: string | null;
  is_padrao: boolean;
  ativo: boolean;
}

export interface Despesa {
  id: string;
  tecnico_id: string;
  tipo_despesa_id: string;
  cartao_id: string | null;
  cliente: string;
  numero_os: string;
  valor: number;
  documento: string | null;
  observacao: string | null;
  comprovante_nome: string | null;
  comprovante_url: string | null;
  data_despesa: string;
  status_aprovacao: "AguardandoGestor" | "AprovadoGestor" | "Reprovado";
  status_erp: "Rascunho" | "EnviadoAguardandoGestor" | "AprovadoGestorERPAtualizado" | "ErroEnvioERP" | "ErroAtualizarERP";
  gestor_aprovador_id: string | null;
  justificativa_reprovacao: string | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  erp_id: string | null;
  erp_payload: Record<string, unknown> | null;
  erp_resposta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Joins
  tipo_despesa?: TipoDespesa;
  cartao?: Cartao;
  tecnico?: { id: string; nome: string; email: string };
}

export interface Profile {
  id: string;
  nome: string;
  email: string;
  usuario: string;
  perfil: "tecnico" | "gestor" | "financeiro" | "administrador";
  ativo: boolean;
  gestor_id: string | null;
  primeiro_acesso: boolean;
}

// Fetchers
const fetchTiposDespesa = async (): Promise<TipoDespesa[]> => {
  const { data, error } = await supabase
    .from("tipos_despesa")
    .select("*")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data || [];
};

const fetchCartoes = async (userId: string): Promise<Cartao[]> => {
  const { data, error } = await supabase
    .from("cartoes")
    .select("*")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("is_padrao", { ascending: false });
  if (error) throw error;
  return data || [];
};

const fetchDespesas = async (userId: string, perfil: string): Promise<Despesa[]> => {
  let query = supabase
    .from("despesas")
    .select(`
      *,
      tipo_despesa:tipos_despesa(*),
      cartao:cartoes(*),
      tecnico:profiles!despesas_tecnico_id_fkey(id, nome, email)
    `)
    .order("created_at", { ascending: false });

  // Filtrar por perfil
  if (perfil === "tecnico") {
    query = query.eq("tecnico_id", userId);
  }
  // Gestores, financeiros e admins veem tudo (RLS cuida da permissão)

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const fetchProfiles = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("nome");
  if (error) throw error;
  return data || [];
};

// Hooks
export function useTiposDespesa() {
  const { data, error, isLoading, mutate } = useSWR("tipos_despesa", fetchTiposDespesa, {
    revalidateOnFocus: false,
  });

  return {
    tiposDespesa: data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useCartoes() {
  const { profile } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(
    profile ? `cartoes-${profile.id}` : null,
    () => fetchCartoes(profile!.id),
    { revalidateOnFocus: false }
  );

  const addCartao = async (cartao: Omit<Cartao, "id" | "user_id" | "ativo">) => {
    if (!profile) return { error: "Não autenticado" };

    const { data, error } = await supabase
      .from("cartoes")
      .insert({ ...cartao, user_id: profile.id })
      .select()
      .single();

    if (error) return { error: error.message };
    mutate();
    return { data };
  };

  const updateCartao = async (id: string, updates: Partial<Cartao>) => {
    const { error } = await supabase
      .from("cartoes")
      .update(updates)
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const deleteCartao = async (id: string) => {
    const { error } = await supabase
      .from("cartoes")
      .update({ ativo: false })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    cartoes: data || [],
    isLoading,
    error,
    mutate,
    addCartao,
    updateCartao,
    deleteCartao,
  };
}

export function useDespesas() {
  const { profile } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(
    profile ? `despesas-${profile.id}-${profile.perfil}` : null,
    () => fetchDespesas(profile!.id, profile!.perfil),
    { revalidateOnFocus: false }
  );

  const addDespesa = async (despesa: Omit<Despesa, "id" | "tecnico_id" | "created_at" | "updated_at" | "tipo_despesa" | "cartao" | "tecnico">) => {
    if (!profile) return { error: "Não autenticado" };

    const { data, error } = await supabase
      .from("despesas")
      .insert({ ...despesa, tecnico_id: profile.id })
      .select()
      .single();

    if (error) return { error: error.message };
    mutate();
    return { data };
  };

  const updateDespesa = async (id: string, updates: Partial<Despesa>) => {
    const { error } = await supabase
      .from("despesas")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const deleteDespesa = async (id: string) => {
    const { error } = await supabase
      .from("despesas")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const enviarDespesa = async (id: string) => {
    // Simulação de envio ao ERP
    const erpPayload = { despesa_id: id, timestamp: new Date().toISOString() };
    const erpResposta = { success: true, erp_id: `ERP-${Date.now()}`, message: "Enviado com sucesso" };

    const { error } = await supabase
      .from("despesas")
      .update({
        status_erp: "EnviadoAguardandoGestor",
        erp_id: erpResposta.erp_id,
        erp_payload: erpPayload,
        erp_resposta: erpResposta,
        data_envio: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { ok: false, msg: error.message };
    mutate();
    return { ok: true, msg: "Despesa enviada com sucesso!" };
  };

  const aprovarDespesa = async (id: string) => {
    if (!profile) return { error: "Não autenticado" };

    const { error } = await supabase
      .from("despesas")
      .update({
        status_aprovacao: "AprovadoGestor",
        status_erp: "AprovadoGestorERPAtualizado",
        gestor_aprovador_id: profile.id,
        data_aprovacao: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const reprovarDespesa = async (id: string, justificativa: string) => {
    if (!profile) return { error: "Não autenticado" };

    const { error } = await supabase
      .from("despesas")
      .update({
        status_aprovacao: "Reprovado",
        gestor_aprovador_id: profile.id,
        justificativa_reprovacao: justificativa,
        data_aprovacao: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    despesas: data || [],
    isLoading,
    error,
    mutate,
    addDespesa,
    updateDespesa,
    deleteDespesa,
    enviarDespesa,
    aprovarDespesa,
    reprovarDespesa,
  };
}

export function useProfiles() {
  const { data, error, isLoading, mutate } = useSWR("profiles", fetchProfiles, {
    revalidateOnFocus: false,
  });

  const addProfile = async (profileData: Omit<Profile, "id" | "primeiro_acesso">, password: string) => {
    // Criar usuário no Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: profileData.email,
      password,
      email_confirm: true,
      user_metadata: {
        nome: profileData.nome,
        usuario: profileData.usuario,
        perfil: profileData.perfil,
      },
    });

    if (authError) return { error: authError.message };
    mutate();
    return { data: authData };
  };

  const updateProfile = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const toggleProfileStatus = async (id: string, ativo: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ ativo, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    profiles: data || [],
    isLoading,
    error,
    mutate,
    addProfile,
    updateProfile,
    toggleProfileStatus,
  };
}

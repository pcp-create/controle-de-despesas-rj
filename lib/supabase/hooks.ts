"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { registrarAuditoria } from "@/lib/supabase/audit";

// Helper to get supabase client - MUST be called inside functions, not at module level
const getSupabase = () => createClient();

// Types
export interface TipoDespesa {
  id: string;
  nome: string;
  descricao: string | null;
  limite_maximo: number | null;
  limite_ocorrencias_diarias: number | null;
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
  empresa_id: number | null;
  fornecedor_id: number | null;
  condicao_pagamento_id: number | null;
  operacao_financeira_id: number | null;
  moeda_id: number | null;
  centro_custo_id: number | null;
  created_at: string;
  updated_at: string;
}

// Fetchers
const fetchTiposDespesa = async (): Promise<TipoDespesa[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("tipos_despesa")
    .select("*")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data || [];
};

const fetchCartoes = async (userId: string): Promise<Cartao[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("cartoes")
    .select("*")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("is_padrao", { ascending: false });
  if (error) throw error;
  return data || [];
};

const fetchDespesas = async (userId?: string, perfil?: string): Promise<Despesa[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  
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
  if (perfil === "tecnico" && userId) {
    query = query.eq("tecnico_id", userId);
  }
  // Gestores, financeiros e admins veem tudo (RLS cuida da permissão)

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const fetchProfiles = async (): Promise<Profile[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  
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
    const supabase = getSupabase();
    if (!profile) return { error: "Não autenticado" };
    if (!supabase) return { error: "Supabase não disponível" };

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
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
    const { error } = await supabase
      .from("cartoes")
      .update(updates)
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const deleteCartao = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
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

export function useDespesas(userId?: string, perfil?: string) {
  const { data, error, isLoading, mutate } = useSWR(
    `despesas_${userId || "all"}_${perfil || ""}`,
    userId ? () => fetchDespesas(userId, perfil || "tecnico") : () => fetchDespesas("", perfil || "gestor"),
    { revalidateOnFocus: false }
  );

  const addDespesa = async (despesa: Omit<Despesa, "id" | "tecnico_id" | "created_at" | "updated_at" | "tipo_despesa" | "cartao" | "tecnico">) => {
    if (!userId) return { error: "Não autenticado" };
    
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { data, error } = await supabase
      .from("despesas")
      .insert({ ...despesa, tecnico_id: userId })
      .select()
      .single();

    if (error) return { error: error.message };
    
    // Registrar auditoria
    if (data?.id) {
      await registrarAuditoria({
        acao: "CREATE",
        entidade: "despesa",
        entidadeId: data.id,
        usuarioId: userId,
        detalhes: `Criada despesa de R$ ${despesa.valor.toFixed(2)} para ${despesa.cliente}`,
      });
    }
    
    mutate();
    return { data };
  };

  const updateDespesa = async (id: string, updates: Partial<Despesa>) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
    const { error } = await supabase
      .from("despesas")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    
    // Registrar auditoria
    await registrarAuditoria({
      acao: "UPDATE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: userId || "sistema",
      detalhes: `Atualizada despesa. Status: ${updates.status_aprovacao || "N/A"}`,
    });
    
    mutate();
    return { error: null };
  };

  const deleteDespesa = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
    const { error } = await supabase
      .from("despesas")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };
    
    // Registrar auditoria
    await registrarAuditoria({
      acao: "DELETE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: userId || "sistema",
      detalhes: "Despesa deletada",
    });
    
    mutate();
    return { error: null };
  };

  const enviarDespesa = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, msg: "Supabase não disponível" };

    // Buscar despesa + tipo para verificar limites
    const { data: despesaData } = await supabase
      .from("despesas")
      .select("*, tipo_despesa:tipos_despesa(*)")
      .eq("id", id)
      .single();

    const tipoDespesa = despesaData?.tipo_despesa as TipoDespesa | null;
    const valor = Number(despesaData?.valor ?? 0);
    const limite = tipoDespesa?.limite_maximo;
    const dentroDoValorLimite = limite !== null && limite !== undefined && valor <= limite;

    // Verificar limite de ocorrências diárias
    let dentroDoLimiteDiario = true;
    if (dentroDoValorLimite && tipoDespesa?.limite_ocorrencias_diarias) {
      const dataDespesa = despesaData?.data_despesa as string;
      const inicioDia = dataDespesa.split("T")[0] + "T00:00:00.000Z";
      const fimDia    = dataDespesa.split("T")[0] + "T23:59:59.999Z";

      const { count } = await supabase
        .from("despesas")
        .select("id", { count: "exact", head: true })
        .eq("tecnico_id", despesaData?.tecnico_id)
        .eq("tipo_despesa_id", despesaData?.tipo_despesa_id)
        .eq("status_aprovacao", "AprovadoGestor")
        .gte("data_despesa", inicioDia)
        .lte("data_despesa", fimDia)
        .neq("id", id); // excluir a própria despesa

      const ocorrenciasHoje = count ?? 0;
      dentroDoLimiteDiario = ocorrenciasHoje < tipoDespesa.limite_ocorrencias_diarias;
    }

    const aprovacaoAutomatica = dentroDoValorLimite && dentroDoLimiteDiario;

    const erpPayload = { despesa_id: id, timestamp: new Date().toISOString() };
    const erpResposta = { success: true, erp_id: `ERP-${Date.now()}`, message: "Enviado com sucesso" };
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      status_erp: aprovacaoAutomatica ? "AprovadoGestorERPAtualizado" : "EnviadoAguardandoGestor",
      status_aprovacao: aprovacaoAutomatica ? "AprovadoGestor" : "AguardandoGestor",
      erp_id: erpResposta.erp_id,
      erp_payload: erpPayload,
      erp_resposta: erpResposta,
      data_envio: now,
      updated_at: now,
    };

    if (aprovacaoAutomatica) {
      updateData.data_aprovacao = now;
      updateData.gestor_aprovador_id = null;
    }

    const { error } = await supabase
      .from("despesas")
      .update(updateData)
      .eq("id", id);

    if (error) return { ok: false, msg: error.message };
    mutate();

    if (aprovacaoAutomatica) {
      return { ok: true, msg: "Despesa enviada e aprovada automaticamente (dentro do limite)!" };
    }
    if (dentroDoValorLimite && !dentroDoLimiteDiario) {
      return { ok: true, msg: "Despesa enviada para aprovação — limite diário de ocorrências atingido." };
    }
    return { ok: true, msg: "Despesa enviada com sucesso!" };
  };

  const aprovarDespesa = async (id: string) => {
    const supabase = getSupabase();
    if (!profile) return { error: "Não autenticado" };
    if (!supabase) return { error: "Supabase não disponível" };

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
    const supabase = getSupabase();
    if (!profile) return { error: "Não autenticado" };
    if (!supabase) return { error: "Supabase não disponível" };

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
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
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
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
    const { error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const toggleProfileStatus = async (id: string, ativo: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    
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

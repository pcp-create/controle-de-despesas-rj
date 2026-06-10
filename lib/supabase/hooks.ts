"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { registrarAuditoria } from "@/lib/supabase/audit";
import { useAuth } from "@/lib/supabase/auth-context";

// Helper to get supabase client - MUST be called inside functions, not at module level
const getSupabase = () => createClient();

// Types
export interface TipoDespesa {
  id: string;
  nome: string;
  descricao: string | null;
  limite_maximo: number | null;
  limite_ocorrencias_diarias: number | null;
  calcula_diarias: boolean;
  exige_comprovante: boolean;
  documento_padrao: string | null;
  centro_custo_erp_id: string | null;
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
  data_checkin: string | null;
  data_checkout: string | null;
  numero_diarias: number | null;
  status_aprovacao: "AguardandoGestor" | "AprovadoGestor" | "Reprovado";
  status_erp: "Rascunho" | "EnviadoAguardandoGestor" | "AprovadoGestorERPAtualizado" | "ErroEnvioERP" | "ErroAtualizarERP";
  gestor_aprovador_id: string | null;
  justificativa_reprovacao: string | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  erp_id: string | null;
  erp_payload: Record<string, unknown> | null;
  erp_resposta: Record<string, unknown> | null;
  frota_id: string | null;
  km_atual: number | null;
  created_at: string;
  updated_at: string;
  // Joins
  tipo_despesa?: TipoDespesa;
  frota?: Frota;
  cartao?: Cartao;
  tecnico?: { id: string; nome: string; email: string };
}

export interface Frota {
  id: string;
  placa: string;
  modelo: string;
  marca: string;
  ano: number | null;
  cor: string | null;
  tipo: string | null;
  quilometragem: number;
  observacao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  nome: string;
  email: string;
  usuario: string;
  perfil: "funcionario" | "gestor" | "financeiro" | "administrador";
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
  if (perfil === "funcionario" && userId) {
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

export function useCartoes(userId?: string) {
  const { profile } = useAuth();
  const effectiveId = userId || profile?.id;
  const { data, error, isLoading, mutate } = useSWR(
    effectiveId ? `cartoes-${effectiveId}` : null,
    () => fetchCartoes(effectiveId!),
    { revalidateOnFocus: false }
  );

  const addCartao = async (cartao: Omit<Cartao, "id" | "user_id" | "ativo">) => {
    const supabase = getSupabase();
    if (!effectiveId) return { error: "Não autenticado" };
    if (!supabase) return { error: "Supabase não disponível" };

    const { data, error } = await supabase
      .from("cartoes")
      .insert({ ...cartao, user_id: effectiveId })
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
  const { profile } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(
    `despesas_${userId || "all"}_${perfil || ""}`,
    userId ? () => fetchDespesas(userId, perfil || "funcionario") : () => fetchDespesas("", perfil || "gestor"),
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

    // --- Lógica de diárias (ex: Hotel) ---
    // Se o tipo calcula por diária, compara (valor / diárias) com o limite
    let valorParaComparacao = valor;
    if (tipoDespesa?.calcula_diarias && despesaData?.numero_diarias && despesaData.numero_diarias > 0) {
      valorParaComparacao = valor / despesaData.numero_diarias;
    }

    const dentroDoValorLimite = limite !== null && limite !== undefined && valorParaComparacao <= limite;

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
        .neq("id", id);

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
      if (tipoDespesa?.calcula_diarias && despesaData?.numero_diarias) {
        return { ok: true, msg: `Despesa aprovada automaticamente — ${despesaData.numero_diarias} diária(s) dentro do limite!` };
      }
      return { ok: true, msg: "Despesa enviada e aprovada automaticamente (dentro do limite)!" };
    }
    if (dentroDoValorLimite && !dentroDoLimiteDiario) {
      return { ok: true, msg: "Despesa enviada para aprovação — limite diário de ocorrências atingido." };
    }
    if (tipoDespesa?.calcula_diarias && !dentroDoValorLimite) {
      return { ok: true, msg: "Despesa enviada para aprovação — valor por diária acima do limite." };
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

const fetchFrotas = async (): Promise<Frota[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("frotas")
    .select("*")
    .order("placa");
  if (error) throw error;
  return data || [];
};

export function useFrotas() {
  const { data, error, isLoading, mutate } = useSWR("frotas", fetchFrotas, {
    revalidateOnFocus: false,
  });

  const addFrota = async (frota: Omit<Frota, "id" | "created_at" | "updated_at">) => {
    const res = await fetch("/api/frotas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frota),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || "Erro ao cadastrar veículo" };
    mutate();
    return { data: json.data };
  };

  const updateFrota = async (id: string, updates: Partial<Frota>) => {
    const res = await fetch("/api/frotas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || "Erro ao atualizar veículo" };
    mutate();
    return { error: null };
  };

  const deleteFrota = async (id: string) => {
    const res = await fetch("/api/frotas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ativo: false }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error || "Erro ao remover veículo" };
    mutate();
    return { error: null };
  };

  return {
    frotas: data || [],
    isLoading,
    error,
    mutate,
    addFrota,
    updateFrota,
    deleteFrota,
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

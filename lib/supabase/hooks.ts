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
  codigo_produto_erp: string | null;
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
  litros_abastecidos: number | null;
  valor_litro: number | null;
  tipo_combustivel: string | null;
  frota?: { id: string; placa: string; modelo: string; km_media_litro: number | null } | null;
  // Parcelamento
  parcelado: boolean;
  numero_parcelas: number;
  parcela_atual: number;
  grupo_parcela_id: string | null;
  data_vencimento: string | null;
  // Pagamento
  pagamento_tipo: "cartao" | "dinheiro" | "faturado" | "boleto";
  reembolso_processado: boolean;
  reembolso_processado_em: string | null;
  reembolso_processado_por: string | null;
  aprovado_financeiro: boolean;
  aprovado_financeiro_em: string | null;
  aprovado_financeiro_por: string | null;
  // Lançamento no sistema interno
  lancado_sistema: boolean;
  lancado_sistema_em: string | null;
  lancado_sistema_por: string | null;
  // Lançamento ERP M8
  lancado_erp: boolean;
  lancado_erp_em: string | null;
  lancado_erp_por: string | null;
  // Status integração ERP: pendente | processando | integrado | erro
  erp_status: string;
  erp_etapa_erro: number | null;
  erp_erro: string | null;
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
  km_atualizado_em: string | null;
  km_media_litro: number | null;
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
  frota_padrao_id: string | null;
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
      tecnico:profiles!despesas_tecnico_id_fkey(id, nome, email),
      frota:frotas(id, placa, modelo, km_media_litro)
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

// ─── Interface e Hook de Áreas / Setores ─────────────────────────────────────
export interface Area {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export function useAreas() {
  const { data, error, isLoading, mutate } = useSWR(
    "areas",
    async () => {
      const supabase = getSupabase();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .eq("ativo", true)
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data || []) as Area[];
    },
    { revalidateOnFocus: false }
  );

  const addArea = async (nome: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    const maxOrdem = (data as Area[] || []).reduce((m, a) => Math.max(m, a.ordem), 0);
    const { error } = await supabase
      .from("areas")
      .insert({ nome: nome.trim(), ordem: maxOrdem + 1 });
    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const updateArea = async (id: string, nome: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    const { error } = await supabase
      .from("areas")
      .update({ nome: nome.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const deleteArea = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    // Soft delete — mantém integridade com profiles que já usam a área
    const { error } = await supabase
      .from("areas")
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    areas: (data || []) as Area[],
    isLoading,
    error,
    mutate,
    addArea,
    updateArea,
    deleteArea,
  };
}

// Hooks
// Interface para Centro de Custo por área
export interface TipoDespesaCentroCusto {
  id: string;
  tipo_despesa_id: string;
  area: string;
  centro_custo_erp: string;
  created_at: string;
  updated_at: string;
}

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

export function useTipoDespesaCentroCusto(tipoDespesaId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    tipoDespesaId ? `tipos_despesa_centro_custo-${tipoDespesaId}` : null,
    async () => {
      const supabase = getSupabase();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("tipos_despesa_centro_custo")
        .select("*")
        .eq("tipo_despesa_id", tipoDespesaId!)
        .order("area");
      if (error) throw error;
      return (data || []) as TipoDespesaCentroCusto[];
    },
    { revalidateOnFocus: false }
  );

  const upsertCentroCusto = async (area: string, centro_custo_erp: string) => {
    const supabase = getSupabase();
    if (!supabase || !tipoDespesaId) return { error: "Dados insuficientes" };

    // Verifica se já existe registro para esse tipo+área
    const { data: existing } = await supabase
      .from("tipos_despesa_centro_custo")
      .select("id")
      .eq("tipo_despesa_id", tipoDespesaId)
      .eq("area", area)
      .maybeSingle();

    let error;

    if (existing?.id) {
      const res = await supabase
        .from("tipos_despesa_centro_custo")
        .update({ centro_custo_erp, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      error = res.error;
    } else {
      const res = await supabase
        .from("tipos_despesa_centro_custo")
        .insert({ tipo_despesa_id: tipoDespesaId, area, centro_custo_erp });
      error = res.error;
    }

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const deleteCentroCusto = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("tipos_despesa_centro_custo")
      .delete()
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    centrosCusto: data || [],
    isLoading,
    error,
    mutate,
    upsertCentroCusto,
    deleteCentroCusto,
  };
}

export function useCartoes(userId?: string) {
  const { profile } = useAuth();
  const effectiveId = userId || profile?.id;
  // Só busca quando a sessão está confirmada
  const swrKey = profile?.id && effectiveId ? `cartoes-${effectiveId}` : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
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
  // Só busca quando a sessão está confirmada (profile preenchido pelo AuthContext)
  // Isso evita a race condition onde o SWR busca antes do cookie de sessão ser gravado
  const sessionReady = !!profile?.id;
  const effectiveUserId = userId || profile?.id;
  const swrKey = sessionReady ? `despesas_${effectiveUserId || "all"}_${perfil || profile?.perfil || ""}` : null;

  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    effectiveUserId ? () => fetchDespesas(effectiveUserId, perfil || profile?.perfil || "funcionario") : () => fetchDespesas("", perfil || profile?.perfil || "gestor"),
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

  const updateDespesaDocumento = async (id: string, documento: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    const { error } = await supabase
      .from("despesas")
      .update({ documento, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  const updateDespesaVencimento = async (id: string, data_vencimento: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    // 1. Atualiza a parcela editada
    const { error } = await supabase
      .from("despesas")
      .update({ data_vencimento, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { error: error.message };

    // 2. Busca dados da parcela para verificar se pertence a um grupo
    const { data: parcela } = await supabase
      .from("despesas")
      .select("grupo_parcela_id, parcela_atual, numero_parcelas")
      .eq("id", id)
      .single();

    // 3. Se for parcelada, propaga o vencimento para as parcelas POSTERIORES
    //    adicionando +1 mês a partir da data escolhida para cada parcela seguinte
    if (parcela?.grupo_parcela_id && parcela.numero_parcelas > 1) {
      const { data: posteriores } = await supabase
        .from("despesas")
        .select("id, parcela_atual")
        .eq("grupo_parcela_id", parcela.grupo_parcela_id)
        .gt("parcela_atual", parcela.parcela_atual)
        .order("parcela_atual", { ascending: true });

      if (posteriores && posteriores.length > 0) {
        const baseDate = new Date(data_vencimento + "T12:00:00");

        for (const p of posteriores) {
          const offset = p.parcela_atual - parcela.parcela_atual;
          const novaData = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, baseDate.getDate());
          const novaDataStr = novaData.toISOString().slice(0, 10);

          await supabase
            .from("despesas")
            .update({ data_vencimento: novaDataStr, updated_at: new Date().toISOString() })
            .eq("id", p.id);
        }
      }
    }

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

  const aprovarFinanceiro = async (id: string, aprovadoPor: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        aprovado_financeiro: true,
        aprovado_financeiro_em: new Date().toISOString(),
        aprovado_financeiro_por: aprovadoPor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await registrarAuditoria({
      acao: "UPDATE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: aprovadoPor,
      detalhes: "Reembolso aprovado pelo financeiro",
    });

    mutate();
    return { error: null };
  };

  const processarReembolso = async (id: string, processadoPor: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        reembolso_processado: true,
        reembolso_processado_em: new Date().toISOString(),
        reembolso_processado_por: processadoPor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await registrarAuditoria({
      acao: "UPDATE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: processadoPor,
      detalhes: "Reembolso processado pelo financeiro",
    });

    mutate();
    return { error: null };
  };

  const estornarReembolso = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        reembolso_processado: false,
        reembolso_processado_em: null,
        reembolso_processado_por: null,
        aprovado_financeiro: false,
        aprovado_financeiro_em: null,
        aprovado_financeiro_por: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  // Apenas lançamento no sistema interno (sem chamar API M8)
  const lancarSistema = async (id: string, lancadoPor: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        lancado_sistema: true,
        lancado_sistema_em: new Date().toISOString(),
        lancado_sistema_por: lancadoPor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await registrarAuditoria({
      acao: "UPDATE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: lancadoPor,
      detalhes: "Despesa lançada no sistema",
    });

    mutate();
    return { error: null };
  };

  // Lançamento legado (mantido para compatibilidade) — marca lancado_erp = true localmente
  const lancarERP = async (id: string, lancadoPor: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        lancado_erp: true,
        lancado_erp_em: new Date().toISOString(),
        lancado_erp_por: lancadoPor,
        lancado_sistema: true,
        lancado_sistema_em: new Date().toISOString(),
        lancado_sistema_por: lancadoPor,
        erp_status: "integrado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await registrarAuditoria({
      acao: "UPDATE",
      entidade: "despesa",
      entidadeId: id,
      usuarioId: lancadoPor,
      detalhes: "Despesa marcada como lançada no ERP (M8)",
    });

    mutate();
    return { error: null };
  };

  // Envia para integração real com o ERP M8 via API route
  const tentarNovamenteERP = async (id: string, userId: string) => {
    const res = await fetch("/api/integrar-erp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ despesaId: id, userId }),
    });
    const body = await res.json();
    mutate();
    if (!res.ok) return { error: body.error || `HTTP ${res.status}`, etapa: body.etapa ?? null, campos: (body.campos as string[]) ?? null };
    return { error: null, erp_id: body.erp_id, simulado: body.simulado ?? false, campos: null };
  };

  const estornarLancamento = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("despesas")
      .update({
        lancado_erp: false,
        lancado_erp_em: null,
        lancado_erp_por: null,
        lancado_sistema: false,
        lancado_sistema_em: null,
        lancado_sistema_por: null,
        erp_status: "pendente",
        erp_etapa_erro: null,
        erp_erro: null,
        status_erp: "Rascunho",
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
    updateDespesaDocumento,
    updateDespesaVencimento,
    deleteDespesa,
    enviarDespesa,
    aprovarDespesa,
    reprovarDespesa,
    aprovarFinanceiro,
    processarReembolso,
    estornarReembolso,
    lancarSistema,
    lancarERP,
    tentarNovamenteERP,
    estornarLancamento,
  };
}

const fetchFrotas = async (): Promise<Frota[]> => {
  const res = await fetch("/api/frotas");
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
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
  const { profile } = useAuth();
  // Só busca quando a sessão está confirmada
  const { data, error, isLoading, mutate } = useSWR(
    profile?.id ? "profiles" : null,
    fetchProfiles,
    { revalidateOnFocus: false }
  );

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

// ─────────────────────────────────────────────
// Controle de KM
// ───────────────��─────────────────────���───────

export interface ControleKm {
  id: string;
  frota_id: string;
  usuario_id: string;
  km_inicial: number;
  km_final: number | null;
  km_percorrido: number | null;
  data_inicio: string;
  data_fim: string | null;
  duracao_minutos: number | null;
  destino: string | null;
  motivo: string | null;
  observacao: string | null;
  status: "aberto" | "finalizado";
  created_at: string;
  updated_at: string;
}

async function fetchControleKm() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("controle_km")
    .select("*")
    .order("data_inicio", { ascending: false });
  return data || [];
}

export function useControleKm() {
  const { data, error, isLoading, mutate } = useSWR("controle_km", fetchControleKm, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
  });

  const iniciarKm = async (payload: {
    frota_id: string;
    usuario_id: string;
    km_inicial: number;
    destino?: string;
    motivo?: string;
    observacao?: string;
  }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { data: inserted, error } = await supabase
      .from("controle_km")
      .insert({
        ...payload,
        data_inicio: new Date().toISOString(),
        status: "aberto",
      })
      .select()
      .single();

    if (error) return { error: error.message };

    // Atualiza KM do veículo no cadastro da frota com o km_inicial informado
    await supabase
      .from("frotas")
      .update({
        quilometragem: payload.km_inicial,
        km_atualizado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.frota_id);

    mutate();
    return { data: inserted, error: null };
  };

  const finalizarKm = async (id: string, km_final: number, observacao?: string, frota_id?: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };

    const { error } = await supabase
      .from("controle_km")
      .update({
        km_final,
        data_fim: new Date().toISOString(),
        status: "finalizado",
        observacao: observacao || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    // Atualiza KM do veículo no cadastro da frota com o km_final (valor mais recente)
    if (frota_id) {
      await supabase
        .from("frotas")
        .update({
          quilometragem: km_final,
          km_atualizado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", frota_id);
    }

    mutate();
    return { error: null };
  };

  const deleteControleKm = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase não disponível" };
    const { error } = await supabase.from("controle_km").delete().eq("id", id);
    if (error) return { error: error.message };
    mutate();
    return { error: null };
  };

  return {
    registros: data as ControleKm[] || [],
    isLoading,
    error,
    mutate,
    iniciarKm,
    finalizarKm,
    deleteControleKm,
  };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ========== AUTH ==========

export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { data };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
}

export async function signUp(
  email: string,
  password: string,
  metadata: { nome: string; usuario: string; perfil: string }
) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo:
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { data };
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  // Marcar primeiro_acesso como false
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({ primeiro_acesso: false })
      .eq("id", user.id);
  }

  return { success: true };
}

// ========== PROFILES ==========

export async function getProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("nome");

  if (error) {
    console.error("Error fetching profiles:", error);
    return [];
  }

  return data;
}

export async function updateProfile(
  id: string,
  updates: {
    nome?: string;
    email?: string;
    usuario?: string;
    perfil?: string;
    ativo?: boolean;
    gestor_id?: string | null;
    primeiro_acesso?: boolean;
  }
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

// ========== TIPOS DESPESA ==========

export async function getTiposDespesa() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tipos_despesa")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    console.error("Error fetching tipos_despesa:", error);
    return [];
  }

  return data;
}

export async function createTipoDespesa(tipoDespesa: {
  nome: string;
  descricao?: string;
  limite_maximo?: number;
  exige_comprovante?: boolean;
  documento_padrao?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tipos_despesa")
    .insert(tipoDespesa)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

export async function updateTipoDespesa(
  id: string,
  updates: {
    nome?: string;
    descricao?: string;
    limite_maximo?: number | null;
    exige_comprovante?: boolean;
    documento_padrao?: string;
    ativo?: boolean;
  }
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tipos_despesa")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

// ========== CARTOES ==========

export async function getCartoes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cartoes")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching cartoes:", error);
    return [];
  }

  return data;
}

export async function getCartoesByUser(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cartoes")
    .select("*")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("is_padrao", { ascending: false });

  if (error) {
    console.error("Error fetching cartoes:", error);
    return [];
  }

  return data;
}

export async function createCartao(cartao: {
  user_id: string;
  banco: string;
  bandeira: string;
  ultimos_digitos: string;
  apelido?: string;
  is_padrao?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cartoes")
    .insert(cartao)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

// ========== DESPESAS ==========

export async function getDespesas() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("despesas")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching despesas:", error);
    return [];
  }

  return data;
}

export async function getDespesasByUser(tecnicoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("despesas")
    .select("*")
    .eq("tecnico_id", tecnicoId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching despesas:", error);
    return [];
  }

  return data;
}

export async function createDespesa(despesa: {
  tecnico_id: string;
  tipo_despesa_id: string;
  cartao_id?: string;
  cliente: string;
  numero_os: string;
  valor: number;
  documento?: string;
  observacao?: string;
  comprovante_nome?: string;
  comprovante_url?: string;
  data_despesa: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("despesas")
    .insert(despesa)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

export async function updateDespesa(
  id: string,
  updates: {
    tipo_despesa_id?: string;
    cartao_id?: string | null;
    cliente?: string;
    numero_os?: string;
    valor?: number;
    documento?: string;
    observacao?: string;
    comprovante_nome?: string;
    comprovante_url?: string;
    data_despesa?: string;
    status_aprovacao?: "AguardandoGestor" | "AprovadoGestor" | "Reprovado";
    status_erp?: string;
    gestor_aprovador_id?: string;
    justificativa_reprovacao?: string;
    data_envio?: string;
    data_aprovacao?: string;
    erp_id?: string;
    erp_payload?: object;
    erp_resposta?: object;
  }
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("despesas")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

export async function enviarDespesa(id: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Simula envio ao ERP
  const erpPayload = { despesa_id: id, timestamp: now };
  const erpResposta = { success: true, erp_id: `ERP-${Date.now()}`, message: "Enviado com sucesso" };

  const { data, error } = await supabase
    .from("despesas")
    .update({
      status_erp: "EnviadoAguardandoGestor",
      data_envio: now,
      erp_id: erpResposta.erp_id,
      erp_payload: erpPayload,
      erp_resposta: erpResposta,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { ok: false, msg: error.message };
  }

  revalidatePath("/");
  return { ok: true, msg: "Despesa enviada com sucesso!", data };
}

export async function aprovarDespesa(id: string, gestorId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("despesas")
    .update({
      status_aprovacao: "AprovadoGestor",
      status_erp: "AprovadoGestorERPAtualizado",
      gestor_aprovador_id: gestorId,
      data_aprovacao: now,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

export async function reprovarDespesa(id: string, gestorId: string, justificativa: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("despesas")
    .update({
      status_aprovacao: "Reprovado",
      gestor_aprovador_id: gestorId,
      justificativa_reprovacao: justificativa,
      data_aprovacao: now,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { data };
}

// ========== AUDITORIA ==========

export async function getAuditoria() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching auditoria:", error);
    return [];
  }

  return data;
}

export async function logAuditoria(log: {
  user_id: string;
  acao: string;
  entidade?: string;
  entidade_id?: string;
  detalhes?: string;
}) {
  const supabase = await createClient();
  await supabase.from("auditoria").insert(log);
}

// ========== STORAGE (COMPROVANTES) ==========

export async function uploadComprovante(
  userId: string,
  file: File
): Promise<{ url: string; nome: string } | { error: string }> {
  const supabase = await createClient();

  // Gerar nome único para o arquivo
  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from("comprovantes")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading comprovante:", error);
    return { error: error.message };
  }

  // Gerar URL pública assinada (válida por 1 ano)
  const { data: urlData } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(data.path, 60 * 60 * 24 * 365);

  return {
    url: urlData?.signedUrl || "",
    nome: file.name,
  };
}

export async function getComprovanteUrl(path: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 60 * 24); // URL válida por 24h

  return data?.signedUrl || null;
}

export async function deleteComprovante(path: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from("comprovantes")
    .remove([path]);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

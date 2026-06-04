"use client";

import { createClient } from "@/lib/supabase/client";

export async function uploadComprovante(
  userId: string,
  file: File
): Promise<{ url: string; nome: string; path: string } | { error: string }> {
  const supabase = createClient();
  if (!supabase) return { error: "Supabase não está disponível" };

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
    return { error: error.message };
  }

  // Gerar URL pública assinada (válida por 1 ano)
  const { data: urlData } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(data.path, 60 * 60 * 24 * 365);

  return {
    url: urlData?.signedUrl || "",
    nome: file.name,
    path: data.path,
  };
}

export async function getComprovanteUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const { data } = await supabase.storage
    .from("comprovantes")
    .createSignedUrl(path, 60 * 60 * 24); // URL válida por 24h

  return data?.signedUrl || null;
}

export async function deleteComprovante(path: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  if (!supabase) return { success: false, error: "Supabase não está disponível" };

  const { error } = await supabase.storage
    .from("comprovantes")
    .remove([path]);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export function getComprovantePublicUrl(path: string): string {
  const supabase = createClient();
  if (!supabase) return "";
  
  const { data } = supabase.storage.from("comprovantes").getPublicUrl(path);
  return data.publicUrl;
}

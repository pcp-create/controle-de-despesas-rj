import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dynamic = "force-dynamic";

export async function GET() {
  if (!serviceRoleKey) {
    return NextResponse.json({
      needsMigration: true,
      sql: `
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS observacao_financeiro TEXT;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS anexo_financeiro_url  TEXT;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS anexo_financeiro_nome TEXT;
      `.trim(),
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const alters = [
    `ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS observacao_financeiro TEXT`,
    `ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS anexo_financeiro_url  TEXT`,
    `ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS anexo_financeiro_nome TEXT`,
  ];

  const errors: string[] = [];

  for (const sql of alters) {
    // Supabase service role pode executar DDL via SQL API (PostgreSQL)
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey!,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "params=single-object",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      // Fallback: usa o client diretamente — qualquer erro de "already exists" é seguro ignorar
      const { error } = await (supabase as any).from("_sql").select(sql).limit(0);
      if (error && !error.message.includes("already exists")) {
        errors.push(error.message);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ partialSuccess: true, errors });
  }

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/alertas-consumo/limpar
 * Chamado quando a frota está com consumo OK (>= 80%).
 * Marca todos os alertas ativos da frota como resolvidos e
 * limpa o alerta_ativo na tabela frotas.
 * Body: { frotaId: string }
 */
export async function POST(req: Request) {
  try {
    const { frotaId } = await req.json();
    if (!frotaId) {
      return NextResponse.json({ error: "frotaId obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Marca alertas ativos da frota como resolvidos
    await supabase
      .from("alertas_consumo")
      .update({ ativo: false, resolvido_em: new Date().toISOString() })
      .eq("frota_id", frotaId)
      .eq("ativo", true);

    // Limpa alerta_ativo na frota
    const { error } = await supabase
      .from("frotas")
      .update({ alerta_ativo: false })
      .eq("id", frotaId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

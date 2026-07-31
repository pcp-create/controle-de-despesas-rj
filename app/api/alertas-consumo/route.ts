import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/alertas-consumo
 * Persiste ou atualiza um alerta de consumo e atualiza a frota com o último cálculo.
 * Body: { alerta: AlertaConsumo, ativo: boolean }
 */
export async function POST(req: Request) {
  try {
    const { alerta, ativo } = await req.json();
    if (!alerta?.id || !alerta?.frotaId) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Upsert na tabela alertas_consumo
    const { error: alertaError } = await supabase
      .from("alertas_consumo")
      .upsert({
        id: alerta.id,
        frota_id: alerta.frotaId,
        placa: alerta.placa,
        modelo: alerta.modelo,
        data: alerta.data,
        litros: alerta.litros,
        km_apontado: alerta.kmApontado,
        km_esperado: alerta.kmEsperado,
        percentual: alerta.percentual,
        valor: alerta.valor,
        ativo,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (alertaError) {
      return NextResponse.json({ error: alertaError.message }, { status: 500 });
    }

    // Verifica se ainda há alertas ativos para essa frota
    const { data: alertasAtivos } = await supabase
      .from("alertas_consumo")
      .select("id")
      .eq("frota_id", alerta.frotaId)
      .eq("ativo", true);

    const temAlertaAtivo = (alertasAtivos?.length ?? 0) > 0;

    // Atualiza frotas com o último cálculo e flag de alerta ativo
    const { error: frotaError } = await supabase
      .from("frotas")
      .update({
        alerta_ativo: temAlertaAtivo,
        ultimo_calculo_em: alerta.data,
        ultimo_calculo_km_apontado: alerta.kmApontado,
        ultimo_calculo_km_esperado: alerta.kmEsperado,
        ultimo_calculo_percentual: alerta.percentual,
      })
      .eq("id", alerta.frotaId);

    if (frotaError) {
      return NextResponse.json({ error: frotaError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, alerta_ativo: temAlertaAtivo });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/alertas-consumo
 * Marca um alerta como tratado (ativo = false) e atualiza a frota.
 * Body: { id: string, resolvido_por: string, justificativa?: string }
 */
export async function PATCH(req: Request) {
  try {
    const { id, resolvido_por, justificativa } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const supabase = getServiceClient();

    // Busca o alerta para obter frota_id
    const { data: alerta, error: fetchErr } = await supabase
      .from("alertas_consumo")
      .select("frota_id")
      .eq("id", id)
      .single();

    if (fetchErr || !alerta) {
      return NextResponse.json({ error: "Alerta não encontrado" }, { status: 404 });
    }

    // Marca como resolvido
    const { error: updateErr } = await supabase
      .from("alertas_consumo")
      .update({
        ativo: false,
        resolvido_em: new Date().toISOString(),
        resolvido_por: resolvido_por ?? null,
        ...(justificativa ? { justificativa } : {}),
      })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Verifica se ainda há alertas ativos para essa frota
    const { data: ativos } = await supabase
      .from("alertas_consumo")
      .select("id")
      .eq("frota_id", alerta.frota_id)
      .eq("ativo", true);

    // Atualiza alerta_ativo na frota
    await supabase
      .from("frotas")
      .update({ alerta_ativo: (ativos?.length ?? 0) > 0 })
      .eq("id", alerta.frota_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * GET /api/alertas-consumo?frota_id=xxx&apenas_ativos=true
 * Busca alertas de consumo do banco.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const frotaId = searchParams.get("frota_id");
    const apenasAtivos = searchParams.get("apenas_ativos") === "true";

    const supabase = getServiceClient();
    let query = supabase
      .from("alertas_consumo")
      .select("*")
      .order("data", { ascending: false });

    if (frotaId) query = query.eq("frota_id", frotaId);
    if (apenasAtivos) query = query.eq("ativo", true);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

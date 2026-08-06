import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/verificar-km-aberto
 *
 * Verifica se existe apontamento de KM em aberto para um veículo.
 * Deve ser chamado ANTES de salvar qualquer despesa de abastecimento.
 *
 * Body: { frota_id: string }
 *
 * Resposta OK (sem bloqueio):
 *   { bloqueado: false }
 *
 * Resposta com bloqueio:
 *   {
 *     bloqueado: true,
 *     error: "KM_ABERTO",
 *     message: "...",
 *     apontamento: {
 *       id, frota_id, usuario_id, km_inicial, data_inicio,
 *       responsavel_nome, frota_placa, frota_modelo
 *     }
 *   }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { frota_id } = body ?? {};

    if (!frota_id || typeof frota_id !== "string") {
      return NextResponse.json({ error: "frota_id obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Busca apontamento aberto para o veículo, com dados do responsável e da frota
    const { data: apontamentos, error } = await supabase
      .from("controle_km")
      .select(`
        id,
        frota_id,
        usuario_id,
        km_inicial,
        data_inicio,
        destino,
        responsavel:profiles!controle_km_usuario_id_fkey(nome),
        frota:frotas!controle_km_frota_id_fkey(placa, modelo)
      `)
      .eq("frota_id", frota_id)
      .eq("status", "aberto")
      .order("data_inicio", { ascending: false })
      .limit(1);

    if (error) {
      // Erro de consulta — não bloqueia o abastecimento, mas retorna o erro para auditoria
      console.error("[verificar-km-aberto] Erro ao consultar controle_km:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!apontamentos || apontamentos.length === 0) {
      return NextResponse.json({ bloqueado: false });
    }

    const ap = apontamentos[0] as {
      id: string;
      frota_id: string;
      usuario_id: string;
      km_inicial: number;
      data_inicio: string;
      destino: string | null;
      responsavel: { nome: string } | null;
      frota: { placa: string; modelo: string } | null;
    };

    return NextResponse.json({
      bloqueado: true,
      error: "KM_ABERTO",
      message: "Existe um apontamento de KM em aberto para este veículo. Finalize o apontamento antes de registrar o abastecimento.",
      apontamento: {
        id: ap.id,
        frota_id: ap.frota_id,
        usuario_id: ap.usuario_id,
        km_inicial: ap.km_inicial,
        data_inicio: ap.data_inicio,
        responsavel_nome: ap.responsavel?.nome ?? "Desconhecido",
        frota_placa: ap.frota?.placa ?? "—",
        frota_modelo: ap.frota?.modelo ?? "",
      },
    });
  } catch (err) {
    console.error("[verificar-km-aberto] Erro inesperado:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

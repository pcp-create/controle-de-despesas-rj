import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Atualiza a quilometragem de um veículo da frota usando o service role,
 * ignorando o RLS. Necessário porque funcionários comuns não têm permissão
 * de UPDATE na tabela `frotas`, mas o ajuste de KM ao iniciar/finalizar uma
 * viagem deve ocorrer para qualquer perfil.
 */
export async function POST(request: Request) {
  try {
    const { frota_id, quilometragem } = await request.json();

    if (!frota_id || quilometragem == null || isNaN(Number(quilometragem))) {
      return NextResponse.json(
        { error: "frota_id e quilometragem válidos são obrigatórios." },
        { status: 400 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY não configurada." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Busca a quilometragem atual para evitar regressão do hodômetro.
    // Abastecimentos lançados retroativamente não devem reduzir o KM da frota.
    const { data: frota, error: fetchError } = await supabase
      .from("frotas")
      .select("quilometragem")
      .eq("id", frota_id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const kmAtual = Number(frota?.quilometragem ?? 0);
    const kmNovo = Number(quilometragem);

    // Só atualiza se o novo KM for maior que o atual (nunca regride o hodômetro)
    if (kmNovo <= kmAtual) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const { error } = await supabase
      .from("frotas")
      .update({
        quilometragem: kmNovo,
        km_atualizado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", frota_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao atualizar KM da frota." },
      { status: 500 }
    );
  }
}

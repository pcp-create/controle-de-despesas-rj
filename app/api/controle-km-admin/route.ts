import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET - busca todos os registros de controle_km usando service key (ignora RLS)
export async function GET() {
  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("controle_km")
    .select("*")
    .order("data_inicio", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// PATCH - ajusta um apontamento existente usando service key (ignora RLS).
// Usado pela tela de Controle de KM para permitir que Gestor/Administrador
// corrijam registros já lançados (km_inicial, km_final, destino, motivo,
// observação, ocorrência). Não altera a quilometragem atual do veículo
// (frotas.quilometragem) — esse valor reflete o estado mais recente da frota
// e é atualizado apenas pelos fluxos de iniciar/finalizar viagem e abastecimento.
export async function PATCH(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { id, km_inicial, km_final, destino, motivo, observacao, ocorrencia } = body;

  if (!id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  if (km_inicial == null || typeof km_inicial !== "number" || km_inicial < 0) {
    return NextResponse.json({ error: "km_inicial inválido" }, { status: 400 });
  }
  if (km_final != null && (typeof km_final !== "number" || km_final < km_inicial)) {
    return NextResponse.json(
      { error: "km_final deve ser maior ou igual ao km_inicial" },
      { status: 400 }
    );
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Recalcula km_percorrido a partir dos valores ajustados. Mantém a duração
  // (duracao_minutos) inalterada, pois este ajuste não altera data_inicio/data_fim.
  const km_percorrido = km_final != null ? Math.max(0, km_final - km_inicial) : null;

  const { data, error } = await admin
    .from("controle_km")
    .update({
      km_inicial,
      km_final: km_final ?? null,
      km_percorrido,
      destino: destino?.trim() || null,
      motivo: motivo?.trim() || null,
      observacao: observacao?.trim() || null,
      ocorrencia: ocorrencia?.trim() || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

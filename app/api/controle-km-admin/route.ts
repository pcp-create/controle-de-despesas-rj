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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

// Recalcula a quilometragem (hodômetro) do veículo a partir do maior KM
// registrado nos apontamentos de controle_km e nos abastecimentos (despesas).
// Usado após um ajuste de apontamento para corrigir valores gravados por
// lançamentos no veículo errado ou com KM digitado incorretamente.
// Se o veículo não tiver nenhum registro, mantém a quilometragem atual.
async function recalcularKmFrota(admin: AdminClient, frotaId: string) {
  const [{ data: kms }, { data: abastecimentos }] = await Promise.all([
    admin.from("controle_km").select("km_inicial, km_final").eq("frota_id", frotaId),
    admin.from("despesas").select("km_atual").eq("frota_id", frotaId).not("km_atual", "is", null),
  ]);

  let maior = 0;
  for (const r of (kms ?? []) as { km_inicial: number | null; km_final: number | null }[]) {
    maior = Math.max(maior, Number(r.km_inicial ?? 0), Number(r.km_final ?? 0));
  }
  for (const d of (abastecimentos ?? []) as { km_atual: number | null }[]) {
    maior = Math.max(maior, Number(d.km_atual ?? 0));
  }
  if (maior <= 0) return;

  const agora = new Date().toISOString();
  await admin
    .from("frotas")
    .update({ quilometragem: maior, km_atualizado_em: agora, updated_at: agora } as never)
    .eq("id", frotaId);
}

// PATCH - ajusta um apontamento existente usando service key (ignora RLS).
// Usado pela tela de Controle de KM para corrigir registros já lançados
// (veículo, km_inicial, km_final, destino, motivo, observação, ocorrência).
// Quando o veículo ou o KM mudam, recalcula a quilometragem dos veículos
// envolvidos (o anterior e o novo).
export async function PATCH(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { id, frota_id, km_inicial, km_final, destino, motivo, observacao, ocorrencia } = body;

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

  const { data: atual, error: atualError } = await admin
    .from("controle_km")
    .select("frota_id, status, km_inicial, km_final")
    .eq("id", id)
    .single();

  if (atualError || !atual) {
    return NextResponse.json({ error: "Apontamento não encontrado" }, { status: 404 });
  }

  const frotaAnterior = atual.frota_id as string;
  const frotaNova = (typeof frota_id === "string" && frota_id) ? frota_id : frotaAnterior;
  const trocouVeiculo = frotaNova !== frotaAnterior;

  if (trocouVeiculo) {
    const { data: veiculo } = await admin.from("frotas").select("id").eq("id", frotaNova).maybeSingle();
    if (!veiculo) {
      return NextResponse.json({ error: "Veículo selecionado não encontrado" }, { status: 400 });
    }
    if (atual.status === "aberto") {
      const { data: outraAberta } = await admin
        .from("controle_km")
        .select("id")
        .eq("frota_id", frotaNova)
        .eq("status", "aberto")
        .neq("id", id)
        .limit(1);
      if (outraAberta && outraAberta.length > 0) {
        return NextResponse.json(
          { error: "O veículo selecionado já possui uma viagem em aberto" },
          { status: 400 }
        );
      }
    }
  }

  const { data, error } = await admin
    .from("controle_km")
    .update({
      frota_id: frotaNova,
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

  const kmAlterado =
    Number(atual.km_inicial) !== Number(km_inicial) ||
    (atual.km_final ?? null) !== (km_final ?? null);

  if (trocouVeiculo || kmAlterado) {
    const afetados = trocouVeiculo ? [frotaAnterior, frotaNova] : [frotaNova];
    await Promise.all(afetados.map((f) => recalcularKmFrota(admin, f)));
  }

  return NextResponse.json({ data });
}

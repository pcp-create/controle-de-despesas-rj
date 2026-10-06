import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Lista os apontamentos em aberto de OUTROS usuários para um veículo, com o
 * nome de quem está com ele, para o usuário confirmar antes de seguir.
 */
export async function GET(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json({ error: "Configuração do servidor incompleta" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const frota_id = searchParams.get("frota_id");
  const usuario_id = searchParams.get("usuario_id");
  if (!frota_id || !usuario_id) {
    return NextResponse.json({ error: "frota_id e usuario_id são obrigatórios." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: abertos, error } = await admin
    .from("controle_km")
    .select("id, usuario_id, km_inicial, data_inicio, destino")
    .eq("frota_id", frota_id)
    .eq("status", "aberto")
    .neq("usuario_id", usuario_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lista = (abertos ?? []) as {
    id: string;
    usuario_id: string;
    km_inicial: number;
    data_inicio: string;
    destino: string | null;
  }[];

  if (lista.length === 0) return NextResponse.json({ abertos: [] });

  const { data: perfis } = await admin
    .from("profiles")
    .select("id, nome")
    .in("id", lista.map((r) => r.usuario_id));
  const nomes = new Map(((perfis ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));

  return NextResponse.json({
    abertos: lista.map((r) => ({
      id: r.id,
      usuario_nome: nomes.get(r.usuario_id) ?? "Usuário desconhecido",
      km_inicial: Number(r.km_inicial ?? 0),
      data_inicio: r.data_inicio,
      destino: r.destino,
    })),
  });
}

/**
 * Encerra automaticamente os apontamentos em aberto de OUTROS usuários para um
 * veículo, antes de um novo apontamento ser aberto nele. O KM final do
 * apontamento encerrado passa a ser o KM inicial do novo apontamento.
 * Usa service role porque o usuário que abre o novo apontamento não tem
 * permissão (RLS) para alterar registros de outros usuários.
 */
export async function POST(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json({ error: "Configuração do servidor incompleta" }, { status: 500 });
  }

  const { frota_id, usuario_id, km_inicial } = await request.json();
  const kmNovo = Number(km_inicial);

  if (!frota_id || !usuario_id || km_inicial == null || isNaN(kmNovo) || kmNovo < 0) {
    return NextResponse.json(
      { error: "frota_id, usuario_id e km_inicial válidos são obrigatórios." },
      { status: 400 }
    );
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: abertos, error: fetchError } = await admin
    .from("controle_km")
    .select("id, usuario_id, km_inicial, data_inicio, observacao")
    .eq("frota_id", frota_id)
    .eq("status", "aberto")
    .neq("usuario_id", usuario_id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const registros = (abertos ?? []) as {
    id: string;
    usuario_id: string;
    km_inicial: number;
    data_inicio: string;
    observacao: string | null;
  }[];

  if (registros.length === 0) {
    return NextResponse.json({ encerrados: 0 });
  }

  const maiorKmInicialAberto = Math.max(...registros.map((r) => Number(r.km_inicial ?? 0)));
  if (kmNovo < maiorKmInicialAberto) {
    return NextResponse.json(
      {
        error: `Este veículo possui um apontamento em aberto com KM inicial ${maiorKmInicialAberto.toLocaleString(
          "pt-BR"
        )}. O KM inicial do novo apontamento deve ser maior ou igual a esse valor.`,
      },
      { status: 400 }
    );
  }

  const { data: novoUsuario } = await admin
    .from("profiles")
    .select("nome")
    .eq("id", usuario_id)
    .maybeSingle();

  const dataFim = new Date();
  const dataFormatada = dataFim.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const aviso = `Encerrado automaticamente pelo sistema em ${dataFormatada}, ao abrir novo apontamento neste veículo${
    novoUsuario?.nome ? ` por ${novoUsuario.nome}` : ""
  } (KM final = KM inicial do novo apontamento).`;

  for (const r of registros) {
    const duracao_minutos = Math.max(
      0,
      Math.round((dataFim.getTime() - new Date(r.data_inicio).getTime()) / 60000)
    );
    const { error } = await admin
      .from("controle_km")
      .update({
        km_final: kmNovo,
        km_percorrido: Math.max(0, kmNovo - Number(r.km_inicial ?? 0)),
        data_fim: dataFim.toISOString(),
        duracao_minutos,
        status: "finalizado",
        observacao: r.observacao ? `${r.observacao}\n${aviso}` : aviso,
        updated_at: dataFim.toISOString(),
      } as never)
      .eq("id", r.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ encerrados: registros.length });
}

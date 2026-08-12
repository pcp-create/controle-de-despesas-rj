import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/alertas-consumo/reprocessar-frota
 *
 * Reprocessamento administrativo pontual de um alerta específico.
 * Usado para corrigir alertas com dados incorretos sem passar pelo fluxo automático.
 *
 * Restrições:
 *   - Exige admin_user_id com role "administrador"
 *   - Afeta apenas o alerta_id informado
 *   - Registra auditoria
 *   - NÃO é chamado automaticamente por persistirAlertasConsumo
 *   - Preserva resolvido_por/resolvido_em/justificativa se o alerta já foi tratado
 *
 * Body:
 * {
 *   admin_user_id: string,       — ID do administrador executando a correção
 *   alerta_id: string,           — ID do alerta a corrigir (ex: "frotaId_YYYY-MM-DD")
 *   frota_id: string,            — ID da frota
 *   km_apontado: number,         — valor correto de km apontado
 *   km_esperado: number,         — valor correto de km esperado
 *   percentual: number,          — percentual correto (ex: 0.78)
 *   motivo: string,              — descrição da correção para auditoria
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      admin_user_id,
      alerta_id,
      frota_id,
      km_apontado,
      km_esperado,
      percentual,
      motivo,
    } = body;

    // Validação de campos obrigatórios
    if (!admin_user_id || !alerta_id || !frota_id) {
      return NextResponse.json(
        { error: "admin_user_id, alerta_id e frota_id são obrigatórios" },
        { status: 400 },
      );
    }
    if (typeof km_apontado !== "number" || typeof km_esperado !== "number" || typeof percentual !== "number") {
      return NextResponse.json(
        { error: "km_apontado, km_esperado e percentual devem ser números" },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();

    // Verifica se o solicitante é administrador
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, nome")
      .eq("id", admin_user_id)
      .maybeSingle();

    if (!perfil || perfil.role !== "administrador") {
      return NextResponse.json(
        { error: "Acesso negado. Perfil administrador exigido." },
        { status: 403 },
      );
    }

    // Lê o alerta atual — deve existir para ser reprocessado
    const { data: alertaAtual, error: fetchErr } = await supabase
      .from("alertas_consumo")
      .select("id, ativo, resolvido_por, resolvido_em, justificativa, placa, modelo, data, litros, valor")
      .eq("id", alerta_id)
      .maybeSingle();

    if (fetchErr || !alertaAtual) {
      return NextResponse.json(
        { error: `Alerta "${alerta_id}" não encontrado.` },
        { status: 404 },
      );
    }

    const jaTratado = alertaAtual.ativo === false && alertaAtual.resolvido_por != null;

    // Novo estado ativo: abaixo de 80% → permanece ativo; acima → desativa sem resolução manual
    const novoAtivo = jaTratado ? false : percentual < 0.8;

    // Atualiza somente km_apontado, km_esperado, percentual e updated_at
    // Preserva todos os campos de resolução manual intactos
    const { error: updateErr } = await supabase
      .from("alertas_consumo")
      .update({
        km_apontado,
        km_esperado,
        percentual,
        ativo: novoAtivo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", alerta_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Atualiza ultimo_calculo_* na frota
    const { data: alertasAtivos } = await supabase
      .from("alertas_consumo")
      .select("id")
      .eq("frota_id", frota_id)
      .eq("ativo", true);

    const temAlertaAtivo = (alertasAtivos?.length ?? 0) > 0;

    await supabase
      .from("frotas")
      .update({
        alerta_ativo: temAlertaAtivo,
        ultimo_calculo_km_apontado: km_apontado,
        ultimo_calculo_km_esperado: km_esperado,
        ultimo_calculo_percentual: percentual,
        // Momento em que este reprocessamento pontual foi executado — nunca a data
        // do abastecimento/apontamento usado como fonte do cálculo.
        ultimo_calculo_em: new Date().toISOString(),
      })
      .eq("id", frota_id);

    // Registra auditoria
    await supabase
      .from("auditoria")
      .insert({
        acao: "UPDATE",
        entidade: "alerta_consumo",
        entidade_id: alerta_id,
        usuario_id: admin_user_id,
        detalhes: `Reprocessamento pontual por ${perfil.nome ?? admin_user_id}. ` +
          `km_apontado: ${km_apontado}, km_esperado: ${km_esperado}, percentual: ${(percentual * 100).toFixed(0)}%. ` +
          `Motivo: ${motivo ?? "não informado"}`,
        created_at: new Date().toISOString(),
      })
      .throwOnError()
      .catch(() => {/* auditoria não bloqueia a correção */});

    return NextResponse.json({
      success: true,
      alerta_id,
      frota_id,
      km_apontado,
      km_esperado,
      percentual,
      ativo: novoAtivo,
      jaTratado,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

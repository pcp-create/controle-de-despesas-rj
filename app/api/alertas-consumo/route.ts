import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/alertas-consumo
 * Fluxo normal de persistência — chamado por persistirAlertasConsumo.
 *
 * Regras de proteção:
 *   - Alerta TRATADO (ativo=false + resolvido_por preenchido + resolvido_em preenchido):
 *     não reativa, não sobrescreve resolvido_por/resolvido_em/justificativa.
 *   - Alerta ATIVO (ainda não tratado): atualiza km_apontado, km_esperado, percentual.
 *     Se o novo percentual >= 80%, desativa automaticamente sem preencher resolução manual.
 *   - Alerta INEXISTENTE: cria normalmente.
 *
 * Body: { alerta: AlertaConsumo, ativo: boolean }
 */
export async function POST(req: Request) {
  try {
    const { alerta, ativo } = await req.json();
    if (!alerta?.id || !alerta?.frotaId) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Lê o estado atual do alerta (se existir)
    const { data: existente } = await supabase
      .from("alertas_consumo")
      .select("ativo, resolvido_por, resolvido_em")
      .eq("id", alerta.id)
      .maybeSingle();

    // Alerta tratado manualmente: não reativa, não altera dados de resolução
    const jaTratado = existente
      && existente.ativo === false
      && existente.resolvido_por != null
      && existente.resolvido_em != null;

    if (jaTratado) {
      return NextResponse.json({ success: true, ignorado: true });
    }

    // Determina o novo estado ativo:
    //   - se ativo=true (percentual < 80%): mantém ativo
    //   - se ativo=false (percentual >= 80%): desativa automaticamente,
    //     mas sem preencher resolvido_por/resolvido_em (não foi tratamento manual)
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

    // Atualiza frotas com o último cálculo e flag de alerta ativo
    const { data: alertasAtivos } = await supabase
      .from("alertas_consumo")
      .select("id")
      .eq("frota_id", alerta.frotaId)
      .eq("ativo", true);

    const temAlertaAtivo = (alertasAtivos?.length ?? 0) > 0;

    const { error: frotaError } = await supabase
      .from("frotas")
      .update({
        alerta_ativo: temAlertaAtivo,
        // ultimo_calculo_em representa o MOMENTO EM QUE ESTE CÁLCULO FOI EXECUTADO,
        // nunca a data dos abastecimentos/apontamentos usados como fonte do cálculo.
        ultimo_calculo_em: new Date().toISOString(),
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
 * PUT /api/alertas-consumo
 * Reprocessamento ADMINISTRATIVO de um alerta específico.
 *
 * Diferente do POST (fluxo automático), este endpoint:
 *   - Exige admin_user_id no body (verificado como administrador no banco)
 *   - Corrige km_apontado/km_esperado/percentual de um alerta específico
 *   - NÃO é chamado por persistirAlertasConsumo nem por nenhum fluxo automático
 *   - Registra auditoria (operador + timestamp)
 *   - Preserva resolvido_por/resolvido_em/justificativa se já tratado
 *   - Afeta apenas o alerta_id informado (não reprocessa outras frotas)
 *
 * Body: { alerta: AlertaConsumo, ativo: boolean, admin_user_id: string }
 */
export async function PUT(req: Request) {
  try {
    const { alerta, ativo, admin_user_id } = await req.json();

    if (!alerta?.id || !alerta?.frotaId) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    if (!admin_user_id) {
      return NextResponse.json({ error: "admin_user_id obrigatório" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verifica se o solicitante é administrador
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", admin_user_id)
      .maybeSingle();

    if (!perfil || perfil.role !== "administrador") {
      return NextResponse.json({ error: "Acesso negado. Perfil administrador exigido." }, { status: 403 });
    }

    // Lê estado atual para preservar campos de resolução manual
    const { data: existente } = await supabase
      .from("alertas_consumo")
      .select("ativo, resolvido_por, resolvido_em, justificativa")
      .eq("id", alerta.id)
      .maybeSingle();

    const jaTratado = existente
      && existente.ativo === false
      && existente.resolvido_por != null;

    // Atualiza km/percentual; preserva campos de resolução se já tratado
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
        ativo: jaTratado ? false : ativo,
        // Preserva dados de resolução manual — não limpa quem tratou
        ...(jaTratado ? {
          resolvido_por: existente.resolvido_por,
          resolvido_em: existente.resolvido_em,
          justificativa: existente.justificativa,
        } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (alertaError) {
      return NextResponse.json({ error: alertaError.message }, { status: 500 });
    }

    // Registra auditoria do reprocessamento administrativo
    await supabase.from("auditoria").insert({
      acao: "UPDATE",
      entidade: "alerta_consumo",
      entidade_id: alerta.id,
      usuario_id: admin_user_id,
      detalhes: `Reprocessamento administrativo: km_apontado=${alerta.kmApontado}, km_esperado=${alerta.kmEsperado}, percentual=${alerta.percentual}`,
      created_at: new Date().toISOString(),
    }).throwOnError().catch(() => {/* auditoria não bloqueia o reprocessamento */});

    // Atualiza frotas com os valores corrigidos
    const { data: alertasAtivos } = await supabase
      .from("alertas_consumo")
      .select("id")
      .eq("frota_id", alerta.frotaId)
      .eq("ativo", true);

    const temAlertaAtivo = (alertasAtivos?.length ?? 0) > 0;

    await supabase
      .from("frotas")
      .update({
        alerta_ativo: temAlertaAtivo,
        // Momento em que este reprocessamento foi executado — nunca a data do abastecimento.
        ultimo_calculo_em: new Date().toISOString(),
        ultimo_calculo_km_apontado: alerta.kmApontado,
        ultimo_calculo_km_esperado: alerta.kmEsperado,
        ultimo_calculo_percentual: alerta.percentual,
      })
      .eq("id", alerta.frotaId);

    return NextResponse.json({ success: true, reprocessado: true, jaTratado });
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

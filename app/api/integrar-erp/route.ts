import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const M8_API_URL  = process.env.M8_API_URL;
  const M8_TENANT   = process.env.M8_TENANT;
  const M8_USERNAME = process.env.M8_USERNAME;
  const M8_PASSWORD = process.env.M8_PASSWORD;
  const M8_COMPANY  = process.env.M8_COMPANY;
  const M8_DOMAIN   = process.env.M8_DOMAIN;

  const varsFaltando: string[] = [];
  if (!M8_API_URL)  varsFaltando.push("M8_API_URL");
  if (!M8_TENANT)   varsFaltando.push("M8_TENANT");
  if (!M8_USERNAME) varsFaltando.push("M8_USERNAME");
  if (!M8_PASSWORD) varsFaltando.push("M8_PASSWORD");
  if (!M8_COMPANY)  varsFaltando.push("M8_COMPANY");

  if (varsFaltando.length > 0) {
    // Não altera nada no banco — apenas informa quais variáveis estão faltando
    return NextResponse.json(
      {
        error: `Variáveis de ambiente não configuradas: ${varsFaltando.join(", ")}. Configure-as em Settings → Vars no painel do projeto.`,
        simulado: true,
        etapa: null,
      },
      { status: 503 }
    );
  }

export async function POST(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json({ error: "Service key não configurada" }, { status: 500 });
  }

  const { despesaId, userId } = await request.json();
  if (!despesaId || !userId) {
    return NextResponse.json({ error: "despesaId e userId são obrigatórios" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ─── Busca despesa + dados relacionados ────────────────────────────────────
  const { data: despesa, error: despesaErr } = await supabase
    .from("despesas")
    .select(`
      *,
      tipo: tipos_despesa(*),
      tecnico: profiles!despesas_tecnico_id_fkey(*),
      aprovador: profiles!despesas_gestor_aprovador_id_fkey(*)
    `)
    .eq("id", despesaId)
    .single();

  if (despesaErr || !despesa) {
    return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 });
  }

  // Proteção contra duplo envio
  if (despesa.erp_status === "processando") {
    return NextResponse.json({ error: "Integração já em andamento" }, { status: 409 });
  }
  if (despesa.erp_status === "integrado" && despesa.lancado_erp) {
    return NextResponse.json({ error: "Despesa já integrada ao ERP" }, { status: 409 });
  }

  // ─── Validação dos campos obrigatórios para integração ────────────────────
  const tipo = (despesa as any).tipo;
  const tecnico = (despesa as any).tecnico;

  // Busca centro de custo ERP da área do técnico
  const { data: cc } = await supabase
    .from("tipos_despesa_centro_custo")
    .select("centro_custo_erp")
    .eq("tipo_despesa_id", despesa.tipo_despesa_id)
    .eq("area", tecnico?.area || "")
    .maybeSingle();

  const camposFaltando: string[] = [];

  if (!despesa.tipo_despesa_id)          camposFaltando.push("Tipo de despesa");
  if (!tipo?.codigo_produto_erp)         camposFaltando.push(`Código de Produto ERP M8 no tipo "${tipo?.nome || "—"}"`);
  if (!tecnico?.area)                    camposFaltando.push("Área / Setor do técnico responsável");
  if (!cc?.centro_custo_erp)             camposFaltando.push(`Centro de Custo ERP M8 para a área "${tecnico?.area || "—"}" no tipo "${tipo?.nome || "—"}"`);
  if (!despesa.data_despesa)             camposFaltando.push("Data da despesa");
  if (!despesa.valor || despesa.valor <= 0) camposFaltando.push("Valor da despesa");
  if (!despesa.cliente)                  camposFaltando.push("Cliente / OS");
  if (!despesa.documento)                camposFaltando.push("Documento / Nota fiscal");

  if (camposFaltando.length > 0) {
    return NextResponse.json(
      {
        error: "Campos obrigatórios incompletos para integração com o ERP M8",
        campos: camposFaltando,
        etapa: 0,
      },
      { status: 422 }
    );
  }

  // Verifica variáveis de ambiente M8
  if (!M8_API_URL || !M8_USERNAME || !M8_PASSWORD || !M8_COMPANY || !M8_TENANT) {
    // Modo simulado: grava como integrado para ambientes sem M8 configurado
    const erp_id = `SIM-${Date.now()}`;
    await salvarProgresso(supabase, despesaId, {
      lancado_erp: true,
      lancado_erp_em: new Date().toISOString(),
      lancado_erp_por: userId,
      erp_status: "integrado",
      erp_id,
      erp_etapa_erro: null,
      erp_erro: null,
      erp_payload: { simulado: true, despesaId },
      erp_resposta: { erp_id, simulado: true },
    });
    return NextResponse.json({ success: true, simulado: true, erp_id });
  }

  // ─── Marca como "processando" ──────────────────────────────────────────────
  await salvarProgresso(supabase, despesaId, { erp_status: "processando", erp_erro: null, erp_etapa_erro: null });

  // ─── Monta payload ────────────────────────────────────────────────────────
  const centroCusto = cc!.centro_custo_erp!;
  const codigoProduto = tipo?.codigo_produto_erp || "";

  let token: string | null = null;
  let erpId: string | null = despesa.erp_id || null;

  const payload = {
    despesaId,
    valor: despesa.valor,
    data: despesa.data_despesa,
    descricao: `${tipo?.nome || "Despesa"} — ${despesa.cliente} — OS ${despesa.numero_os || "Não informado"}`,
    centroCusto,
    codigoProduto,
    tecnico: tecnico?.nome || "",
    documento: despesa.documento || "",
    observacao: despesa.observacao || "",
  };

  // ─── Etapa 1: Autenticação ─────────────────────────────────────────────────
  try {
    const res = await fetch(`${M8_API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: M8_TENANT,
        username: M8_USERNAME,
        password: M8_PASSWORD,
        domain: M8_DOMAIN || "",
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.token) throw new Error(body.message || `HTTP ${res.status}`);
    token = body.token;
  } catch (err: any) {
    await salvarProgresso(supabase, despesaId, {
      erp_status: "erro",
      erp_etapa_erro: 1,
      erp_erro: `Etapa 1 (Autenticação): ${err.message}`,
      erp_payload: payload,
    });
    return NextResponse.json({ error: err.message, etapa: 1 }, { status: 502 });
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant": M8_TENANT!,
    "X-Company": M8_COMPANY!,
  };

  // ─── Etapa 2: Criar/recuperar lançamento ───────────────────────────────────
  if (!erpId) {
    try {
      const res = await fetch(`${M8_API_URL}/api/lancamentos`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          dataLancamento: despesa.data_despesa,
          valor: despesa.valor,
          descricao: payload.descricao,
          centroCusto,
          codigoProduto,
          numeroDocumento: despesa.documento || `DEP-${despesa.id.slice(0, 8).toUpperCase()}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      erpId = body.id || body.lancamentoId;
      if (!erpId) throw new Error("ERP não retornou ID do lançamento");
    } catch (err: any) {
      await salvarProgresso(supabase, despesaId, {
        erp_status: "erro",
        erp_etapa_erro: 2,
        erp_erro: `Etapa 2 (Criar lançamento): ${err.message}`,
        erp_payload: payload,
      });
      return NextResponse.json({ error: err.message, etapa: 2 }, { status: 502 });
    }
  }

  // ─── Etapa 3: Anexar comprovante (se houver) ──────────────────────────────
  if (despesa.comprovante_url) {
    try {
      const res = await fetch(`${M8_API_URL}/api/lancamentos/${erpId}/anexos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: despesa.comprovante_url, nome: despesa.comprovante_nome }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      await salvarProgresso(supabase, despesaId, {
        erp_status: "erro",
        erp_etapa_erro: 3,
        erp_erro: `Etapa 3 (Anexar comprovante): ${err.message}`,
        erp_payload: payload,
        erp_id: erpId,
      });
      return NextResponse.json({ error: err.message, etapa: 3 }, { status: 502 });
    }
  }

  // ─── Etapa 4: Vincular ao centro de custo ─────────────────────────────────
  try {
    const res = await fetch(`${M8_API_URL}/api/lancamentos/${erpId}/centrocusto`, {
      method: "POST",
      headers,
      body: JSON.stringify({ centroCusto, percentual: 100 }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
  } catch (err: any) {
    await salvarProgresso(supabase, despesaId, {
      erp_status: "erro",
      erp_etapa_erro: 4,
      erp_erro: `Etapa 4 (Centro de custo): ${err.message}`,
      erp_payload: payload,
      erp_id: erpId,
    });
    return NextResponse.json({ error: err.message, etapa: 4 }, { status: 502 });
  }

  // ─── Etapa 5: Confirmar lançamento ────────────────────────────────────────
  try {
    const res = await fetch(`${M8_API_URL}/api/lancamentos/${erpId}/confirmar`, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
  } catch (err: any) {
    await salvarProgresso(supabase, despesaId, {
      erp_status: "erro",
      erp_etapa_erro: 5,
      erp_erro: `Etapa 5 (Confirmar lançamento): ${err.message}`,
      erp_payload: payload,
      erp_id: erpId,
    });
    return NextResponse.json({ error: err.message, etapa: 5 }, { status: 502 });
  }

  // ─── Etapa 6: Registrar na auditoria ──────────────────────────────────────
  await supabase.from("auditoria").insert({
    user_id: userId,
    acao: "UPDATE",
    entidade: "despesa",
    entidade_id: despesaId,
    detalhes: `Integração ERP M8 concluída — ERP ID: ${erpId}`,
  });

  // ─── Sucesso: grava resultado final ───────────────────────────────────────
  await salvarProgresso(supabase, despesaId, {
    lancado_erp: true,
    lancado_erp_em: new Date().toISOString(),
    lancado_erp_por: userId,
    erp_status: "integrado",
    erp_id: erpId,
    erp_etapa_erro: null,
    erp_erro: null,
    erp_payload: payload,
    erp_resposta: { erpId, integradoEm: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, erp_id: erpId });
}

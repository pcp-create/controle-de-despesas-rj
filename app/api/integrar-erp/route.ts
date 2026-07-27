import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function salvarProgresso(
  supabase: ReturnType<typeof createClient>,
  despesaId: string,
  campos: Record<string, unknown>
) {
  await supabase
    .from("despesas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", despesaId);
}

export async function POST(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json({ error: "Service key não configurada" }, { status: 500 });
  }

  // ─── Verifica variáveis M8 ─────────────────────────────────────────────────
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
    return NextResponse.json(
      {
        error: `Variáveis de ambiente não configuradas: ${varsFaltando.join(", ")}. Configure-as em Settings → Vars no painel do projeto.`,
        simulado: true,
        etapa: null,
      },
      { status: 503 }
    );
  }

  // ─── Parse do body ─────────────────────────────────────────────────────────
  const { despesaId, userId } = await request.json();
  if (!despesaId || !userId) {
    return NextResponse.json({ error: "despesaId e userId são obrigatórios" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ─── Busca despesa + relacionamentos ──────────────────────────────────────
  const { data: despesa, error: despesaErr } = await supabase
    .from("despesas")
    .select(`
      *,
      tipo:tipos_despesa(*),
      tecnico:profiles!despesas_tecnico_id_fkey(*),
      aprovador:profiles!despesas_gestor_aprovador_id_fkey(*)
    `)
    .eq("id", despesaId)
    .single();

  if (despesaErr || !despesa) {
    return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 });
  }

  if (despesa.erp_status === "processando") {
    return NextResponse.json({ error: "Integração já em andamento" }, { status: 409 });
  }
  if (despesa.erp_status === "integrado" && despesa.lancado_erp) {
    return NextResponse.json({ error: "Despesa já integrada ao ERP" }, { status: 409 });
  }

  // ─── Validação de campos obrigatórios ─────────────────────────────────────
  const tipo    = (despesa as any).tipo;
  const tecnico = (despesa as any).tecnico;

  const { data: cc } = await supabase
    .from("tipos_despesa_centro_custo")
    .select("centro_custo_erp")
    .eq("tipo_despesa_id", despesa.tipo_despesa_id)
    .eq("area", tecnico?.area || "")
    .maybeSingle();

  const camposFaltando: string[] = [];
  if (!despesa.tipo_despesa_id)              camposFaltando.push("Tipo de despesa");
  if (!tipo?.codigo_produto_erp)             camposFaltando.push(`Código de Produto ERP M8 no tipo "${tipo?.nome || "—"}"`);
  if (!tecnico?.area)                        camposFaltando.push("Área / Setor do técnico responsável");
  if (!cc?.centro_custo_erp)                 camposFaltando.push(`Centro de Custo ERP M8 para a área "${tecnico?.area || "—"}" no tipo "${tipo?.nome || "—"}"`);
  if (!despesa.data_despesa)                 camposFaltando.push("Data da despesa");
  if (!despesa.valor || despesa.valor <= 0)  camposFaltando.push("Valor da despesa");
  if (!despesa.cliente)                      camposFaltando.push("Cliente / OS");
  if (!despesa.documento)                    camposFaltando.push("Documento / Nota fiscal");

  if (camposFaltando.length > 0) {
    return NextResponse.json(
      { error: "Campos obrigatórios incompletos para integração com o ERP M8", campos: camposFaltando, etapa: 0 },
      { status: 422 }
    );
  }

  // ─── Marca como processando ───────────────────────────────────────────────
  await salvarProgresso(supabase, despesaId, {
    erp_status: "processando",
    erp_erro: null,
    erp_etapa_erro: null,
  });

  // ─── Payload base ─────────────────────────────────────────────────────────
  const centroCusto   = cc!.centro_custo_erp!;
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

  // ─── Etapa 1: Autenticação ────────────────────────────────────────────────
  try {
    const companyNum = parseInt(M8_COMPANY!, 10);
    const loginBody: Record<string, unknown> = {
      tenant:   M8_TENANT,
      username: M8_USERNAME,
      password: M8_PASSWORD,
      company:  isNaN(companyNum) ? M8_COMPANY : companyNum,
      domain:   M8_DOMAIN || "",
    };

    const loginUrl = `${M8_API_URL}/api/login`;
    console.log("[v0] M8 Etapa 1 — URL:", loginUrl);
    console.log("[v0] M8 Etapa 1 — body:", JSON.stringify({ ...loginBody, password: "***" }));

    let res: Response;
    try {
      res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginBody),
      });
    } catch (fetchErr: any) {
      const causa = fetchErr?.cause?.message || fetchErr?.cause?.code || fetchErr.message;
      console.log("[v0] M8 Etapa 1 — fetch error:", causa);
      throw new Error(`Não foi possível conectar ao servidor M8 (${loginUrl}). Verifique se M8_API_URL está correto e inclui o protocolo https://. Causa: ${causa}`);
    }

    console.log("[v0] M8 Etapa 1 — status HTTP:", res.status);
    const rawBody = await res.text();
    console.log("[v0] M8 Etapa 1 — resposta:", rawBody.slice(0, 300));

    let body: any;
    try { body = JSON.parse(rawBody); } catch { body = { message: rawBody }; }

    if (!res.ok || !body.token) {
      console.log("[v0] M8 Etapa 1 — resposta completa:", JSON.stringify(body));
      throw new Error(body.message || body.error || body.detail || body.msg || `HTTP ${res.status}`);
    }
    token = body.token;
  } catch (err: any) {
    await salvarProgresso(supabase, despesaId, {
      erp_status: "erro",
      erp_etapa_erro: 1,
      erp_erro: err.message,
      erp_payload: payload,
    });
    return NextResponse.json({ error: err.message, etapa: 1 }, { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Tenant": M8_TENANT!,
    "X-Company": M8_COMPANY!,
  };

  // ─── Etapa 2: Criar lançamento ────────────────────────────────────────────
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
      erpId = body.documentoFiscalId || body.id || body.lancamentoId || null;
      if (!erpId) throw new Error("ERP não retornou ID do documento fiscal");
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

  // ─── Etapa 3: Anexar comprovante ──────────────────────────────────────────
  if ((despesa as any).comprovante_url) {
    try {
      const res = await fetch(`${M8_API_URL}/api/lancamentos/${erpId}/anexos`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: (despesa as any).comprovante_url,
          nome: (despesa as any).comprovante_nome,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).message || `HTTP ${res.status}`);
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

  // ─── Etapa 4: Vincular centro de custo ────────────────────────────────────
  try {
    const res = await fetch(`${M8_API_URL}/api/lancamentos/${erpId}/centrocusto`, {
      method: "POST",
      headers,
      body: JSON.stringify({ centroCusto, percentual: 100 }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).message || `HTTP ${res.status}`);
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
      throw new Error((body as any).message || `HTTP ${res.status}`);
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

  // ─── Etapa 6: Auditoria interna ───────────────────────────────────────────
  await supabase.from("auditoria").insert({
    user_id: userId,
    acao: "UPDATE",
    entidade: "despesa",
    entidade_id: despesaId,
    detalhes: `Integração ERP M8 concluída — Documento Fiscal ID: ${erpId}`,
  });

  // ─── Sucesso ──────────────────────────────────────────────────────────────
  await salvarProgresso(supabase, despesaId, {
    lancado_erp: true,
    lancado_erp_em: new Date().toISOString(),
    lancado_erp_por: userId,
    erp_status: "integrado",
    erp_id: erpId,
    erp_etapa_erro: null,
    erp_erro: null,
    erp_payload: payload,
    erp_resposta: { documentoFiscalId: erpId, integradoEm: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, erp_id: erpId });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const textFields = ["cliente", "numero_os", "observacao", "data_despesa", "data_vencimento", "tipo_despesa_id", "cartao_id", "documento", "pagamento_tipo", "frota_id", "tipo_combustivel", "hora_despesa", "data_checkin", "data_checkout", "comprovante_nome", "comprovante_url"];
const numberFields = ["valor", "km_atual", "litros_abastecidos", "valor_litro", "numero_diarias", "numero_parcelas"];

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("perfil,ativo").eq("id", user.id).single();
  if (profileError || !profile?.ativo || !["administrador", "financeiro"].includes(profile.perfil)) {
    return NextResponse.json({ error: "Somente Administrador e Financeiro podem corrigir despesas." }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); }
  if (!body || typeof body.id !== "string" || !body.campos || typeof body.campos !== "object" || Array.isArray(body.campos)) {
    return NextResponse.json({ error: "Informe a despesa e os campos a corrigir" }, { status: 400 });
  }
  const campos: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.campos)) {
    if (!textFields.includes(key) && !numberFields.includes(key)) return NextResponse.json({ error: "Campo não permitido: " + key }, { status: 400 });
    if (textFields.includes(key) && value !== null && typeof value !== "string") return NextResponse.json({ error: "Campo inválido: " + key }, { status: 400 });
    if (numberFields.includes(key) && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return NextResponse.json({ error: "Valor inválido: " + key }, { status: 400 });
    campos[key] = value;
  }
  if (!(typeof campos.valor === "number" && campos.valor > 0) || !campos.tipo_despesa_id || !campos.data_despesa || !["cartao", "dinheiro", "faturado", "boleto"].includes(String(campos.pagamento_tipo))) {
    return NextResponse.json({ error: "Preencha tipo, data, pagamento e valor maior que zero." }, { status: 400 });
  }
  if ("numero_parcelas" in campos && (body.grupoCompleto !== true || !Number.isInteger(campos.numero_parcelas) || Number(campos.numero_parcelas) < 1 || Number(campos.numero_parcelas) > 48)) {
    return NextResponse.json({ error: "Informe entre 1 e 48 parcelas para o grupo completo." }, { status: 400 });
  }
  if (campos.pagamento_tipo !== "cartao") campos.cartao_id = null;
  if (body.grupoCompleto === true) {
    const { data, error } = await supabase.rpc("corrigir_despesa_grupo", { p_id: body.id, p_campos: campos });
    if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "A atualização do banco para edição do grupo ainda não foi aplicada." : error.message }, { status: 400 });
    return NextResponse.json({ data });
  }
  // Atualiza somente esta despesa/parcela, preservando aprovação, titular e integração.
  const { data, error } = await supabase.from("despesas").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", body.id).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Despesa não encontrada ou sem permissão para editar." }, { status: 400 });
  return NextResponse.json({ data });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceRoleClient } from "@/lib/supabase/require-admin";
import { avaliarElegibilidade, type DespesaElegivel } from "@/lib/backup-comprovantes";

/**
 * Lista despesas elegíveis para backup/exclusão de comprovante até a data de
 * corte informada. Somente leitura — nenhum arquivo é tocado aqui.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(["administrador", "financeiro"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const corteData = request.nextUrl.searchParams.get("corte");
  if (!corteData || !/^\d{4}-\d{2}-\d{2}$/.test(corteData)) {
    return NextResponse.json({ error: "Informe uma data de corte válida (AAAA-MM-DD)." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("despesas")
    .select(
      "id, data_despesa, status_erp, status_aprovacao, comprovante_url, comprovante_nome, comprovante_arquivado_em, valor, cliente, numero_os, tecnico_id, lancado_sistema, profiles:tecnico_id(nome)",
    )
    .not("comprovante_url", "is", null)
    .is("comprovante_arquivado_em", null)
    .eq("lancado_sistema", true)
    .lte("data_despesa", corteData)
    .order("data_despesa", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: `Erro ao buscar despesas: ${error.message}` }, { status: 500 });
  }

  const elegiveis = (data ?? [])
    .map((d) => {
      const despesa = d as unknown as DespesaElegivel & { profiles: { nome: string } | null };
      const resultado = avaliarElegibilidade(despesa, corteData);
      return { despesa, resultado };
    })
    .filter((item) => item.resultado.elegivel)
    .map((item) => ({
      id: item.despesa.id,
      dataDespesa: item.despesa.data_despesa,
      cliente: item.despesa.cliente,
      numeroOs: item.despesa.numero_os,
      valor: item.despesa.valor,
      comprovanteNome: item.despesa.comprovante_nome,
      tecnicoNome: (item.despesa as unknown as { profiles: { nome: string } | null }).profiles?.nome ?? "—",
    }));

  return NextResponse.json({
    corteData,
    total: elegiveis.length,
    itens: elegiveis,
  });
}

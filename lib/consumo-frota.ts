import type { Despesa } from "@/lib/supabase/hooks";

/**
 * Percentual mínimo do consumo esperado. Se o consumo real (km/l) ficar
 * abaixo de 80% da média cadastrada da frota, os apontamentos de KM são
 * considerados insuficientes para o total abastecido e um alerta é gerado.
 */
export const LIMITE_CONSUMO = 0.8;

export interface AlertaConsumo {
  despesaId: string;
  frotaId: string;
  placa: string;
  modelo: string;
  data: string;
  litros: number;
  kmRodado: number;
  consumoReal: number; // km por litro efetivamente rodado
  consumoEsperado: number; // km/l cadastrado na frota
  percentual: number; // consumoReal / consumoEsperado
  valor: number;
}

/**
 * Retorna true se a despesa é um abastecimento válido para análise
 * (possui frota, odômetro e litros informados).
 */
export function isAbastecimento(d: Despesa): boolean {
  return (
    !!d.frota_id &&
    typeof d.km_atual === "number" &&
    d.km_atual > 0 &&
    typeof d.litros_abastecidos === "number" &&
    d.litros_abastecidos > 0
  );
}

/**
 * Avalia um único abastecimento contra o abastecimento imediatamente
 * anterior da mesma frota. Retorna um alerta quando o consumo real
 * (km rodado entre abastecimentos ÷ litros) fica abaixo do limite
 * em relação à média km/l cadastrada. Retorna null se não houver base
 * suficiente para comparação ou se o consumo estiver adequado.
 */
export function avaliarAbastecimento(
  atual: Despesa,
  anteriores: Despesa[],
): AlertaConsumo | null {
  if (!isAbastecimento(atual)) return null;

  const media = atual.frota?.km_media_litro ?? null;
  if (!media || media <= 0) return null; // frota sem média cadastrada

  // Abastecimento anterior da MESMA frota, com odômetro menor e data anterior
  const anterior = anteriores
    .filter(
      (d) =>
        d.id !== atual.id &&
        d.frota_id === atual.frota_id &&
        isAbastecimento(d) &&
        (d.km_atual as number) < (atual.km_atual as number),
    )
    .sort((a, b) => (b.km_atual as number) - (a.km_atual as number))[0];

  if (!anterior) return null; // sem base de comparação

  const kmRodado = (atual.km_atual as number) - (anterior.km_atual as number);
  const litros = atual.litros_abastecidos as number;
  if (kmRodado <= 0 || litros <= 0) return null;

  const consumoReal = kmRodado / litros;
  const percentual = consumoReal / media;

  if (percentual >= LIMITE_CONSUMO) return null; // consumo adequado

  return {
    despesaId: atual.id,
    frotaId: atual.frota_id as string,
    placa: atual.frota?.placa ?? "—",
    modelo: atual.frota?.modelo ?? "",
    data: atual.data_despesa ?? atual.created_at,
    litros,
    kmRodado,
    consumoReal,
    consumoEsperado: media,
    percentual,
    valor: atual.valor,
  };
}

/**
 * Analisa todas as despesas e retorna a lista de alertas de consumo,
 * calculados na hora (sem persistência). Ordenado do desvio mais grave
 * para o menos grave.
 */
export function gerarAlertasConsumo(despesas: Despesa[]): AlertaConsumo[] {
  const abastecimentos = despesas.filter(isAbastecimento);
  const alertas: AlertaConsumo[] = [];

  for (const abast of abastecimentos) {
    const alerta = avaliarAbastecimento(abast, abastecimentos);
    if (alerta) alertas.push(alerta);
  }

  return alertas.sort((a, b) => a.percentual - b.percentual);
}

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
 * Avalia um único abastecimento comparando o km rodado esperado
 * (litros × km_media_litro da frota) com o km informado entre o
 * abastecimento anterior e o atual. Usa o km_atual da frota (último
 * registrado) como base quando não há abastecimento anterior.
 * Retorna alerta se o consumo real ficar abaixo de 80% do esperado.
 */
export function avaliarAbastecimento(
  atual: Despesa,
  anteriores: Despesa[],
  frotaKmAtual?: number, // km_atual cadastrado na frota antes deste abastecimento
): AlertaConsumo | null {
  if (!isAbastecimento(atual)) return null;

  const media = atual.frota?.km_media_litro ?? null;
  if (!media || media <= 0) return null; // frota sem média cadastrada

  const litros = atual.litros_abastecidos as number;
  const kmOdometroAtual = atual.km_atual as number;

  // Tenta obter o km do abastecimento anterior da mesma frota
  const anterior = anteriores
    .filter(
      (d) =>
        d.id !== atual.id &&
        d.frota_id === atual.frota_id &&
        isAbastecimento(d) &&
        (d.km_atual as number) < kmOdometroAtual,
    )
    .sort((a, b) => (b.km_atual as number) - (a.km_atual as number))[0];

  // Usa km do anterior, ou km atual da frota no cadastro, ou nenhum
  const kmBase = anterior
    ? (anterior.km_atual as number)
    : frotaKmAtual && frotaKmAtual < kmOdometroAtual
    ? frotaKmAtual
    : null;

  if (!kmBase) return null; // sem base de comparação

  const kmRodado = kmOdometroAtual - kmBase;
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
    const frotaKm = (abast.frota as any)?.quilometragem ?? undefined;
    const alerta = avaliarAbastecimento(abast, abastecimentos, frotaKm);
    if (alerta) alertas.push(alerta);
  }

  return alertas.sort((a, b) => a.percentual - b.percentual);
}

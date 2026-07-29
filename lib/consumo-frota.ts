/**
 * consumo-frota.ts
 * Compara os apontamentos de KM (controle_km) com o total esperado
 * para o combustível abastecido. Retorna alerta quando o km apontado
 * fica abaixo de 80% do km esperado (litros × km_media_litro da frota).
 */

import type { Despesa, ControleKm } from "@/lib/supabase/hooks";

/** Tolerância: abaixo de 80% do esperado gera alerta */
export const LIMITE_CONSUMO = 0.8;

export interface AlertaConsumo {
  id: string;        // chave única: `${frotaId}_${data.slice(0,10)}`
  frotaId: string;
  placa: string;
  modelo: string;
  data: string;
  litros: number;
  kmApontado: number;
  kmEsperado: number;
  percentual: number; // kmApontado / kmEsperado
  valor: number;
}

/** Verifica se a despesa é um abastecimento com dados suficientes */
export function isAbastecimento(d: Despesa): boolean {
  return (
    !!d.frota_id &&
    typeof d.litros_abastecidos === "number" &&
    d.litros_abastecidos > 0
  );
}

/**
 * Avalia um abastecimento comparando:
 *   kmEsperado = litros × km_media_litro  (o que a frota deveria ter rodado)
 *   kmApontado = soma de km_percorrido nos apontamentos de controle_km
 *                da mesma frota, finalizados após o último abastecimento anterior.
 *
 * Se não houver apontamentos, kmApontado = 0 → sempre gera alerta.
 * Retorna null se a frota não tiver km_media_litro cadastrado.
 */
export function avaliarAbastecimento(
  despesa: Despesa,
  apontamentos: ControleKm[],
  dataUltimoAbastecimento?: string | null,
): AlertaConsumo | null {
  if (!isAbastecimento(despesa)) return null;

  const media = despesa.frota?.km_media_litro ?? null;
  if (!media || media <= 0) return null;

  const litros = despesa.litros_abastecidos as number;
  const kmEsperado = litros * media;

  // Apontamentos da mesma frota finalizados após o último abastecimento
  const dataCorte = dataUltimoAbastecimento ?? "1970-01-01T00:00:00";
  const kmApontado = apontamentos
    .filter(
      (a) =>
        a.frota_id === despesa.frota_id &&
        a.status === "finalizado" &&
        typeof a.km_percorrido === "number" &&
        a.km_percorrido > 0 &&
        (a.data_fim ?? a.data_inicio) > dataCorte,
    )
    .reduce((sum, a) => sum + (a.km_percorrido ?? 0), 0);

  const percentual = kmEsperado > 0 ? kmApontado / kmEsperado : 0;

  if (percentual >= LIMITE_CONSUMO) return null;

  const data = despesa.data_despesa ?? despesa.created_at;
  return {
    id: `${despesa.frota_id}_${data.slice(0, 10)}`,
    frotaId: despesa.frota_id as string,
    placa: despesa.frota?.placa ?? "—",
    modelo: despesa.frota?.modelo ?? "",
    data,
    litros,
    kmApontado,
    kmEsperado,
    percentual,
    valor: despesa.valor,
  };
}

/**
 * Gera todos os alertas de consumo a partir da lista completa de despesas
 * e apontamentos. Usado no Dashboard e na página de Frotas.
 */
export function gerarAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
): AlertaConsumo[] {
  const abastecimentos = despesas
    .filter(isAbastecimento)
    .sort(
      (a, b) =>
        new Date(a.data_despesa ?? a.created_at).getTime() -
        new Date(b.data_despesa ?? b.created_at).getTime(),
    );

  const alertas: AlertaConsumo[] = [];

  for (const abast of abastecimentos) {
    const anterior = abastecimentos
      .filter(
        (d) =>
          d.id !== abast.id &&
          d.frota_id === abast.frota_id &&
          new Date(d.data_despesa ?? d.created_at) <
            new Date(abast.data_despesa ?? abast.created_at),
      )
      .sort(
        (a, b) =>
          new Date(b.data_despesa ?? b.created_at).getTime() -
          new Date(a.data_despesa ?? a.created_at).getTime(),
      )[0];

    const dataUltimo = anterior
      ? (anterior.data_despesa ?? anterior.created_at)
      : null;

    const alerta = avaliarAbastecimento(abast, apontamentos, dataUltimo);
    if (alerta) alertas.push(alerta);
  }

  return alertas.sort((a, b) => a.percentual - b.percentual);
}

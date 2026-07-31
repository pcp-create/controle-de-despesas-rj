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

export interface ResultadoConsumo {
  frotaId: string;
  placa: string;
  modelo: string;
  dataFim: string;       // ISO — limite superior da janela (data/hora do novo abastecimento)
  litros: number;
  kmApontado: number;
  kmEsperado: number;
  percentual: number;
  temAlerta: boolean;    // true se percentual < LIMITE_CONSUMO
  valor: number;
}

/**
 * Calcula o consumo da frota ao registrar um novo abastecimento.
 * Avalia o abastecimento ANTERIOR (não o atual) comparando:
 *   - kmEsperado = litros do abastecimento anterior × km_media_litro da frota
 *   - kmApontado = soma de apontamentos finalizados entre a data/hora do
 *     abastecimento anterior e a data/hora do novo abastecimento
 *
 * Usa horário LOCAL (sem Z) para as datas digitadas pelo usuário.
 * Aceita km_percorrido ou calcula km_final - km_inicial como fallback.
 *
 * Retorna null se não houver abastecimento anterior ou km_media_litro.
 */
export function calcularConsumoFrota(opts: {
  frotaId: string;
  placa: string;
  modelo: string;
  kmMediaLitro: number;
  valorAbastecimento: number;
  novoAbastecimentoId: string;
  /** "YYYY-MM-DD" */
  novaDataDespesa: string;
  /** "HH:MM" — horário local digitado pelo usuário */
  novaHoraDespesa: string | null;
  despesas: Despesa[];
  apontamentos: ControleKm[];
}): ResultadoConsumo | null {
  const {
    frotaId, placa, modelo, kmMediaLitro, valorAbastecimento,
    novoAbastecimentoId, novaDataDespesa, novaHoraDespesa,
    despesas, apontamentos,
  } = opts;

  if (!kmMediaLitro || kmMediaLitro <= 0) return null;

  // Converte data+hora LOCAL para ms (sem Z para não tratar como UTC)
  const toLocalMs = (dateStr: string, timeStr: string) =>
    new Date(`${dateStr.slice(0, 10)}T${timeStr}`).getTime();

  const fimJanelaMs = toLocalMs(
    novaDataDespesa,
    novaHoraDespesa ? `${novaHoraDespesa}:00` : "23:59:59",
  );

  // Abastecimento anterior (mais recente antes do atual)
  const ultimoAbast = despesas
    .filter(
      (d) =>
        d.frota_id === frotaId &&
        d.id !== novoAbastecimentoId &&
        typeof d.litros_abastecidos === "number" &&
        d.litros_abastecidos > 0,
    )
    .sort(
      (a, b) =>
        new Date(b.data_despesa ?? b.created_at).getTime() -
        new Date(a.data_despesa ?? a.created_at).getTime(),
    )[0] ?? null;

  if (!ultimoAbast) return null;

  const horaInicio = (ultimoAbast as Despesa & { hora_despesa?: string | null }).hora_despesa ?? "00:00:00";
  const inicioJanelaMs = toLocalMs(
    ultimoAbast.data_despesa.slice(0, 10),
    horaInicio,
  );

  const litros = ultimoAbast.litros_abastecidos as number;
  const kmEsperado = litros * kmMediaLitro;

  // Filtra apontamentos dentro da janela com fallback km_final - km_inicial
  const kmPorApontamento = (a: ControleKm): number => {
    if (typeof a.km_percorrido === "number" && a.km_percorrido > 0) return a.km_percorrido;
    if (typeof a.km_final === "number" && typeof a.km_inicial === "number") return a.km_final - a.km_inicial;
    return 0;
  };

  const kmApontado = apontamentos
    .filter((a) => {
      if (a.frota_id !== frotaId) return false;
      if (a.status !== "finalizado") return false;
      if (kmPorApontamento(a) <= 0) return false;
      const dataApontMs = new Date(a.data_fim ?? a.data_inicio).getTime();
      return dataApontMs >= inicioJanelaMs && dataApontMs <= fimJanelaMs;
    })
    .reduce((sum, a) => sum + kmPorApontamento(a), 0);

  const percentual = kmEsperado > 0 ? kmApontado / kmEsperado : 0;

  return {
    frotaId,
    placa,
    modelo,
    dataFim: new Date(fimJanelaMs).toISOString(),
    litros,
    kmApontado,
    kmEsperado,
    percentual,
    temAlerta: percentual < LIMITE_CONSUMO,
    valor: valorAbastecimento,
  };
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

  // Normaliza datas para timestamps comparáveis
  const dataCorteMs = dataUltimoAbastecimento
    ? new Date(dataUltimoAbastecimento).getTime()
    : 0;
  const dataAbastMs = new Date(despesa.data_despesa ?? despesa.created_at).getTime();

  // Apontamentos da mesma frota finalizados dentro da janela:
  // - após o abastecimento anterior (dataCorte)
  // - até o dia do abastecimento atual (inclusive — usa data_inicio para não perder apontamentos em andamento no dia)
  const kmApontado = apontamentos
    .filter((a) => {
      if (a.frota_id !== despesa.frota_id) return false;
      if (a.status !== "finalizado") return false;
      if (typeof a.km_percorrido !== "number" || a.km_percorrido <= 0) return false;
      // Usa data_fim se disponível, senão data_inicio
      const dataApontMs = new Date(a.data_fim ?? a.data_inicio).getTime();
      return dataApontMs > dataCorteMs && dataApontMs <= dataAbastMs + 86400000; // +1 dia de tolerância
    })
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
 * Persiste os alertas calculados no banco via API route.
 * Deve ser chamado após um abastecimento ser salvo, passando o id do
 * abastecimento recém-criado para excluí-lo da avaliação (ainda não
 * tem apontamentos — o funcionário ainda vai rodar com esse tanque).
 *
 * Para frotas cujo abastecimento anterior ficou acima de 80%, remove
 * o alerta ativo e atualiza o último cálculo normalmente.
 */
export async function persistirAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
  novoAbastecimentoId?: string,
): Promise<void> {
  // Exclui o abastecimento recém-criado — ainda não possui apontamentos e
  // geraria um falso alerta (0% apontado).
  const despesasParaAvaliar = novoAbastecimentoId
    ? despesas.filter((d) => d.id !== novoAbastecimentoId)
    : despesas;

  const alertas = gerarAlertasConsumo(despesasParaAvaliar, apontamentos);

  // Coleta as frotas dos abastecimentos avaliados (excluindo o novo)
  const frotasAvaliadas = new Set(
    despesasParaAvaliar.filter(isAbastecimento).map((d) => d.frota_id as string),
  );

  // Alertas com problema (abaixo de 80%) — um por frota (o mais recente)
  const alertasPorFrota = new Map<string, AlertaConsumo>();
  for (const a of alertas) {
    if (!alertasPorFrota.has(a.frotaId)) alertasPorFrota.set(a.frotaId, a);
  }

  // Para cada frota avaliada: persiste alerta se houver, ou limpa se estiver OK
  await Promise.all(
    Array.from(frotasAvaliadas).map((frotaId) => {
      const alerta = alertasPorFrota.get(frotaId);
      if (alerta) {
        // Frota com problema: persiste alerta ativo
        return fetch("/api/alertas-consumo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alerta, ativo: true }),
        });
      } else {
        // Frota OK (acima de 80%): limpa alerta_ativo na frota via API
        return fetch("/api/alertas-consumo/limpar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frotaId }),
        });
      }
    }),
  );
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

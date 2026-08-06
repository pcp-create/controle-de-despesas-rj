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

  const fimJanelaMs = abastecimentoUtcMs(novaDataDespesa, novaHoraDespesa);

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

  const horaInicio = (ultimoAbast as Despesa & { hora_despesa?: string | null }).hora_despesa;
  const inicioJanelaMs = abastecimentoUtcMs(ultimoAbast.data_despesa.slice(0, 10), horaInicio);

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
      const dataApontMs = apontamentoUtcMs(a);
      return dataApontMs > inicioJanelaMs && dataApontMs <= fimJanelaMs;
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

export interface JanelaAutonomia {
  dataInicio: string;  // ISO — data/hora do abastecimento anterior
  dataFim: string;     // ISO — data/hora do abastecimento avaliado
  litros: number;
  kmApontado: number;
  kmPorLitro: number;  // kmApontado / litros
}

export interface AutonomiaFrota {
  frotaId: string;
  mediaKmPorLitro: number;  // média das janelas com km > 0
  totalJanelas: number;     // quantas janelas foram calculadas
  janelasMedidas: number;   // janelas com km apontado > 0
  janelas: JanelaAutonomia[];
}

/**
 * Calcula a autonomia média real de uma frota com base nos intervalos
 * entre abastecimentos consecutivos e nos apontamentos de KM.
 *
 * Para cada par (abastecimento N-1 → abastecimento N):
 *   - kmApontado = soma de apontamentos finalizados dentro da janela
 *   - kmPorLitro = kmApontado / litros do abastecimento N-1
 *
 * Retorna null se a frota não tiver pelo menos 2 abastecimentos.
 */
export function calcularAutonomiaMedia(
  frotaId: string,
  despesas: Despesa[],
  apontamentos: ControleKm[],
): AutonomiaFrota | null {
  const abastecimentos = despesas
    .filter(
      (d) =>
        d.frota_id === frotaId &&
        typeof d.litros_abastecidos === "number" &&
        d.litros_abastecidos > 0,
    )
    .sort(
      (a, b) =>
        new Date(a.data_despesa ?? a.created_at).getTime() -
        new Date(b.data_despesa ?? b.created_at).getTime(),
    );

  if (abastecimentos.length < 2) return null;

  const kmPorApontamento = (a: ControleKm): number => {
    if (typeof a.km_percorrido === "number" && a.km_percorrido > 0) return a.km_percorrido;
    if (typeof a.km_final === "number" && typeof a.km_inicial === "number") return a.km_final - a.km_inicial;
    return 0;
  };

  const janelas: JanelaAutonomia[] = [];

  for (let i = 0; i < abastecimentos.length - 1; i++) {
    const anterior = abastecimentos[i];
    const proximo  = abastecimentos[i + 1];
    const litros   = anterior.litros_abastecidos as number;

    const inicioMs = abastecimentoUtcMs(
      anterior.data_despesa ?? anterior.created_at.slice(0, 10),
      anterior.hora_despesa,
    );
    const fimMs = abastecimentoUtcMs(
      proximo.data_despesa ?? proximo.created_at.slice(0, 10),
      proximo.hora_despesa,
    );

    const kmApontado = apontamentos
      .filter((a) => {
        if (a.frota_id !== frotaId) return false;
        if (a.status !== "finalizado") return false;
        if (kmPorApontamento(a) <= 0) return false;
        const dataApontMs = apontamentoUtcMs(a);
        return dataApontMs > inicioMs && dataApontMs <= fimMs;
      })
      .reduce((sum, a) => sum + kmPorApontamento(a), 0);

    janelas.push({
      dataInicio: anterior.data_despesa ?? anterior.created_at,
      dataFim:    proximo.data_despesa  ?? proximo.created_at,
      litros,
      kmApontado,
      kmPorLitro: litros > 0 && kmApontado > 0 ? kmApontado / litros : 0,
    });
  }

  const janelasMedidas = janelas.filter((j) => j.kmPorLitro > 0);
  const mediaKmPorLitro =
    janelasMedidas.length > 0
      ? janelasMedidas.reduce((sum, j) => sum + j.kmPorLitro, 0) / janelasMedidas.length
      : 0;

  return {
    frotaId,
    mediaKmPorLitro,
    totalJanelas: janelas.length,
    janelasMedidas: janelasMedidas.length,
    janelas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calcularEstimativaVeiculo
// Fonte única de cálculo para estimativa KM vs Apontado por veículo.
// Usada por: RelatoriosPageSupabase, FrotasPageSupabase e geração de alertas.
// ─────────────────────────────────────────────────────────────────────────────

export interface EstimativaVeiculoOpts {
  frotaId: string;
  /** YYYY-MM-DD — início do período */
  periodoIni: string;
  /** YYYY-MM-DD — fim do período (inclusive) */
  periodoFim: string;
  /** Média km/L cadastrada na frota (fallback quando não há histórico) */
  frotaKmMedia: number | null;
  /** Todos os registros de despesa (qualquer funcionário, qualquer frota) */
  todasDespesas: Despesa[];
  /** Todos os registros de controle_km (qualquer funcionário, qualquer frota) */
  todosRegistrosKm: ControleKm[];
  /** Quando definido, filtra apontamentos do período somente deste usuário */
  usuarioId?: string | null;
}

export interface EstimativaVeiculoResult {
  frotaId: string;
  /** km/L média histórica real calculada a partir das janelas de abastecimento */
  mediaKmLReal: number | null;
  /** km/L usada no cálculo (real > cadastrada > null) */
  mediaUsada: number;
  /** true quando mediaUsada vem do cadastro, não do histórico */
  estimativa: boolean;
  /** false quando não há dados suficientes para calcular a média (< 2 abastecimentos) */
  dadosSuficientes: boolean;
  /** Litros estimados no início do período (saldo do histórico anterior) */
  saldoInicial: number;
  /** Litros abastecidos dentro do período */
  litrosPeriodo: number;
  /** saldoInicial + litrosPeriodo */
  combustivelDisponivel: number;
  /** combustivelDisponivel × mediaUsada */
  kmEstimado: number;
  /** Soma de km percorridos nos apontamentos finalizados dentro do período */
  kmApontado: number;
  /** kmEstimado − kmApontado */
  diferenca: number;
  /** kmApontado / kmEstimado × 100, null quando kmEstimado = 0 */
  percentual: number | null;
  /** combustivelDisponivel − (kmApontado / mediaUsada), mínimo 0 */
  saldoFinal: number;
  /** true quando há alerta (percentual < LIMITE_CONSUMO × 100 e kmEstimado > 0) */
  temAlerta: boolean;
}

/** Helper reutilizável: km percorrido de um apontamento */
export function kmPercorridoApontamento(a: ControleKm): number {
  if (typeof a.km_percorrido === "number" && a.km_percorrido > 0) return a.km_percorrido;
  if (typeof a.km_final === "number" && typeof a.km_inicial === "number") return a.km_final - a.km_inicial;
  return 0;
}

/** Helper: verifica se a despesa é abastecimento de combustível com litros */
export function isCombustivelComLitros(d: Despesa): boolean {
  return (
    !!(d.tipo_despesa?.nome?.toLowerCase().includes("combust")) &&
    typeof d.litros_abastecidos === "number" &&
    d.litros_abastecidos > 0
  );
}

/**
 * Calcula a média histórica real de consumo (km/L) de um veículo
 * percorrendo todos os intervalos entre abastecimentos consecutivos.
 * Requer pelo menos 2 abastecimentos; retorna null caso contrário.
 */
export function calcularMediaHistorica(
  frotaId: string,
  todasDespesas: Despesa[],
  todosRegistrosKm: ControleKm[],
): number | null {
  const abast = todasDespesas
    .filter((d) => d.frota_id === frotaId && isCombustivelComLitros(d))
    .sort((a, b) => (a.data_despesa ?? "").localeCompare(b.data_despesa ?? ""));

  if (abast.length < 2) return null;

  const razoes: number[] = [];
  for (let i = 0; i < abast.length - 1; i++) {
    const litros = abast[i].litros_abastecidos as number;
    const iniMs = new Date((abast[i].data_despesa ?? abast[i].created_at) + "T12:00:00").getTime();
    const fimMs = new Date((abast[i + 1].data_despesa ?? abast[i + 1].created_at) + "T12:00:00").getTime();
    const kmJanela = todosRegistrosKm
      .filter((r) => {
        if (r.frota_id !== frotaId) return false;
        if ((r.status as string) !== "finalizado") return false;
        const dMs = new Date((r.data_fim ?? r.data_inicio) + "T12:00:00").getTime();
        return dMs >= iniMs && dMs <= fimMs;
      })
      .reduce((s, r) => s + kmPercorridoApontamento(r), 0);
    if (litros > 0 && kmJanela > 0) razoes.push(kmJanela / litros);
  }
  if (razoes.length === 0) return null;
  return razoes.reduce((s, v) => s + v, 0) / razoes.length;
}

/**
 * Calcula o saldo estimado de combustível no início de um período,
 * percorrendo cronologicamente o histórico de abastecimentos e apontamentos anteriores.
 */
export function calcularSaldoInicial(opts: {
  frotaId: string;
  periodoIni: string;
  mediaUsada: number;
  todasDespesas: Despesa[];
  todosRegistrosKm: ControleKm[];
}): number {
  const { frotaId, periodoIni, mediaUsada, todasDespesas, todosRegistrosKm } = opts;
  if (!mediaUsada || mediaUsada <= 0) return 0;

  const abastAnt = todasDespesas
    .filter((d) => d.frota_id === frotaId && isCombustivelComLitros(d) && (d.data_despesa ?? "") < periodoIni)
    .sort((a, b) => (a.data_despesa ?? "").localeCompare(b.data_despesa ?? ""));

  if (abastAnt.length === 0) return 0;

  let saldo = 0;
  for (let i = 0; i < abastAnt.length; i++) {
    const abat = abastAnt[i];
    saldo += abat.litros_abastecidos as number;

    const iniMs = new Date((abat.data_despesa ?? abat.created_at) + "T12:00:00").getTime();
    const proximoStr = abastAnt[i + 1]?.data_despesa ?? periodoIni;
    const fimMs = new Date(proximoStr + "T12:00:00").getTime();

    const kmJanela = todosRegistrosKm
      .filter((r) => {
        if (r.frota_id !== frotaId) return false;
        if ((r.status as string) !== "finalizado") return false;
        const dMs = new Date((r.data_fim ?? r.data_inicio) + "T12:00:00").getTime();
        return dMs >= iniMs && dMs < fimMs;
      })
      .reduce((s, r) => s + kmPercorridoApontamento(r), 0);

    saldo = Math.max(0, saldo - kmJanela / mediaUsada);
  }
  return saldo;
}

/**
 * FONTE ÚNICA DE CÁLCULO para estimativa KM vs Apontado por veículo.
 *
 * Utilizada por:
 *  - RelatoriosPageSupabase (estimativaKmFuncionario)
 *  - FrotasPageSupabase (card de consumo por veículo)
 *  - Geração de alertas de apontamento insuficiente
 */
export function calcularEstimativaVeiculo(opts: EstimativaVeiculoOpts): EstimativaVeiculoResult {
  const {
    frotaId, periodoIni, periodoFim,
    frotaKmMedia, todasDespesas, todosRegistrosKm, usuarioId,
  } = opts;

  // 1. Média histórica real (todos os abastecimentos do veículo, sem filtro de funcionário)
  const mediaKmLReal = calcularMediaHistorica(frotaId, todasDespesas, todosRegistrosKm);
  const mediaUsada = mediaKmLReal ?? frotaKmMedia ?? 0;
  const dadosSuficientes = mediaKmLReal !== null || (frotaKmMedia != null && frotaKmMedia > 0);
  const estimativa = mediaKmLReal === null && dadosSuficientes;

  // 2. Saldo inicial estimado
  const saldoInicial = mediaUsada > 0
    ? calcularSaldoInicial({ frotaId, periodoIni, mediaUsada, todasDespesas, todosRegistrosKm })
    : 0;

  // 3. Litros abastecidos dentro do período
  // Quando periodoIni/periodoFim são strings vazias, não há filtro de data (todo o histórico).
  const temFiltroPeriodo = !!periodoIni && !!periodoFim;
  const litrosPeriodo = todasDespesas
    .filter((d) => {
      if (d.frota_id !== frotaId) return false;
      if (!isCombustivelComLitros(d)) return false;
      if (!temFiltroPeriodo) return true;
      const ds = d.data_despesa ?? "";
      return ds >= periodoIni && ds <= periodoFim;
    })
    .reduce((s, d) => s + (d.litros_abastecidos as number), 0);

  // 4. Combustível disponível e KM estimado
  const combustivelDisponivel = saldoInicial + litrosPeriodo;
  const kmEstimado = combustivelDisponivel * mediaUsada;

  // 5. KM apontado no per��odo (filtra por usuário se especificado)
  const kmApontado = todosRegistrosKm
    .filter((r) => {
      if (r.frota_id !== frotaId) return false;
      if ((r.status as string) !== "finalizado") return false;
      if (usuarioId && r.usuario_id !== usuarioId) return false;
      if (!temFiltroPeriodo) return true;
      const ds = (r.data_fim ?? r.data_inicio ?? "").slice(0, 10);
      return ds >= periodoIni && ds <= periodoFim;
    })
    .reduce((s, r) => s + kmPercorridoApontamento(r), 0);

  // 6. Derivados
  const diferenca = kmEstimado - kmApontado;
  const percentual = kmEstimado > 0 ? Math.round((kmApontado / kmEstimado) * 100) : null;
  const consumidoEstimado = mediaUsada > 0 ? kmApontado / mediaUsada : 0;
  const saldoFinal = Math.max(0, combustivelDisponivel - consumidoEstimado);
  const temAlerta = kmEstimado > 0 && percentual !== null && percentual < LIMITE_CONSUMO * 100;

  return {
    frotaId,
    mediaKmLReal: mediaKmLReal != null ? Math.round(mediaKmLReal * 100) / 100 : null,
    mediaUsada: Math.round(mediaUsada * 100) / 100,
    estimativa,
    dadosSuficientes,
    saldoInicial: Math.round(saldoInicial * 10) / 10,
    litrosPeriodo: Math.round(litrosPeriodo * 10) / 10,
    combustivelDisponivel: Math.round(combustivelDisponivel * 10) / 10,
    kmEstimado: Math.round(kmEstimado),
    kmApontado: Math.round(kmApontado),
    diferenca: Math.round(diferenca),
    percentual,
    saldoFinal: Math.round(saldoFinal * 10) / 10,
    temAlerta,
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
 *
 * Deve ser chamado após um abastecimento ser salvo ou um apontamento ser finalizado.
 * Os dados passados já devem estar atualizados (incluindo o novo registro).
 *
 * @param frotaId — quando fornecido, processa apenas esse veículo; caso contrário,
 *   processa todas as frotas com abastecimentos. Use sempre que possível para evitar
 *   sobrescrever alertas de outros veículos.
 */
export async function persistirAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
  frotaId?: string,
): Promise<void> {
  const alertas = gerarAlertasConsumo(despesas, apontamentos);

  // Coleta as frotas a avaliar: somente a especificada, ou todas com abastecimentos
  const todasFrotasComAbast = new Set(
    despesas.filter(isAbastecimento).map((d) => d.frota_id as string),
  );
  const frotasAvaliadas = frotaId
    ? (todasFrotasComAbast.has(frotaId) ? new Set([frotaId]) : new Set<string>())
    : todasFrotasComAbast;

  // Alertas com problema (abaixo de 80%) — um por frota (o mais recente)
  const alertasPorFrota = new Map<string, AlertaConsumo>();
  for (const a of alertas) {
    if (!alertasPorFrota.has(a.frotaId)) alertasPorFrota.set(a.frotaId, a);
  }

  // Para cada frota avaliada: persiste alerta se houver, ou limpa se estiver OK
  const resultados = await Promise.allSettled(
    Array.from(frotasAvaliadas).map((frotaId) => {
      const alerta = alertasPorFrota.get(frotaId);
      if (alerta) {
        // Frota com problema: persiste ou atualiza alerta via POST (fluxo normal).
        // POST protege alertas já tratados manualmente (resolvido_por != null) e
        // atualiza km_apontado/km_esperado/percentual quando o alerta ainda está ativo.
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

  // Loga erros sem mascarar — não bloqueia o fluxo principal pois o abastecimento já foi salvo
  for (const r of resultados) {
    if (r.status === "rejected") {
      console.error("[persistirAlertasConsumo] Falha ao persistir alerta:", r.reason);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalização de datas para comparação de janelas de abastecimento
//
// CAUSA DO BUG (TPY0G26 — 06/08/2026):
//   - data_inicio / data_fim em ControleKm são strings ISO completas em UTC
//     ex: "2026-08-06T17:13:45.000Z" (= 14:13:45 BRT)
//   - hora_despesa em Despesa é armazenada como "HH:mm" sem segundos
//     ex: "14:13" (representa 14:13:00 BRT, mas o apontamento finalizou 14:13:45 BRT)
//
// Quando o abastecimento ocorre no mesmo minuto do apontamento (14:13 BRT):
//   - fimMs calculado sem correção = 14:13:00 BRT → 17:13:00 UTC
//   - data_fim do apontamento      = 14:13:45 BRT → 17:13:45 UTC
//   - 17:13:45 > 17:13:00 → apontamento excluído incorretamente
//
// SOLUÇÃO: quando hora_despesa tem apenas "HH:mm" (sem segundos), considerar como
// limite final o último ms daquele minuto (HH:mm:59.999), cobrindo qualquer
// apontamento finalizado dentro do mesmo minuto digitado pelo usuário.
// Quando hora_despesa já tem segundos ("HH:mm:ss"), usar o valor exato.
// ─────────────────────────────────────────────────────────────────────────────

/** Offset fixo BRT em ms (UTC-3). */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Converte data+hora LOCAL (America/Sao_Paulo, BRT = UTC-3) para timestamp UTC em ms.
 *
 * Regra de precisão de segundos:
 *   - "HH:mm" (5 chars, sem segundos)  → usa HH:mm:59.999 como limite
 *     Razão: hora_despesa não armazena segundos; o usuário digitou "14:13" mas o
 *     apontamento pode ter sido finalizado em 14:13:45 — o minuto inteiro é válido.
 *   - "HH:mm:ss" (8 chars, com segundos) → usa o valor exato, sem extensão.
 *     Razão: se os segundos estão presentes, o horário é preciso.
 *   - null/undefined → usa 00:00:00.000 (início do dia).
 *
 * Usa Date.UTC + BRT_OFFSET_MS para ser determinístico em qualquer timezone de servidor.
 *
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:mm" | "HH:mm:ss" | null
 */
function abastecimentoUtcMs(
  dateStr: string,
  timeStr: string | null | undefined,
): number {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);

  if (!timeStr) {
    // Sem hora: início do dia (00:00:00.000 BRT)
    return Date.UTC(year, month - 1, day, 0, 0, 0, 0) + BRT_OFFSET_MS;
  }

  const semSegundos = timeStr.length === 5; // "HH:mm"
  const partes = timeStr.split(":").map(Number);
  const hh = partes[0];
  const mm = partes[1];
  const ss = semSegundos ? 59 : (partes[2] ?? 0);
  const ms = semSegundos ? 999 : 0;

  return Date.UTC(year, month - 1, day, hh, mm, ss, ms) + BRT_OFFSET_MS;
}

/**
 * Extrai o timestamp UTC em ms de um apontamento (data_fim ou data_inicio).
 * data_fim é string ISO com Z (UTC) — pode ser null se ainda aberto.
 */
function apontamentoUtcMs(a: ControleKm): number {
  const raw = a.data_fim ?? a.data_inicio;
  // ISO com Z ou com +00:00 → new Date() parseia corretamente como UTC
  // String apenas "YYYY-MM-DD" (10 chars) → raramente ocorre, assume meio-dia UTC
  if (raw.length === 10) return new Date(`${raw}T12:00:00Z`).getTime();
  return new Date(raw).getTime();
}

/**
 * Gera alertas de consumo avaliando cada veículo com pelo menos dois abastecimentos.
 *
 * Regra da janela (com fuso horário correto):
 *  - iniMs = hora local BRT do penúltimo abastecimento convertida para UTC
 *  - fimMs = hora local BRT do último abastecimento + 59s (cobre todo o minuto digitado)
 *  - Apontamento incluído quando: apontamentoUtcMs > iniMs && apontamentoUtcMs <= fimMs
 *
 * KM esperado = litros do penúltimo × km_media_litro da frota.
 * Alerta apenas quando percentual < 80% (LIMITE_CONSUMO).
 */
export function gerarAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
): AlertaConsumo[] {
  const frotaIds = [
    ...new Set(despesas.filter(isAbastecimento).map((d) => d.frota_id as string)),
  ];

  const alertas: AlertaConsumo[] = [];

  for (const frotaId of frotaIds) {
    // Ordena abastecimentos por data+hora local BRT (asc).
    // Usa abastecimentoUtcMs para garantir ordenação correta em dias iguais.
    const abastecimentos = despesas
      .filter((d) => d.frota_id === frotaId && isAbastecimento(d))
      .sort((a, b) => {
        const tsA = abastecimentoUtcMs(
          a.data_despesa ?? a.created_at.slice(0, 10),
          a.hora_despesa,
        );
        const tsB = abastecimentoUtcMs(
          b.data_despesa ?? b.created_at.slice(0, 10),
          b.hora_despesa,
        );
        return tsA - tsB;
      });

    if (abastecimentos.length < 2) continue;

    const penultimo = abastecimentos[abastecimentos.length - 2];
    const ultimo    = abastecimentos[abastecimentos.length - 1];

    // Não gera alerta se existir apontamento aberto para o veículo
    const temAberto = apontamentos.some(
      (a) => a.frota_id === frotaId && a.status === "aberto",
    );
    if (temAberto) continue;

    const kmMediaLitro = ultimo.frota?.km_media_litro ?? penultimo.frota?.km_media_litro ?? null;
    if (!kmMediaLitro || kmMediaLitro <= 0) continue;

    const litros = penultimo.litros_abastecidos as number;
    const kmEsperado = litros * kmMediaLitro;
    if (kmEsperado <= 0) continue;

    // Converte abastecimentos para UTC para comparação com data_fim dos apontamentos (UTC)
    const iniMs = abastecimentoUtcMs(
      penultimo.data_despesa ?? penultimo.created_at.slice(0, 10),
      penultimo.hora_despesa,
    );
    const fimMs = abastecimentoUtcMs(
      ultimo.data_despesa ?? ultimo.created_at.slice(0, 10),
      ultimo.hora_despesa,
    );

    const dataRef = ultimo.data_despesa ?? ultimo.created_at.slice(0, 10);

    // Soma apontamentos finalizados cujo data_fim UTC cai dentro da janela.
    // Regra: data_fim > iniMs (posterior ao penúltimo abastecimento)
    //        data_fim <= fimMs (anterior ou igual ao último abastecimento + 59s)
    const kmApontado = apontamentos
      .filter((a) => {
        if (a.frota_id !== frotaId) return false;
        if (a.status !== "finalizado") return false;
        if (kmPercorridoApontamento(a) <= 0) return false;
        const dMs = apontamentoUtcMs(a);
        return dMs > iniMs && dMs <= fimMs;
      })
      .reduce((sum, a) => sum + kmPercorridoApontamento(a), 0);

    const percentual = kmApontado / kmEsperado;

    if (percentual >= LIMITE_CONSUMO) continue;

    alertas.push({
      id: `${frotaId}_${dataRef}`,
      frotaId,
      placa: ultimo.frota?.placa ?? "—",
      modelo: ultimo.frota?.modelo ?? "",
      data: dataRef,
      litros,
      kmApontado: Math.round(kmApontado),
      kmEsperado: Math.round(kmEsperado),
      percentual: Math.round(percentual * 100) / 100,
      valor: penultimo.valor,
    });
  }

  return alertas.sort((a, b) => a.percentual - b.percentual);
}

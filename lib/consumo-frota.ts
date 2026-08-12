/**
 * consumo-frota.ts
 * Compara os apontamentos de KM (controle_km) com o KM esperado entre os dois
 * últimos abastecimentos de cada veículo. A janela de referência é definida
 * exclusivamente pela quilometragem registrada nos abastecimentos (km_atual) —
 * nunca por data/hora — ver calcularJanelaKmFrota. Gera alerta quando o KM
 * apontado fica abaixo de 80% do KM esperado (kmFinalFaixa - kmInicialFaixa).
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

export interface ResultadoJanelaKm {
  frotaId: string;
  placa: string;
  modelo: string;
  /** data_despesa do abastecimento que fechou a janela (o de maior km_atual) */
  data: string;
  litros: number;
  valor: number;
  /** km_atual do abastecimento anterior (limite inferior da faixa) */
  kmInicialFaixa: number;
  /** km_atual do abastecimento mais recente (limite superior da faixa) */
  kmFinalFaixa: number;
  kmApontado: number;
  kmEsperado: number;
  percentual: number;
  temAlerta: boolean; // true se percentual < LIMITE_CONSUMO
}

/**
 * FONTE ÚNICA DE CÁLCULO da janela "Último cálculo: X% apontado (X / X km)".
 *
 * Baseia-se exclusivamente na quilometragem registrada nos abastecimentos e nos
 * apontamentos de KM — nunca em data/hora. Regra:
 *
 *   1. Considera os abastecimentos do veículo com `km_atual` preenchido (> 0).
 *   2. Ordena por `km_atual` DESC — os dois maiores definem a faixa:
 *        kmFinalFaixa   = maior km_atual
 *        kmInicialFaixa = segundo maior km_atual
 *   3. kmEsperado = kmFinalFaixa - kmInicialFaixa (deslocamento físico do veículo).
 *   4. Apontamentos de controle_km do mesmo veículo (qualquer usuário), finalizados e
 *      com km_final preenchido, participam do cálculo somente quando estiverem
 *      COMPLETAMENTE contidos na faixa: km_inicial >= kmInicialFaixa E km_final <= kmFinalFaixa.
 *      Apontamentos que começam antes ou terminam depois da faixa são descartados.
 *   5. kmApontado = soma de km_percorrido (ou km_final - km_inicial) desses apontamentos.
 *   6. percentual = kmApontado / kmEsperado.
 *
 * Retorna null quando não há pelo menos 2 abastecimentos válidos com km_atual,
 * ou quando kmFinalFaixa <= kmInicialFaixa (faixa inválida/degenerada).
 */
export function calcularJanelaKmFrota(
  frotaId: string,
  despesas: Despesa[],
  apontamentos: ControleKm[],
): ResultadoJanelaKm | null {
  const abastecimentos = despesas.filter(
    (d) =>
      d.frota_id === frotaId &&
      isAbastecimento(d) &&
      typeof d.km_atual === "number" &&
      d.km_atual > 0,
  );

  if (abastecimentos.length < 2) return null;

  // Ordena pelo KM registrado — não pela data/hora do lançamento
  const ordenadosPorKm = [...abastecimentos].sort(
    (a, b) => (b.km_atual as number) - (a.km_atual as number),
  );

  const abastMaior = ordenadosPorKm[0];
  const abastSegundo = ordenadosPorKm[1];

  const kmFinalFaixa = abastMaior.km_atual as number;
  const kmInicialFaixa = abastSegundo.km_atual as number;

  // Faixa inválida/degenerada — evita divisão por zero, NaN, Infinity ou percentual negativo
  if (kmFinalFaixa <= kmInicialFaixa) return null;

  const kmEsperado = kmFinalFaixa - kmInicialFaixa;

  // Seleção pela faixa COMPLETA do apontamento — qualquer usuário/responsável.
  // O apontamento só é considerado quando estiver inteiramente contido entre os
  // dois abastecimentos: km_inicial >= kmInicialFaixa E km_final <= kmFinalFaixa.
  // Apontamentos que começam antes ou terminam depois da faixa são descartados,
  // mesmo que parcialmente sobrepostos a ela.
  const kmApontado = apontamentos
    .filter((a) => {
      if (a.frota_id !== frotaId) return false;
      if (a.status !== "finalizado") return false;
      if (typeof a.km_inicial !== "number") return false;
      if (typeof a.km_final !== "number") return false;
      if (a.km_inicial < kmInicialFaixa || a.km_final > kmFinalFaixa) return false;
      return kmPercorridoApontamento(a) > 0;
    })
    .reduce((sum, a) => sum + kmPercorridoApontamento(a), 0);

  const percentual = kmApontado / kmEsperado;

  return {
    frotaId,
    placa: abastMaior.frota?.placa ?? abastSegundo.frota?.placa ?? "—",
    modelo: abastMaior.frota?.modelo ?? abastSegundo.frota?.modelo ?? "",
    data: abastMaior.data_despesa ?? abastMaior.created_at,
    litros: (abastMaior.litros_abastecidos as number) ?? 0,
    valor: abastMaior.valor,
    kmInicialFaixa,
    kmFinalFaixa,
    kmApontado,
    kmEsperado,
    percentual,
    temAlerta: percentual < LIMITE_CONSUMO,
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
 * Persiste o resultado do "Último cálculo" (km apontado/esperado/percentual) e o
 * estado do alerta de consumo no banco via API route.
 *
 * Deve ser chamado apenas quando um NOVO abastecimento é registrado — é somente
 * nesse momento que a faixa entre os dois últimos abastecimentos (por KM) fica
 * definida. Não deve ser chamado ao finalizar um apontamento de KM.
 *
 * Para cada frota avaliada:
 *   - Se houver faixa de KM válida (>= 2 abastecimentos com km_atual): persiste
 *     ultimo_calculo_* via POST /api/alertas-consumo sempre, mesmo quando o percentual
 *     está OK (>= 80%) — o card de Frotas deve refletir o cálculo mais recente.
 *     O alerta só fica ativo (`ativo: true`) quando percentual < LIMITE_CONSUMO.
 *   - Se não houver faixa válida (< 2 abastecimentos com km_atual, ou faixa degenerada):
 *     apenas limpa o alerta_ativo da frota via /api/alertas-consumo/limpar — não há
 *     dados suficientes para atualizar ultimo_calculo_*.
 *
 * @param frotaId — quando fornecido, processa apenas esse veículo; caso contrário,
 *   processa todas as frotas com abastecimentos. Use sempre que possível para evitar
 *   sobrescrever o cálculo de outros veículos.
 * @returns o resultado calculado para `frotaId` (ou null se não houver faixa válida
 *   ou `frotaId` não for informado) — útil para feedback imediato na UI sem duplicar cálculo.
 */
export async function persistirAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
  frotaId?: string,
): Promise<AlertaConsumo | null> {
  const resultadosPorFrota = new Map(
    gerarAlertasConsumo(despesas, apontamentos).map((r) => [r.frotaId, r]),
  );

  // Coleta as frotas a avaliar: somente a especificada, ou todas com abastecimentos
  const todasFrotasComAbast = new Set(
    despesas.filter(isAbastecimento).map((d) => d.frota_id as string),
  );
  const frotasAvaliadas = frotaId
    ? (todasFrotasComAbast.has(frotaId) ? new Set([frotaId]) : new Set<string>())
    : todasFrotasComAbast;

  // Para cada frota avaliada: persiste o último cálculo sempre que houver faixa válida,
  // ou limpa o alerta se não houver dados suficientes para calcular
  const resultados = await Promise.allSettled(
    Array.from(frotasAvaliadas).map((fId) => {
      const resultado = resultadosPorFrota.get(fId);
      if (resultado) {
        // Faixa de KM válida: persiste/atualiza ultimo_calculo_* via POST (fluxo normal).
        // POST protege alertas já tratados manualmente (resolvido_por != null), sempre
        // atualiza km_apontado/km_esperado/percentual na frota, e ativa o alerta somente
        // quando o percentual estiver abaixo de LIMITE_CONSUMO.
        return fetch("/api/alertas-consumo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alerta: resultado, ativo: resultado.percentual < LIMITE_CONSUMO }),
        });
      } else {
        // Sem faixa válida (< 2 abastecimentos com km_atual): limpa alerta_ativo na frota
        return fetch("/api/alertas-consumo/limpar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frotaId: fId }),
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

  return frotaId ? (resultadosPorFrota.get(frotaId) ?? null) : null;
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
 * Gera o resultado do "Último cálculo" para cada veículo com pelo menos dois
 * abastecimentos válidos (com km_atual preenchido).
 *
 * Regra da janela — exclusivamente por KM, nunca por data/hora (ver calcularJanelaKmFrota):
 *  - kmFinalFaixa/kmInicialFaixa = os dois maiores km_atual dos abastecimentos do veículo
 *  - kmEsperado = kmFinalFaixa - kmInicialFaixa
 *  - kmApontado = soma de km_percorrido dos apontamentos cujo km_inicial esteja na faixa
 *
 * Retorna UM resultado por veículo (mesmo quando percentual >= LIMITE_CONSUMO), pois o
 * card "Último cálculo" da tela Frotas deve sempre refletir o cálculo mais recente —
 * apenas a persistência do alerta ativo depende do percentual (ver persistirAlertasConsumo).
 *
 * Não gera resultado se houver apontamento em aberto para o veículo (ainda não é possível
 * fechar a janela com segurança) ou se calcularJanelaKmFrota retornar null.
 */
export function gerarAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
): AlertaConsumo[] {
  const frotaIds = [
    ...new Set(despesas.filter(isAbastecimento).map((d) => d.frota_id as string)),
  ];

  const resultados: AlertaConsumo[] = [];

  for (const frotaId of frotaIds) {
    // Não calcula se existir apontamento aberto para o veículo
    const temAberto = apontamentos.some(
      (a) => a.frota_id === frotaId && a.status === "aberto",
    );
    if (temAberto) continue;

    const janela = calcularJanelaKmFrota(frotaId, despesas, apontamentos);
    if (!janela) continue;

    resultados.push({
      id: `${frotaId}_${janela.data.slice(0, 10)}`,
      frotaId,
      placa: janela.placa,
      modelo: janela.modelo,
      data: janela.data,
      litros: janela.litros,
      kmApontado: Math.round(janela.kmApontado),
      kmEsperado: Math.round(janela.kmEsperado),
      percentual: Math.round(janela.percentual * 100) / 100,
      valor: janela.valor,
    });
  }

  return resultados.sort((a, b) => a.percentual - b.percentual);
}

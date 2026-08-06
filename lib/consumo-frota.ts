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

    const inicioMs = new Date(anterior.data_despesa ?? anterior.created_at).getTime();
    const fimMs    = new Date(proximo.data_despesa  ?? proximo.created_at).getTime();

    const kmApontado = apontamentos
      .filter((a) => {
        if (a.frota_id !== frotaId) return false;
        if (a.status !== "finalizado") return false;
        if (kmPorApontamento(a) <= 0) return false;
        const dataApontMs = new Date(a.data_fim ?? a.data_inicio).getTime();
        return dataApontMs >= inicioMs && dataApontMs <= fimMs;
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

  // 5. KM apontado no período (filtra por usuário se especificado)
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
  const resultados = await Promise.allSettled(
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

  // Loga erros sem mascarar — não bloqueia o fluxo principal pois o abastecimento já foi salvo
  for (const r of resultados) {
    if (r.status === "rejected") {
      console.error("[persistirAlertasConsumo] Falha ao persistir alerta:", r.reason);
    }
  }
}

/**
 * Gera alertas de consumo avaliando cada veículo com pelo menos dois abastecimentos.
 *
 * Regra:
 *  - Janela = do penúltimo abastecimento (inclusive) até o último abastecimento (inclusive)
 *  - KM apontado = soma de todos os apontamentos FINALIZADOS do veículo dentro da janela,
 *    independentemente do funcionário
 *  - KM esperado = litros do penúltimo abastecimento × km_media_litro da frota
 *  - Alerta apenas quando percentual < 80% (LIMITE_CONSUMO)
 *
 * Não gera alerta quando:
 *  - Há menos de 2 abastecimentos válidos
 *  - Existe apontamento em aberto para o veículo
 *  - KM esperado é zero (sem km_media_litro cadastrado)
 *  - Dados insuficientes
 */
export function gerarAlertasConsumo(
  despesas: Despesa[],
  apontamentos: ControleKm[],
): AlertaConsumo[] {
  // Frotas com pelo menos dois abastecimentos com litros
  const frotaIds = [
    ...new Set(despesas.filter(isAbastecimento).map((d) => d.frota_id as string)),
  ];

  const alertas: AlertaConsumo[] = [];

  for (const frotaId of frotaIds) {
    // Ordena todos os abastecimentos do veículo por data real (asc)
    const abastecimentos = despesas
      .filter((d) => d.frota_id === frotaId && isAbastecimento(d))
      .sort((a, b) =>
        (a.data_despesa ?? a.created_at).localeCompare(b.data_despesa ?? b.created_at),
      );

    // Precisa de pelo menos 2 abastecimentos para calcular a janela
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

    // Janela: data/hora do penúltimo até data/hora do último (comparação de string ISO)
    const iniStr = (penultimo.data_despesa ?? penultimo.created_at);
    const fimStr = (ultimo.data_despesa    ?? ultimo.created_at);

    const iniMs = new Date(iniStr.length === 10 ? `${iniStr}T00:00:00` : iniStr).getTime();
    const fimMs = new Date(fimStr.length === 10 ? `${fimStr}T23:59:59` : fimStr).getTime();

    // Soma todos os apontamentos finalizados do veículo dentro da janela
    const kmApontado = apontamentos
      .filter((a) => {
        if (a.frota_id !== frotaId) return false;
        if (a.status !== "finalizado") return false;
        const km = kmPercorridoApontamento(a);
        if (km <= 0) return false;
        const dMs = new Date(
          (a.data_fim ?? a.data_inicio).length === 10
            ? `${a.data_fim ?? a.data_inicio}T12:00:00`
            : (a.data_fim ?? a.data_inicio),
        ).getTime();
        return dMs >= iniMs && dMs <= fimMs;
      })
      .reduce((sum, a) => sum + kmPercorridoApontamento(a), 0);

    const percentual = kmApontado / kmEsperado;

    // Apenas gera alerta se percentual for estritamente menor que 80%
    if (percentual >= LIMITE_CONSUMO) continue;

    const dataRef = fimStr.slice(0, 10);
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

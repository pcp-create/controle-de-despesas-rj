/**
 * Regras de elegibilidade e utilitários puros para o backup/exclusão de
 * comprovantes do Storage. Mantido separado das rotas de API para poder ser
 * testado/lido isoladamente e reaproveitado entre a listagem de elegíveis e
 * a geração do backup em si — as duas etapas devem usar exatamente a mesma
 * regra, ou um item poderia aparecer como elegível e depois ser rejeitado
 * silenciosamente (ou vice-versa).
 */

export const BUCKET_COMPROVANTES = "comprovantes";
export const BUCKET_BACKUPS = "backups-comprovantes";

/** Único status de status_erp que indica que a despesa já foi consolidada no ERP. */
export const STATUS_ERP_LANCADO = "AprovadoGestorERPAtualizado" as const;

export interface DespesaElegivel {
  id: string;
  data_despesa: string;
  status_erp: string;
  status_aprovacao: string;
  comprovante_url: string | null;
  comprovante_nome: string | null;
  comprovante_arquivado_em: string | null;
  valor: number;
  cliente: string;
  numero_os: string;
  tecnico_id: string;
  tecnico_nome?: string | null;
}

export interface ElegibilidadeResultado {
  elegivel: boolean;
  motivo?: string;
}

/**
 * Uma despesa só é elegível para backup/exclusão do comprovante quando:
 *  - possui um comprovante ainda não arquivado;
 *  - data_despesa é anterior (ou igual) à data de corte escolhida pelo admin;
 *  - status_erp === 'AprovadoGestorERPAtualizado' — ou seja, já foi lançada
 *    e consolidada no ERP. Despesas ainda não lançadas (rascunho, aguardando
 *    aprovação, erro de envio, reprovada mas pendente de correção etc.)
 *    NUNCA são elegíveis, para não perder o comprovante de algo que ainda
 *    pode precisar ser corrigido e relançado.
 */
export function avaliarElegibilidade(
  despesa: DespesaElegivel,
  corteData: string,
): ElegibilidadeResultado {
  if (!despesa.comprovante_url) {
    return { elegivel: false, motivo: "Sem comprovante" };
  }
  if (despesa.comprovante_arquivado_em) {
    return { elegivel: false, motivo: "Comprovante já arquivado anteriormente" };
  }
  if (despesa.data_despesa > corteData) {
    return { elegivel: false, motivo: "Despesa posterior à data de corte" };
  }
  if (despesa.status_erp !== STATUS_ERP_LANCADO) {
    return { elegivel: false, motivo: "Despesa ainda não lançada/consolidada no ERP" };
  }
  return { elegivel: true };
}

/**
 * Extrai o path do objeto dentro do bucket `comprovantes` a partir da signed
 * URL salva em `despesas.comprovante_url`. O path nunca é persistido
 * separadamente — precisa ser reconstruído a partir da URL no formato
 * `.../storage/v1/object/sign/comprovantes/<path>?token=...`.
 */
export function extractStoragePathFromSignedUrl(signedUrl: string, bucket: string): string | null {
  try {
    const url = new URL(signedUrl);
    const marker = `/object/sign/${bucket}/`;
    const publicMarker = `/object/public/${bucket}/`;
    const idx = url.pathname.indexOf(marker);
    const idxPublic = url.pathname.indexOf(publicMarker);

    if (idx !== -1) {
      return decodeURIComponent(url.pathname.slice(idx + marker.length));
    }
    if (idxPublic !== -1) {
      return decodeURIComponent(url.pathname.slice(idxPublic + publicMarker.length));
    }
    return null;
  } catch {
    return null;
  }
}

/** Nome de arquivo seguro para uso dentro do ZIP (remove separadores de path e caracteres de controle). */
export function sanitizeZipEntryName(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/[\u0000-\u001f]/g, "").trim() || "arquivo";
}

/** Primeiro nome do funcionário, sem acentos/espaços, para compor o nome do arquivo no ZIP. */
export function getPrimeiroNome(nomeCompleto: string | null | undefined): string {
  if (!nomeCompleto) return "funcionario";
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? "";
  const semAcentos = primeiro.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return sanitizeZipEntryName(semAcentos) || "funcionario";
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

/** Divide um array em blocos de tamanho fixo — usado para chamadas em lote no Storage/DB. */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Executa `worker` para cada item de `items` com um limite de concorrência.
 * Backups com centenas de comprovantes não podem baixar/excluir um arquivo
 * por vez de forma sequencial — o tempo total ultrapassaria o limite de
 * execução da função serverless antes de terminar. Rodar em lotes paralelos
 * mantém o tempo total previsível sem sobrecarregar o Storage.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

/**
 * Extrai uma mensagem de erro legível do corpo JSON de uma resposta de API.
 * Timeouts e erros de plataforma (ex: função encerrada por exceder o tempo
 * de execução) podem retornar `error` como um objeto estruturado em vez de
 * string — usar `new Error(json.error)` direto nesse caso vira o texto
 * "[object Object]" na tela. Esta função sempre devolve uma string útil.
 */
export function extractApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object" || !("error" in json)) return fallback;
  const error = (json as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

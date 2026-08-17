// Persistência local (localStorage) das preferências de visualização da
// tabela Financeiro/ERP: largura de colunas, ordenação e filtros por coluna.
// Separado por usuário (chave inclui o userId) e versionado — se o formato
// mudar no futuro, rascunhos antigos são descartados em vez de corromper o estado.

export interface FinanceiroTablePrefsData {
  /** Larguras das colunas, na mesma ordem de TABLE_COLUMNS */
  colWidths: number[];
  /** Coluna atualmente ordenada (ou null = sem ordenação) */
  sortKey: string | null;
  sortDir: "asc" | "desc";
  /** Filtros de seleção (checkbox) por coluna — valores selecionados */
  colFilters: Record<string, string[]>;
  /** Filtros de texto (busca livre) por coluna */
  colTextFilters: Record<string, string>;
}

interface Envelope {
  version: number;
  updatedAt: number;
  data: FinanceiroTablePrefsData;
}

const VERSION = 1;

function storageKey(userId: string) {
  return `financeiro_table_prefs_${userId}`;
}

export function salvarPrefsTabelaFinanceiro(userId: string, data: FinanceiroTablePrefsData) {
  if (!userId || typeof window === "undefined") return;
  try {
    const envelope: Envelope = { version: VERSION, updatedAt: Date.now(), data };
    window.localStorage.setItem(storageKey(userId), JSON.stringify(envelope));
  } catch {
    // localStorage indisponível (modo privado, quota etc.) — ignora silenciosamente
  }
}

export function carregarPrefsTabelaFinanceiro(userId: string): FinanceiroTablePrefsData | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (!parsed || parsed.version !== VERSION || !parsed.data) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

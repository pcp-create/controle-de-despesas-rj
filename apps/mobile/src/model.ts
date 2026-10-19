export type Profile = {
  id: string;
  nome: string;
  usuario: string;
  perfil: string;
  ativo: boolean;
  primeiro_acesso: boolean;
  frota_padrao_id: string | null;
};
export type ExpenseType = {
  id: string;
  nome: string;
  ativo: boolean;
  exige_comprovante: boolean;
  calcula_diarias: boolean;
  limite_maximo: number | null;
  documento_padrao: string | null;
};
export type Card = {
  id: string;
  apelido: string | null;
  banco: string;
  ultimos_digitos: string;
  is_padrao: boolean;
  ativo: boolean;
};
export type Fleet = {
  id: string;
  placa: string;
  modelo: string;
  quilometragem: number;
  ativo: boolean;
};
export type Payload = Record<string, string | number | boolean | null> & {
  id: string;
};
export type Expense = Payload & {
  valor: number;
  data_despesa: string;
  tipo_despesa_id: string;
  cliente: string;
  status_aprovacao?: string;
  status_erp?: string;
};
export type Trip = Payload & {
  frota_id: string;
  km_inicial: number;
  data_inicio: string;
  status: string;
  km_final?: number | null;
};
export type Kind =
  "expense.create" | "expense.resubmit" | "km.start" | "km.finish";
export type Operation = {
  id: string;
  owner: string;
  entity: string;
  kind: Kind;
  payload: Payload;
  state: "pending" | "blocked";
  created: number;
  attempts: number;
  nextAttempt: number;
  error?: string;
  attachmentId?: string;
};
export type Attachment = {
  id: string;
  owner: string;
  blob: Blob;
  name: string;
  path?: string;
  url?: string;
};
export type LocalRecord<T> = {
  key: string;
  owner: string;
  data: T;
  pending: boolean;
};
export type Catalog = {
  owner: string;
  types: ExpenseType[];
  cards: Card[];
  fleets: Fleet[];
  refreshed: string;
};
export type Result = { expenses?: Expense[]; trip?: Trip };
export const localKey = (owner: string, id: string) => `${owner}:${id}`;
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const receiptTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];
export function validateReceipt(file: Blob) {
  if (!receiptTypes.includes(file.type))
    throw new Error("Use uma foto JPG, PNG, GIF, WebP ou um PDF.");
  if (file.size === 0 || file.size > 13 * 1024 * 1024)
    throw new Error("O comprovante deve ter até 13 MB e não pode estar vazio.");
}

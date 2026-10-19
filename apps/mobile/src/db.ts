import Dexie, { type Table } from "dexie";
import {
  localKey,
  validateReceipt,
  type Attachment,
  type Catalog,
  type Expense,
  type LocalRecord,
  type Operation,
  type Payload,
  type Profile,
  type Trip,
} from "./model";

export class MobileDB extends Dexie {
  operations!: Table<Operation, string>;
  attachments!: Table<Attachment, string>;
  expenses!: Table<LocalRecord<Expense>, string>;
  trips!: Table<LocalRecord<Trip>, string>;
  catalogs!: Table<Catalog, string>;
  profiles!: Table<Profile, string>;
  drafts!: Table<
    { owner: string; payload: Payload; photo?: Blob; photoName?: string },
    string
  >;
  constructor(name = "rj-mobile-v1") {
    super(name);
    this.version(1).stores({
      operations: "id, owner, [owner+entity], created",
      attachments: "id, owner",
      expenses: "key, owner",
      trips: "key, owner",
      catalogs: "owner",
      profiles: "id",
      drafts: "owner",
    });
  }
}
export const db = new MobileDB();

export async function saveExpense(
  owner: string,
  payload: Expense,
  photo?: File,
  database = db,
  resubmit = false,
) {
  if (photo) validateReceipt(photo);
  if (!Number.isFinite(payload.valor) || payload.valor <= 0)
    throw new Error("Informe um valor válido.");
  const operation: Operation = {
    id: crypto.randomUUID(),
    owner,
    entity: payload.id,
    kind: resubmit ? "expense.resubmit" : "expense.create",
    payload,
    state: "pending",
    created: Date.now(),
    attempts: 0,
    nextAttempt: 0,
  };
  if (photo) operation.attachmentId = operation.id;
  // Business record + queue + complete binary committed atomically, BEFORE success in UI.
  await database.transaction(
    "rw",
    [
      database.expenses,
      database.operations,
      database.attachments,
      database.drafts,
    ],
    async () => {
      if (resubmit) {
        const existing = await database.expenses.get(
          localKey(owner, payload.id),
        );
        if (
          !existing ||
          existing.pending ||
          existing.data.status_aprovacao !== "Reprovado"
        )
          throw new Error(
            "Somente despesas reprovadas e sem envio pendente podem ser corrigidas.",
          );
      }
      await database.expenses.put({
        key: localKey(owner, payload.id),
        owner,
        data: resubmit
          ? { ...payload, status_aprovacao: "AguardandoGestor" }
          : payload,
        pending: true,
      });
      if (photo)
        await database.attachments.add({
          id: operation.id,
          owner,
          name: photo.name,
          blob: photo,
        });
      await database.operations.add(operation);
      if (!resubmit) await database.drafts.delete(owner);
    },
  );
  return operation.id;
}

export async function startTrip(owner: string, payload: Trip, database = db) {
  if (!Number.isInteger(payload.km_inicial) || payload.km_inicial < 0)
    throw new Error("KM inicial inválido.");
  await database.transaction(
    "rw",
    [database.trips, database.operations],
    async () => {
      const trips = await database.trips.where("owner").equals(owner).toArray();
      if (trips.some((t) => t.data.status === "aberto"))
        throw new Error("Finalize sua viagem aberta antes de iniciar outra.");
      await database.trips.add({
        key: localKey(owner, payload.id),
        owner,
        data: payload,
        pending: true,
      });
      await database.operations.add({
        id: crypto.randomUUID(),
        owner,
        entity: payload.id,
        kind: "km.start",
        payload,
        state: "pending",
        created: Date.now(),
        attempts: 0,
        nextAttempt: 0,
      });
    },
  );
}

export async function finishTrip(
  owner: string,
  id: string,
  km: number,
  occurrence: string,
  database = db,
  observation = "",
) {
  await database.transaction(
    "rw",
    [database.trips, database.operations],
    async () => {
      const record = await database.trips.get(localKey(owner, id));
      if (!record || record.data.status !== "aberto")
        throw new Error("A viagem não está aberta.");
      if (!Number.isInteger(km) || km < record.data.km_inicial)
        throw new Error("KM final deve ser igual ou maior que o inicial.");
      const payload = {
        id,
        km_final: km,
        data_fim: new Date().toISOString(),
        ocorrencia: occurrence,
        observacao: observation,
        km_inicial: record.data.km_inicial,
        data_inicio: record.data.data_inicio,
      };
      await database.trips.put({
        ...record,
        pending: true,
        data: { ...record.data, ...payload, status: "finalizado" },
      });
      await database.operations.add({
        id: crypto.randomUUID(),
        owner,
        entity: id,
        kind: "km.finish",
        payload,
        state: "pending",
        created: Date.now(),
        attempts: 0,
        nextAttempt: 0,
      });
    },
  );
}

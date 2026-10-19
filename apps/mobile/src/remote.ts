import { supabase } from "./supabase";
import { db } from "./db";
import { SyncError, type Transport } from "./sync";
import { localKey, type Expense, type Profile, type Trip } from "./model";

function failure(error: {
  message: string;
  code?: string;
  status?: number;
  statusCode?: string;
}) {
  const retry =
    /fetch|network|timeout|abort/i.test(error.message) ||
    Number(error.status ?? error.statusCode) >= 500 ||
    Number(error.status ?? error.statusCode) === 429;
  if (error.code === "PGRST202")
    return new SyncError(
      "A atualização do banco para o aplicativo ainda não foi aplicada.",
    );
  return new SyncError(error.message, retry);
}
export async function getProfile(): Promise<Profile> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    throw new SyncError("Conecte-se e entre novamente para sincronizar.");
  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id,nome,usuario,perfil,ativo,primeiro_acesso,frota_padrao_id")
    .eq("id", user.id)
    .single();
  if (profileError) throw failure(profileError);
  if (!data?.ativo)
    throw new SyncError(
      "Usuário inativo. Entre em contato com o administrador.",
    );
  return data as Profile;
}

export const transport: Transport = {
  async verifyOwner(owner) {
    const profile = await getProfile();
    if (profile.id !== owner)
      throw new SyncError(
        "A sessão pertence a outra conta. Entre novamente com a conta dos lançamentos.",
      );
    if (profile.primeiro_acesso)
      throw new SyncError("Altere sua senha antes de sincronizar.");
  },
  async upload(attachment, operation) {
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await attachment.blob.arrayBuffer(),
        ),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const ext: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const path = `${operation.owner}/${operation.id}/${hash}.${ext[attachment.blob.type] || "bin"}`;
    const bucket = supabase.storage.from("comprovantes");
    const { error } = await bucket.upload(path, attachment.blob, {
      upsert: false,
      contentType: attachment.blob.type,
    });
    if (error && !["409", "400"].includes(String(error.statusCode)))
      throw failure(error);
    // A lost upload response can be retried safely at the same content-addressed path.
    if (error && !/already exists|duplicate/i.test(error.message))
      throw failure(error);
    const signed = await bucket.createSignedUrl(path, 365 * 24 * 60 * 60);
    if (signed.error || !signed.data?.signedUrl)
      throw failure(
        signed.error || { message: "Não foi possível acessar o comprovante." },
      );
    return { path, url: signed.data.signedUrl };
  },
  async apply(operation) {
    const { data, error } = await supabase.rpc("mobile_apply_operation", {
      p_operation_id: operation.id,
      p_kind: operation.kind,
      p_payload: operation.payload,
    });
    if (error) throw failure(error);
    return data;
  },
};

export async function refreshData(owner: string) {
  const profile = await getProfile();
  if (profile.id !== owner) throw new SyncError("Sessão de outra conta.");
  // Paginate reference data. History is intentionally bounded and labelled in UI.
  async function pages(table: string, columns: string, userColumn?: string) {
    const all: unknown[] = [];
    for (let page = 0; ; page++) {
      let query = supabase
        .from(table)
        .select(columns)
        .order("id")
        .range(page * 500, page * 500 + 499);
      if (userColumn) query = query.eq(userColumn, owner);
      else query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw failure(error);
      all.push(...(data || []));
      if (!data || data.length < 500) return all;
    }
  }
  const [types, cards, fleets, expenses, trips, openTrips] = await Promise.all([
    pages(
      "tipos_despesa",
      "id,nome,ativo,exige_comprovante,calcula_diarias,limite_maximo,documento_padrao",
    ),
    pages(
      "cartoes",
      "id,apelido,banco,ultimos_digitos,is_padrao,ativo",
      "user_id",
    ),
    pages("frotas", "id,placa,modelo,quilometragem,ativo"),
    supabase
      .from("despesas")
      .select("*, responsavel:profiles!despesas_gestor_aprovador_id_fkey(nome)")
      .eq("tecnico_id", owner)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("controle_km")
      .select("*")
      .eq("usuario_id", owner)
      .order("data_inicio", { ascending: false })
      .limit(200),
    supabase
      .from("controle_km")
      .select("*")
      .eq("usuario_id", owner)
      .eq("status", "aberto"),
  ]);
  for (const result of [expenses, trips, openTrips])
    if (result.error) throw failure(result.error);
  await db.transaction(
    "rw",
    [db.catalogs, db.profiles, db.expenses, db.trips, db.operations],
    async () => {
      await db.catalogs.put({
        owner,
        types: types as never,
        cards: cards as never,
        fleets: fleets as never,
        refreshed: new Date().toISOString(),
      });
      await db.profiles.put(profile);
      const pending = new Set(
        (await db.operations.where("owner").equals(owner).toArray()).map(
          (o) => o.entity,
        ),
      );
      // Replace only synchronized cache, never locally pending records.
      for (const table of [db.expenses, db.trips]) {
        const old = await table.where("owner").equals(owner).toArray();
        await table.bulkDelete(
          old
            .filter((r) => !r.pending && !pending.has(r.data.id))
            .map((r) => r.key),
        );
      }
      for (const row of expenses.data || []) {
        const { responsavel, ...fields } = row;
        const data = { ...fields, aprovador_nome: responsavel?.nome || null } as Expense;
        if (!pending.has(data.id))
          await db.expenses.put({
            key: localKey(owner, data.id),
            owner,
            data,
            pending: false,
          });
      }
      for (const data of [
        ...(trips.data || []),
        ...(openTrips.data || []),
      ] as Trip[])
        if (!pending.has(data.id))
          await db.trips.put({
            key: localKey(owner, data.id),
            owner,
            data,
            pending: false,
          });
    },
  );
  return profile;
}

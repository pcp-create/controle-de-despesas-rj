import { db, type MobileDB } from "./db";
import {
  localKey,
  type Attachment,
  type Operation,
  type Result,
} from "./model";

export class SyncError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export interface Transport {
  verifyOwner(owner: string): Promise<void>;
  upload(
    attachment: Attachment,
    operation: Operation,
  ): Promise<{ path: string; url: string }>;
  apply(operation: Operation): Promise<Result>;
}
export function retryDelay(attempt: number) {
  return Math.min(300_000, 2000 * 2 ** Math.min(attempt, 8));
}

export class SyncEngine {
  private running: Promise<void> | null = null;
  constructor(
    private transport: Transport,
    private database: MobileDB = db,
  ) {}
  run(owner: string) {
    if (this.running) return this.running;
    const work = () => this.flush(owner);
    // Avoid concurrent runners in separate tabs/WebViews. Server receipts are the
    // final line of defense if a process dies or Web Locks is unavailable.
    this.running = (
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request("rj-mobile-sync", work)
        : work()
    ).finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async flush(owner: string) {
    await this.transport.verifyOwner(owner);
    const operations = (
      await this.database.operations.where("owner").equals(owner).toArray()
    ).sort(
      (a, b) =>
        a.created - b.created ||
        (a.kind === "km.start"
          ? -1
          : b.kind === "km.start"
            ? 1
            : a.id.localeCompare(b.id)),
    );
    const blockedEntities = new Set<string>();
    for (const original of operations) {
      if (blockedEntities.has(original.entity)) continue;
      if (original.state === "blocked" || original.nextAttempt > Date.now()) {
        blockedEntities.add(original.entity);
        continue;
      }
      // Always read fresh: process restart or another tab may have completed it.
      const operation = await this.database.operations.get(original.id);
      if (!operation || operation.owner !== owner) continue;
      try {
        await this.transport.verifyOwner(owner);
        if (operation.attachmentId) {
          const attachment = await this.database.attachments.get(
            operation.attachmentId,
          );
          if (!attachment || attachment.owner !== owner)
            throw new SyncError(
              "Comprovante local não encontrado. Não descarte este lançamento.",
            );
          const uploaded =
            attachment.url && attachment.path
              ? { path: attachment.path, url: attachment.url }
              : await this.transport.upload(attachment, operation);
          // Persist the exact signed URL used in RPC: replay payload must be stable.
          await this.database.attachments.update(attachment.id, uploaded);
          operation.payload = {
            ...operation.payload,
            comprovante_path: uploaded.path,
            comprovante_url: uploaded.url,
            comprovante_nome: attachment.name,
          };
          await this.database.operations.update(operation.id, {
            payload: operation.payload,
          });
        }
        const result = await this.transport.apply(operation);
        await this.database.transaction(
          "rw",
          [
            this.database.operations,
            this.database.expenses,
            this.database.trips,
            this.database.attachments,
          ],
          async () => {
            if (result.expenses) {
              await this.database.expenses.delete(
                localKey(owner, operation.entity),
              );
              for (const data of result.expenses)
                await this.database.expenses.put({
                  key: localKey(owner, data.id),
                  owner,
                  data,
                  pending: false,
                });
            }
            if (result.trip) {
              const siblings = await this.database.operations
                .where("[owner+entity]")
                .equals([owner, operation.entity])
                .toArray();
              // Preserve the locally finished trip while the start is acknowledged.
              if (
                !siblings.some(
                  (s) => s.id !== operation.id && s.kind === "km.finish",
                )
              ) {
                await this.database.trips.put({
                  key: localKey(owner, result.trip.id),
                  owner,
                  data: result.trip,
                  pending: false,
                });
              }
            }
            await this.database.operations.delete(operation.id);
            if (operation.attachmentId)
              await this.database.attachments.delete(operation.attachmentId);
          },
        );
      } catch (error) {
        const retryable = !(error instanceof SyncError) || error.retryable;
        await this.database.operations.update(operation.id, {
          attempts: operation.attempts + 1,
          state: retryable ? "pending" : "blocked",
          nextAttempt: retryable
            ? Date.now() + retryDelay(operation.attempts)
            : 0,
          error:
            error instanceof Error ? error.message : "Falha de sincronização.",
        });
        blockedEntities.add(operation.entity);
        if (retryable) break; // network outage: do not hammer other operations
      }
    }
  }
}

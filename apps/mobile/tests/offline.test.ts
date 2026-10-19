import { afterEach, describe, expect, it } from "vitest";
import { MobileDB, finishTrip, saveExpense, startTrip } from "../src/db";
import { SyncEngine, SyncError, type Transport } from "../src/sync";
import { localKey, type Expense, type Operation } from "../src/model";

const databases: MobileDB[] = [];
function database() {
  const d = new MobileDB(`test-${crypto.randomUUID()}`);
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
const expense = (): Expense => ({
  id: crypto.randomUUID(),
  valor: 120,
  data_despesa: "2026-09-10",
  tipo_despesa_id: "type",
  cliente: "Cliente",
});
const baseTransport: Transport = {
  verifyOwner: async () => {},
  upload: async () => ({ path: "p", url: "u" }),
  apply: async (o) => ({ expenses: [o.payload as Expense] }),
};

describe("queue durability and isolation", () => {
  it("keeps expense, binary receipt and operation after closing and reopening the database", async () => {
    const d = database();
    const payload = expense();
    await saveExpense(
      "A",
      payload,
      new File(["photo bytes"], "foto.jpg", { type: "image/jpeg" }),
      d,
    );
    d.close();
    await d.open();
    expect((await d.operations.toArray())[0].owner).toBe("A");
    expect(await (await d.attachments.toArray())[0].blob.text()).toBe(
      "photo bytes",
    );
    expect((await d.expenses.get(localKey("A", payload.id)))?.pending).toBe(
      true,
    );
  });
  it("does not accept an invalid attachment or leave partial records", async () => {
    const d = database();
    await expect(
      saveExpense(
        "A",
        expense(),
        new File(["x"], "x.exe", { type: "application/octet-stream" }),
        d,
      ),
    ).rejects.toThrow();
    expect(await d.operations.count()).toBe(0);
    expect(await d.expenses.count()).toBe(0);
  });
  it("never sends another account’s pending operation", async () => {
    const d = database();
    await saveExpense("A", expense(), undefined, d);
    await saveExpense("B", expense(), undefined, d);
    const sent: Operation[] = [];
    await new SyncEngine(
      {
        ...baseTransport,
        apply: async (o) => {
          sent.push(o);
          return { expenses: [o.payload as Expense] };
        },
      },
      d,
    ).run("A");
    expect(sent.map((o) => o.owner)).toEqual(["A"]);
    expect((await d.operations.toArray())[0].owner).toBe("B");
  });
  it("preserves pending data and attachments after connection loss, then retries the same operation", async () => {
    const d = database();
    await saveExpense(
      "A",
      expense(),
      new File(["pic"], "a.jpg", { type: "image/jpeg" }),
      d,
    );
    const ids: string[] = [];
    let fail = true;
    let uploads = 0;
    const t: Transport = {
      ...baseTransport,
      upload: async () => {
        uploads++;
        return { path: "stable", url: "stable-url" };
      },
      apply: async (o) => {
        ids.push(o.id);
        if (fail) throw new TypeError("Failed to fetch");
        return { expenses: [o.payload as Expense] };
      },
    };
    const engine = new SyncEngine(t, d);
    await engine.run("A");
    expect(await d.attachments.count()).toBe(1);
    expect(await d.operations.count()).toBe(1);
    fail = false;
    await d.operations.toCollection().modify({ nextAttempt: 0 });
    await engine.run("A");
    expect(ids[0]).toBe(ids[1]);
    expect(uploads).toBe(1);
    expect(await d.operations.count()).toBe(0);
    expect(await d.attachments.count()).toBe(0);
  });
  it("does not acknowledge records if the authenticated owner cannot be verified", async () => {
    const d = database();
    await saveExpense("A", expense(), undefined, d);
    await expect(
      new SyncEngine(
        {
          ...baseTransport,
          verifyOwner: async () => {
            throw new SyncError("Wrong account");
          },
        },
        d,
      ).run("A"),
    ).rejects.toThrow();
    expect(await d.operations.count()).toBe(1);
  });
  it("uploads an offline trip start before its finish without losing the locally completed trip", async () => {
    const d = database();
    const id = crypto.randomUUID();
    await startTrip(
      "A",
      {
        id,
        frota_id: "fleet",
        km_inicial: 100,
        data_inicio: "2026-09-10T00:00:00Z",
        status: "aberto",
      },
      d,
    );
    await finishTrip("A", id, 150, "", d);
    const kinds: string[] = [];
    await new SyncEngine(
      {
        ...baseTransport,
        apply: async (o) => {
          kinds.push(o.kind);
          expect((await d.trips.get(localKey("A", id)))?.data.status).toBe(
            "finalizado",
          );
          return {
            trip: {
              ...o.payload,
              id,
              frota_id: "fleet",
              km_inicial: 100,
              data_inicio: "2026-09-10T00:00:00Z",
              status: o.kind === "km.start" ? "aberto" : "finalizado",
            },
          };
        },
      },
      d,
    ).run("A");
    expect(kinds).toEqual(["km.start", "km.finish"]);
    expect((await d.trips.get(localKey("A", id)))?.pending).toBe(false);
  });
  it("blocks a conflicting trip and its dependent finish while syncing unrelated expenses", async () => {
    const d = database();
    const id = crypto.randomUUID();
    await startTrip(
      "A",
      {
        id,
        frota_id: "fleet",
        km_inicial: 100,
        data_inicio: "2026-09-10T00:00:00Z",
        status: "aberto",
      },
      d,
    );
    await finishTrip("A", id, 150, "", d);
    await saveExpense("A", expense(), undefined, d);
    const sent: string[] = [];
    await new SyncEngine(
      {
        ...baseTransport,
        apply: async (o) => {
          sent.push(o.kind);
          if (o.kind === "km.start") throw new SyncError("Vehicle occupied");
          return { expenses: [o.payload as Expense] };
        },
      },
      d,
    ).run("A");
    expect(sent).not.toContain("km.finish");
    expect(sent).toContain("expense.create");
    expect(await d.operations.count()).toBe(2);
  });
});

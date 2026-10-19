import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";

const user = "0994bd2a-1e14-42b0-ad50-0d5f43e3cd35";
const other = "0994bd2a-1e14-42b0-ad50-0d5f43e3cd36";
const type = "0994bd2a-1e14-42b0-ad50-0d5f43e3cd37";
const fleet = "0994bd2a-1e14-42b0-ad50-0d5f43e3cd38";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';`);
  await pg.exec(readFileSync(new URL('./fixtures/destination-schema.sql', import.meta.url), 'utf8'));
  const migration = readFileSync(new URL('../../../supabase/migrations/20260910050000_mobile_integration.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // Reapplying the consolidated migration must preserve existing objects.
  await pg.query(`insert into auth.users values ($1),($2)`, [user, other]);
  await pg.query(
    `insert into public.profiles(id,nome,email,usuario,perfil,primeiro_acesso) values ($1,'Admin','a@b.c','admin','administrador',false),($2,'Other','o@b.c','other','funcionario',false)`,
    [user, other],
  );
  await pg.query(
    `insert into public.tipos_despesa(id,nome,exige_comprovante,limite_maximo) values ($1,'Alimentação',false,50)`,
    [type],
  );
  await pg.query(
    `insert into public.frotas(id,placa,modelo,marca) values ($1,'TEST001','Teste','Teste')`,
    [fleet],
  );
  await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [user]);
}, 30000);
afterAll(async () => {
  await pg?.close();
});
it('preserves legacy Storage access while the RPC refuses another owner receipt URL', async () => {
  await pg.exec(`alter table storage.objects enable row level security;
    grant usage on schema storage, auth to authenticated;
    grant select, insert on storage.objects to authenticated;
    grant select on public.profiles to authenticated;`);
  const operation=crypto.randomUUID();const path=`${user}/${operation}/hash.jpg`;
  await pg.exec('set role authenticated');
  try {
    await pg.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['comprovantes',path]);
    // Existing permissive policies allow this upload; the mobile migration must not silently replace them.
    await pg.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['comprovantes',`${other}/file.jpg`]);
  } finally { await pg.exec('reset role'); }
  const data={...payload(),comprovante_path:path,comprovante_nome:'foto.jpg',comprovante_url:`https://example.supabase.co/storage/v1/object/sign/comprovantes/${other}/file.jpg?token=test`};
  await expect(apply(operation,'expense.create',data)).rejects.toThrow('Comprovante ausente');
  const valid=await apply(operation,'expense.create',{...data,comprovante_url:`https://example.supabase.co/storage/v1/object/sign/comprovantes/${path}?token=test`});
  expect(valid.expenses).toHaveLength(3);
});
const payload = () => ({
  id: crypto.randomUUID(),
  tipo_despesa_id: type,
  valor: 100,
  numero_parcelas: 3,
  data_despesa: "2026-09-01",
  data_vencimento: "2026-09-30",
  pagamento_tipo: "dinheiro",
  documento: "Recibo",
  observacao: "Acima do limite",
  enviar: true,
});
async function apply(id: string, kind: string, p: unknown) {
  const r = await pg.query<{ result: any }>(
    "select public.mobile_apply_operation($1,$2,$3::jsonb) as result",
    [id, kind, JSON.stringify(p)],
  );
  return r.rows[0].result;
}
it("creates installments atomically, preserves cents and replays without duplicate records", async () => {
  const op = crypto.randomUUID(),
    p = payload();
  const first = await apply(op, "expense.create", p);
  const again = await apply(op, "expense.create", p);
  expect(first.expenses.map((d: any) => Number(d.valor))).toEqual([
    33.34, 33.33, 33.33,
  ]);
  expect(first.expenses[0].status_aprovacao).toBe("AguardandoGestor");
  expect(again).toEqual(first);
  const count = await pg.query<{ n: number }>(
    "select count(*)::integer n from public.despesas where grupo_parcela_id=$1",
    [p.id],
  );
  expect(count.rows[0].n).toBe(3);
  await expect(
    apply(op, "expense.create", { ...p, valor: 101 }),
  ).rejects.toThrow("Identificador reutilizado");
});
it("rejects a forged card and rolls back all expense rows", async () => {
  const p = {
    ...payload(),
    pagamento_tipo: "cartao",
    cartao_id: crypto.randomUUID(),
  };
  await expect(apply(crypto.randomUUID(), "expense.create", p)).rejects.toThrow(
    "Cartão inválido",
  );
  const r = await pg.query<{ n: number }>(
    "select count(*)::integer n from public.despesas where id=$1",
    [p.id],
  );
  expect(r.rows[0].n).toBe(0);
});
it("rejects missing authentication", async () => {
  await pg.query(`select set_config('request.jwt.claim.sub','',false)`);
  try {
    await expect(
      apply(crypto.randomUUID(), "expense.create", payload()),
    ).rejects.toThrow("Sessão expirada");
  } finally {
    await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      user,
    ]);
  }
});
it("allows authenticated RPC execution but denies direct receipt insertion and anonymous RPC", async () => {
  await pg.exec("set role authenticated");
  try {
    const r = await apply(crypto.randomUUID(), "expense.create", {
      ...payload(),
      valor: 20,
      numero_parcelas: 1,
    });
    expect(r.expenses[0].tecnico_id).toBe(user);
    await expect(
      pg.query("select * from public.mobile_sync_receipts"),
    ).rejects.toThrow("permission denied");
  } finally {
    await pg.exec("reset role");
  }
  await pg.exec("set role anon");
  try {
    await expect(
      apply(crypto.randomUUID(), "expense.create", payload()),
    ).rejects.toThrow("permission denied");
  } finally {
    await pg.exec("reset role");
  }
});
it("starts and finishes a trip, refuses another owner, and replays finish safely", async () => {
  const id = crypto.randomUUID();
  const p = {
    id,
    frota_id: fleet,
    km_inicial: 100,
    data_inicio: "2026-09-01T10:00:00Z",
  };
  await apply(crypto.randomUUID(), "km.start", p);
  await expect(
    apply(crypto.randomUUID(), "km.start", { ...p, id: crypto.randomUUID() }),
  ).rejects.toThrow("Conflito");
  const end = {
    id,
    km_inicial: 100,
    data_inicio: p.data_inicio,
    km_final: 130,
    data_fim: "2026-09-01T11:00:00Z",
    observacao: "Retorno ao escritório",
    ocorrencia: "Trânsito intenso",
  };
  await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
    other,
  ]);
  try {
    await expect(apply(crypto.randomUUID(), "km.finish", end)).rejects.toThrow(
      "Viagem não encontrada",
    );
  } finally {
    await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      user,
    ]);
  }
  const op = crypto.randomUUID();
  const result = await apply(op, "km.finish", end);
  expect(result.trip.observacao).toBe("Retorno ao escritório");
  expect(result.trip.ocorrencia).toBe("Trânsito intenso");
  expect(result.trip.km_percorrido).toBe(30);
  expect(result.trip.duracao_minutos).toBe(60);
  expect(await apply(op, "km.finish", end)).toEqual(result);
});

it("resubmits only an owned rejected expense, preserving its installment and replaying safely", async () => {
  const p = payload();
  const original = await apply(crypto.randomUUID(), "expense.create", p);
  const row = original.expenses[0];
  const correction = { ...p, numero_parcelas: 1, valor: 40, cliente: "Corrigido", expected_updated_at: row.updated_at };
  await expect(apply(crypto.randomUUID(), "expense.resubmit", correction)).rejects.toThrow("reprovadas");
  await pg.query("update public.despesas set status_aprovacao='Reprovado',justificativa_reprovacao='Corrigir cliente' where id=$1", [p.id]);
  await expect(apply(crypto.randomUUID(), "expense.resubmit", { ...correction, expected_updated_at: "2000-01-01T00:00:00Z" })).rejects.toThrow("mudou");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  try { await expect(apply(crypto.randomUUID(), "expense.resubmit", correction)).rejects.toThrow("próprio usuário"); }
  finally { await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
  const op = crypto.randomUUID();
  const result = await apply(op, "expense.resubmit", correction);
  expect(result.expenses[0]).toMatchObject({ id: p.id, cliente: "Corrigido", status_aprovacao: "AguardandoGestor", justificativa_reprovacao: null, numero_parcelas: 3, grupo_parcela_id: p.id });
  expect(await apply(op, "expense.resubmit", correction)).toEqual(result);
  const count = await pg.query<{ n: number }>("select count(*)::integer n from public.despesas where grupo_parcela_id=$1", [p.id]);
  expect(count.rows[0].n).toBe(3);
});

it('reapplies the consolidated migration without changing existing expenses or policies', async () => {
  const before = await pg.query('select * from public.despesas order by id');
  const policies = await pg.query('select policyname, qual, with_check from pg_policies order by schemaname, tablename, policyname');
  await pg.exec(readFileSync(new URL('../../../supabase/migrations/20260910050000_mobile_integration.sql', import.meta.url), 'utf8'));
  expect((await pg.query('select * from public.despesas order by id')).rows).toEqual(before.rows);
  expect((await pg.query('select policyname, qual, with_check from pg_policies order by schemaname, tablename, policyname')).rows).toEqual(policies.rows);
});

it('aborts before applying mobile SQL if a required column has changed', async () => {
  await pg.exec('alter table public.frotas rename column quilometragem to quilometragem_changed');
  try {
    await expect(pg.exec(readFileSync(new URL('../../../supabase/migrations/20260910050000_mobile_integration.sql', import.meta.url), 'utf8'))).rejects.toThrow('Schema divergente');
  } finally {
    await pg.exec('rollback; alter table public.frotas rename column quilometragem_changed to quilometragem');
  }
});

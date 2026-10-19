import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let pg: PGlite;
const finance = '0994bd2a-1e14-42b0-ad50-0d5f43e3cd31';
const employee = '0994bd2a-1e14-42b0-ad50-0d5f43e3cd32';
const other = '0994bd2a-1e14-42b0-ad50-0d5f43e3cd33';
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table storage.objects(id uuid, bucket_id text, name text);`);
  await pg.exec(readFileSync(new URL('./fixtures/destination-schema.sql', import.meta.url), 'utf8'));
  await pg.exec(readFileSync(new URL('../../../supabase/migrations/20261019000100_financeiro_cartoes_select.sql', import.meta.url), 'utf8'));
  for (const [id, role] of [[finance,'financeiro'],[employee,'funcionario'],[other,'funcionario']]) {
    await pg.query('insert into auth.users values ($1)', [id]);
    await pg.query('insert into profiles(id,nome,email,usuario,perfil) values ($1::uuid,$1::text,$1::text,$1::text,$2)', [id,role]);
  }
  await pg.query("insert into cartoes(user_id,banco,bandeira,ultimos_digitos,ativo) values ($1,'Banco A','Visa','1111',true),($2,'Banco B','Mastercard','2222',false)", [employee,other]);
});
afterAll(async () => { await pg?.close(); });
async function cardsAs(id: string, role = 'authenticated') {
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec(`set role ${role}`);
  try { return (await pg.query('select user_id, ativo from cartoes order by banco')).rows; }
  finally { await pg.exec('reset role'); }
}
it('financeiro reads cards belonging to every owner, including inactive cards', async () => {
  expect(await cardsAs(finance)).toEqual([{ user_id: employee, ativo: true },{ user_id: other, ativo: false }]);
});
it('employees still read only their own cards and anonymous users read none', async () => {
  expect(await cardsAs(employee)).toHaveLength(1);
  expect(await cardsAs('', 'anon')).toHaveLength(0);
});
it('an inactive finance profile does not receive the new global read permission', async () => {
  await pg.query('update profiles set ativo=false where id=$1', [finance]);
  expect(await cardsAs(finance)).toHaveLength(0);
});

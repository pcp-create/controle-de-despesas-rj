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

const group = '0994bd2a-1e14-42b0-ad50-0d5f43e3cd40';
const expense = '0994bd2a-1e14-42b0-ad50-0d5f43e3cd41';
beforeAll(async () => {
  await pg.exec(readFileSync(new URL('../../../supabase/migrations/20261020000100_corrigir_despesa_grupo.sql', import.meta.url), 'utf8'));
  await pg.query("insert into tipos_despesa(id,nome) values ($1,'Teste')", [group]);
  for (let i = 0; i < 3; i++) await pg.query(`insert into despesas(id,tecnico_id,tipo_despesa_id,cliente,numero_os,valor,data_despesa,data_vencimento,status_aprovacao,status_erp,parcelado,numero_parcelas,parcela_atual,grupo_parcela_id)
    values ($1,$2,$3,'Cliente','123',20,'2026-08-01','2026-10-19','AprovadoGestor','AprovadoGestorERPAtualizado',true,3,$4,$3)`, [expense.slice(0,-1) + (i+1), employee, group, i+1]);
});
async function correct(id: string, fields: object) {
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec('set role authenticated');
  try { return await pg.query('select corrigir_despesa_grupo($1,$2)', [expense, JSON.stringify(fields)]); }
  finally { await pg.exec('reset role'); }
}
it('redistributes the total exactly and preserves approval and due dates', async () => {
  await correct(finance, {valor: 100, cliente: 'Corrigido'});
  const {rows} = await pg.query('select valor::text, cliente, status_aprovacao, data_vencimento::text from despesas order by parcela_atual');
  expect(rows.map((r: any) => Number(r.valor))).toEqual([33.33,33.33,33.34]);
  expect(rows.every((r: any) => r.cliente === 'Corrigido' && r.status_aprovacao === 'AprovadoGestor' && r.data_vencimento === '2026-10-19')).toBe(true);
});
it('denies employees and protected fields', async () => {
  await expect(correct(employee, {valor: 50})).rejects.toThrow();
  await expect(correct(finance, {valor: 50, status_aprovacao: 'Rascunho'})).rejects.toThrow();
});
it('rolls back the entire group when a later installment fails', async () => {
  await pg.exec(`create function reject_last() returns trigger language plpgsql as $$ begin if NEW.parcela_atual = 3 then raise exception 'failure'; end if; return NEW; end $$;
    create trigger reject_last before update on despesas for each row execute function reject_last();`);
  await expect(correct(finance, {valor: 90})).rejects.toThrow();
  const {rows} = await pg.query('select sum(valor)::text as total from despesas');
  expect(Number((rows[0] as any).total)).toBe(100);
});

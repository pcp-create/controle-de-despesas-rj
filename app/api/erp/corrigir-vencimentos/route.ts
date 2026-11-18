import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createM8Client, novemberExpenses } from '@/lib/erp-due-repair.mjs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function context() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new Error('Não autenticado');
  const { data: profile } = await session.from('profiles').select('ativo,perfil').eq('id', user.id).single();
  if (!profile?.ativo || !['administrador', 'financeiro'].includes(profile.perfil)) throw new Error('Sem permissão para corrigir vencimentos');
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url) throw new Error('Configuração administrativa indisponível no servidor');
  const db = createAdmin(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return { user, db, secret };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha na correção de vencimento';
  return NextResponse.json({ error: message }, { status: message === 'Não autenticado' ? 401 : message.startsWith('Sem permissão') ? 403 : 400 });
}
function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update('rj-vencimentos-novembro-2026:' + value).digest('hex');
}

export async function GET() {
  try {
    const { db } = await context();
    createM8Client(process.env); // Valida a configuração antes de iniciar as 144 consultas.
    const rows = await novemberExpenses(db);
    return NextResponse.json({ ids: rows.map((d: any) => d.id) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { user, db, secret } = await context();
    const body = await request.json();
    if (!['conferir', 'aplicar'].includes(body.action) || typeof body.id !== 'string') throw new Error('Requisição inválida');
    const rows = await novemberExpenses(db);
    const d = rows.find((row: any) => row.id === body.id);
    if (!d) throw new Error('Despesa não pertence aos 144 envios de novembro/2026');
    const m8 = createM8Client(process.env);
    if (body.action === 'conferir') {
      const row = await m8.inspect(d);
      const proof = JSON.stringify({ userId: user.id, expires: Date.now() + 30 * 60 * 1000, row });
      return NextResponse.json({ row, proof, signature: signature(proof, secret) });
    }
    if (typeof body.proof !== 'string' || body.proof.length > 8000 || typeof body.signature !== 'string' || !/^[a-f0-9]{64}$/.test(body.signature)) throw new Error('Conferência ausente');
    if (!timingSafeEqual(Buffer.from(body.signature, 'hex'), Buffer.from(signature(body.proof, secret), 'hex'))) throw new Error('Conferência inválida');
    const proof = JSON.parse(body.proof);
    if (proof.userId !== user.id || proof.expires < Date.now() || proof.row.expenseId !== d.id) throw new Error('Conferência expirada ou incompatível');
    const log = async (entry: any) => {
      const { error } = await db.from('auditoria').insert({
        user_id: user.id, acao: 'UPDATE', entidade: 'despesa', entidade_id: d.id,
        detalhes: JSON.stringify({ operacao: 'correcao_vencimento_m8_novembro_2026', ...entry }),
      });
      if (error) throw new Error('Falha ao registrar auditoria da correção');
    };
    try {
      const row = await m8.correct(d, proof.row, log);
      return NextResponse.json({ row });
    } catch (error) {
      await log({ action: 'erro', message: error instanceof Error ? error.message : 'Falha desconhecida' });
      throw error;
    }
  } catch (error) { return failure(error); }
}

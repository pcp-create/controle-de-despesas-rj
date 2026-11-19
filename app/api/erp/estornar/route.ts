import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prepararEstornoERP } from '@/lib/erp-estorno';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: profile } = await db.from('profiles').select('perfil,ativo').eq('id', user.id).single();
  if (!profile?.ativo || !['administrador', 'financeiro'].includes(profile.perfil)) return NextResponse.json({ error: 'Sem permissão para estornar o envio ERP.' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }
  if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'Despesa inválida' }, { status: 400 });
  const { data: d, error } = await db.from('despesas').select('*').eq('id', body.id).single();
  if (error || !d) return NextResponse.json({ error: 'Despesa não encontrada' }, { status: 404 });
  if (d.erp_status === 'processando') return NextResponse.json({ error: 'Aguarde a integração terminar antes de estornar.' }, { status: 409 });
  const campos = prepararEstornoERP(d, user.id);
  let query = db.from('despesas').update(campos).eq('id', d.id);
  query = d.updated_at ? query.eq('updated_at', d.updated_at) : query.is('updated_at', null);
  const { data: saved, error: saveError } = await query.select('id').maybeSingle();
  if (saveError || !saved) return NextResponse.json({ error: saveError?.message || 'Despesa alterada por outra operação. Atualize a tela e tente novamente.' }, { status: 409 });
  // O histórico completo é persistido atomicamente junto com a limpeza do vínculo.
  await db.from('auditoria').insert({ user_id: user.id, acao: 'UPDATE', entidade: 'despesa', entidade_id: d.id,
    detalhes: `Estorno local ERP: ID ${d.erp_id ?? '—'}, documento ${d.numero_documento_erp ?? '—'} arquivados. Próximo envio criará novo documento. Cancelamento no M8 é manual.` });
  return NextResponse.json({ success: true });
}

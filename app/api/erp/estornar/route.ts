import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelarDocumentoM8 } from '@/lib/erp-cancelar';

import { prepararEstornoERP } from '@/lib/erp-estorno';

export const maxDuration = 120;

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
  if (!d.erp_id) return NextResponse.json({ error: 'Despesa sem documento ERP ativo para cancelar.' }, { status: 409 });
  const lockTime = new Date().toISOString();
  let lock = db.from('despesas').update({ erp_status: 'processando', updated_at: lockTime }).eq('id', d.id);
  lock = d.updated_at ? lock.eq('updated_at', d.updated_at) : lock.is('updated_at', null);
  const { data: locked, error: lockError } = await lock.select('updated_at').maybeSingle();
  if (lockError || !locked) return NextResponse.json({ error: 'Despesa alterada por outra operação. Atualize e tente novamente.' }, { status: 409 });
  try {
    const confirmacao = await cancelarDocumentoM8(d, process.env);
    const campos = prepararEstornoERP(d, user.id);
    const historico = campos.erp_resposta.historico_estornos;
    historico[historico.length - 1].cancelamento_m8 = confirmacao;
    const { data: saved, error: saveError } = await db.from('despesas').update(campos).eq('id', d.id)
      .eq('updated_at', locked.updated_at).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('M8 cancelado, mas o vínculo local não foi atualizado. Tente novamente para concluir o estorno.');
    await db.from('auditoria').insert({ user_id: user.id, acao: 'UPDATE', entidade: 'despesa', entidade_id: d.id,
      detalhes: `Cancelamento confirmado no M8: ID ${d.erp_id}, documento ${d.numero_documento_erp}. Documento arquivado; próximo envio criará novo número.` });
    return NextResponse.json({ success: true });
  } catch (error) {
    // Mantém IDs e etapas. Uma nova tentativa consulta o M8 antes de cancelar novamente.
    await db.from('despesas').update({ erp_status: d.erp_status, updated_at: new Date().toISOString() })
      .eq('id', d.id).eq('updated_at', locked.updated_at);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao cancelar no M8; vínculo mantido.' }, { status: 502 });
  }
}

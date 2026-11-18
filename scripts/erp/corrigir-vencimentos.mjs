import { createClient } from '@supabase/supabase-js';
import { writeFile, readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createM8Client, novemberExpenses, PERIOD } from '../../lib/erp-due-repair.mjs';

// Conferência: node --env-file=.env.local scripts/erp/corrigir-vencimentos.mjs conferir /tmp/rj-vencimentos
// Aplicação:   node --env-file=.env.local scripts/erp/corrigir-vencimentos.mjs aplicar /tmp/rj-vencimentos
const [action, directory] = process.argv.slice(2);
try {
  if (!['conferir', 'aplicar'].includes(action) || !directory) throw new Error('Use conferir|aplicar e um diretório local para o relatório');
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}`);
  const m8 = createM8Client(process.env);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const rows = await novemberExpenses(supabase);
  const planPath = resolve(dir, 'conferencia.json');
  if (action === 'conferir') {
    const plan = { createdAt: new Date().toISOString(), period: PERIOD, rows: [] };
    for (let index = 0; index < rows.length; index += 3) {
      const batch = await Promise.all(rows.slice(index, index + 3).map(async d => {
        try { return await m8.inspect(d); }
        catch (error) { return { expenseId: d.id, document: d.numero_documento_erp, status: 'revisar', error: error.message }; }
      }));
      plan.rows.push(...batch);
      await writeFile(planPath, JSON.stringify(plan, null, 2), { mode: 0o600 });
      console.log(`Conferidos ${plan.rows.length}/${rows.length}`);
    }
    console.log('Conferência finalizada:', planPath);
    console.log('Contagens:', JSON.stringify(plan.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})));
  } else {
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    if (plan.rows?.length !== PERIOD.expected || new Set(plan.rows.map(r => r.expenseId)).size !== PERIOD.expected || plan.rows.some(r => !rows.some(d => d.id === r.expenseId))) throw new Error('A seleção mudou ou a conferência está incompleta; execute conferir novamente');
    const results = [];
    const log = async entry => appendFile(resolve(dir, 'auditoria.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
    for (const r of plan.rows) {
      if (r.status !== 'corrigir') { results.push(r); continue; }
      try {
        // Reconsulta Supabase e M8 antes de cada PATCH, para não sobrescrever edições posteriores.
        const { data, error } = await supabase.from('despesas').select('*').eq('id', r.expenseId).single();
        if (error || !data) throw new Error('Despesa não disponível para reconferência');
        results.push(await m8.correct(data, r, log));
      } catch (error) {
        const result = { ...r, status: 'erro', error: error.message };
        await log(result);
        results.push(result);
      }
      await writeFile(resolve(dir, 'resultado.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
      console.log(`Processados ${results.length}/${plan.rows.length}`);
    }
    await writeFile(resolve(dir, 'resultado.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
    console.log('Contagens:', JSON.stringify(results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})));
    if (results.some(r => ['erro', 'revisar'].includes(r.status))) process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

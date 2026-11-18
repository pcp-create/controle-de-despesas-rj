"use client";

import { useEffect, useRef, useState } from 'react';

type Result = { expenseId: string; document?: string; currentDue?: string; due?: string; previousDue?: string; status: string; error?: string };

export default function CorrigirVencimentosNovembro() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function request(body?: unknown) {
    const response = await fetch('/api/erp/corrigir-vencimentos', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na correção');
    return data;
  }
  async function run() {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    setResults([]);
    setMessage('Identificando os 144 envios de novembro/2026…');
    const done: Result[] = [];
    try {
      const { ids } = await request();
      for (const id of ids) {
        if (!mounted.current) break;
        setMessage(`Conferindo e corrigindo ${done.length + 1} de ${ids.length}… Mantenha esta tela aberta.`);
        let row: Result = { expenseId: id, status: 'revisar' };
        try {
          const preview = await request({ action: 'conferir', id });
          row = preview.row;
          if (row.status === 'corrigir') {
            const corrected = await request({ action: 'aplicar', id, proof: preview.proof, signature: preview.signature });
            row = corrected.row;
          }
        } catch (error) {
          row = { ...row, status: 'revisar', error: error instanceof Error ? error.message : 'Falha de conexão' };
        }
        done.push(row);
        if (mounted.current) setResults([...done]);
      }
      if (mounted.current) setMessage(`Verificação encerrada: ${done.filter(r => r.status === 'corrigido').length} corrigidos, ${done.filter(r => r.status === 'correto').length} já corretos e ${done.filter(r => r.status === 'revisar').length} para revisão.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao consultar documentos');
    } finally {
      lock.current = false;
      if (mounted.current) setRunning(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'vencimentos-novembro-2026.json'; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <button type="button" className="text-sm font-medium text-primary" onClick={() => setOpen(!open)} aria-expanded={open}>Correção dos vencimentos enviados em novembro/2026</button>
      {open && <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">Confere os 144 documentos pela data de envio ao ERP e corrige o vencimento financeiro conforme cada despesa. Parcelas já corretas são preservadas; documentos ambíguos, com baixa ou borderô ficam para revisão.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={running} onClick={run} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{running ? 'Processando…' : 'Corrigir os 144 documentos'}</button>
          {results.length > 0 && <button type="button" onClick={download} className="rounded-lg border px-4 py-2 text-sm">Baixar relatório</button>}
        </div>
        {message && <p role="status" className="text-sm">{message}</p>}
        {results.length > 0 && <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Documento</th><th className="p-2">Anterior</th><th className="p-2">Correto</th><th className="p-2">Resultado</th></tr></thead><tbody>{results.map(r => <tr key={r.expenseId} className="border-t"><td className="p-2">{r.document || r.expenseId}</td><td className="p-2">{r.previousDue || r.currentDue || '—'}</td><td className="p-2">{r.due || '—'}</td><td className="p-2">{r.error || r.status}</td></tr>)}</tbody></table></div>}
      </div>}
    </section>
  );
}

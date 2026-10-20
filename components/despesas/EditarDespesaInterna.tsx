"use client";

import { useState } from "react";
import { useCartoesFinanceiro, useFrotas, useTiposDespesa, type Despesa } from "@/lib/supabase/hooks";
import { MoneyInput } from "@/components/ui/money-input";
import { pagamentoTipoConfig } from "@/lib/helpers";

export default function EditarDespesaInterna({ despesa, onClose, onSaved }: { despesa: Despesa; onClose: () => void; onSaved: () => void }) {
  const { tiposDespesa } = useTiposDespesa();
  const { frotas } = useFrotas();
  const { cartoes, isLoading, error: erroCartoes } = useCartoesFinanceiro();
  const [valor, setValor] = useState(String(despesa.valor));
  const [valorLitro, setValorLitro] = useState(despesa.valor_litro == null ? "" : String(despesa.valor_litro));
  const [pagamento, setPagamento] = useState<string>(despesa.pagamento_tipo || "cartao");
  const [cartao, setCartao] = useState(despesa.cartao_id || "");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const inputClass = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
  const selecionado = cartoes.find(c => c.id === cartao) ?? despesa.cartao;
  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const campos: Record<string, unknown> = Object.fromEntries(form.entries());
    for (const name of ["data_vencimento", "frota_id", "tipo_combustivel"]) campos[name] = campos[name] || null;
    for (const name of ["km_atual", "litros_abastecidos"]) campos[name] = campos[name] ? Number(campos[name]) : null;
    campos.valor = Number(valor);
    campos.valor_litro = valorLitro ? Number(valorLitro) : null;
    campos.pagamento_tipo = pagamento;
    campos.cartao_id = pagamento === "cartao" ? cartao || null : null;
    setSalvando(true); setErro("");
    try {
      const response = await fetch("/api/despesas/editar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: despesa.id, campos }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar");
      onSaved();
    } catch (error) { setErro(error instanceof Error ? error.message : "Não foi possível salvar"); }
    finally { setSalvando(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <form role="dialog" aria-modal="true" aria-labelledby="editar-interna-titulo" onSubmit={salvar} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
      <h2 id="editar-interna-titulo" className="text-lg font-semibold">Editar despesa{despesa.parcelado ? ` — parcela ${despesa.parcela_atual}/${despesa.numero_parcelas}` : ""}</h2>
      <p className="mt-1 text-sm text-muted-foreground">A correção mantém a aprovação e altera somente este registro.{despesa.lancado_erp || despesa.erp_status === "integrado" ? " Dados já enviados ao ERP não serão atualizados lá automaticamente." : ""}</p>
      <fieldset disabled={salvando} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs font-medium">Cliente<input name="cliente" defaultValue={despesa.cliente || ""} className={inputClass} /></label>
        <label className="text-xs font-medium">Número OS<input name="numero_os" defaultValue={despesa.numero_os || ""} className={inputClass} /></label>
        <label className="text-xs font-medium">Data da despesa<input required type="date" name="data_despesa" defaultValue={despesa.data_despesa?.slice(0, 10)} className={inputClass} /></label>
        <label className="text-xs font-medium">Vencimento<input type="date" name="data_vencimento" defaultValue={despesa.data_vencimento?.slice(0, 10)} className={inputClass} /></label>
        <label className="text-xs font-medium">Tipo de despesa<select required name="tipo_despesa_id" defaultValue={despesa.tipo_despesa_id || ""} className={inputClass}><option value="">Selecione</option>{tiposDespesa.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
        <label className="text-xs font-medium">Pagamento<select value={pagamento} onChange={e => setPagamento(e.target.value)} className={inputClass}>{Object.entries(pagamentoTipoConfig).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
        {pagamento === "cartao" && <div className="md:col-span-2 text-xs font-medium">Cartão<details className="mt-1 rounded-lg border border-input p-2" onToggle={e => { if (e.currentTarget.open) setBusca(""); }}><summary className="cursor-pointer">{cartao ? selecionado ? `${selecionado.apelido || selecionado.banco} · ${selecionado.ultimos_digitos}` : "Cartão atual" : "Sem cartão"}</summary><input aria-label="Filtrar cartões" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} placeholder="Banco, nome ou final do cartão" className={inputClass} /><div className="max-h-40 overflow-y-auto">{[{ id: "", banco: "Sem cartão", apelido: "", ultimos_digitos: "", ativo: true }, ...cartoes].filter(c => `${c.banco} ${c.apelido} ${c.ultimos_digitos}`.toLowerCase().includes(busca.toLowerCase())).map(c => <button type="button" key={c.id} onClick={e => { setCartao(c.id); e.currentTarget.closest("details")?.removeAttribute("open"); }} className="block w-full rounded px-2 py-2 text-left hover:bg-muted">{c.apelido || c.banco} {c.ultimos_digitos}{!c.ativo ? " (inativo)" : ""}</button>)}</div>{isLoading && <p>Carregando cartões...</p>}{erroCartoes && <p role="alert">Não foi possível consultar os cartões. O cartão atual será mantido.</p>}</details></div>}
        <label className="text-xs font-medium">Valor<MoneyInput required value={valor} onValueChange={setValor} className={inputClass} /></label>
        <label className="text-xs font-medium">Documento<input name="documento" defaultValue={despesa.documento || ""} className={inputClass} /></label>
        <label className="text-xs font-medium">Frota<select name="frota_id" defaultValue={despesa.frota_id || ""} className={inputClass}><option value="">Sem frota</option>{despesa.frota_id && !frotas.some(f => f.id === despesa.frota_id) && <option value={despesa.frota_id}>Frota atual</option>}{frotas.map(f => <option key={f.id} value={f.id}>{f.placa} — {f.modelo}</option>)}</select></label>
        <label className="text-xs font-medium">Quilometragem<input type="number" min="0" name="km_atual" defaultValue={despesa.km_atual ?? ""} className={inputClass} /></label>
        <label className="text-xs font-medium">Litros abastecidos<input type="number" min="0" step="0.001" name="litros_abastecidos" defaultValue={despesa.litros_abastecidos ?? ""} className={inputClass} /></label>
        <label className="text-xs font-medium">Valor / litro<MoneyInput value={valorLitro} onValueChange={setValorLitro} className={inputClass} /></label>
        <label className="text-xs font-medium">Combustível<input name="tipo_combustivel" defaultValue={despesa.tipo_combustivel || ""} className={inputClass} /></label>
        <label className="text-xs font-medium md:col-span-2">Observação<textarea name="observacao" defaultValue={despesa.observacao || ""} className={inputClass} rows={3} /></label>
      </fieldset>
      {erro && <p role="alert" className="mt-3 text-sm text-destructive">{erro}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={salvando} onClick={onClose} className="rounded-lg border px-4 py-2">Cancelar</button><button type="submit" disabled={salvando} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60">{salvando ? "Salvando..." : "Salvar alterações"}</button></div>
    </form>
  </div>;
}

"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { ArrowLeft, Upload, X, Info } from "lucide-react";
import { formatCurrency } from "@/lib/helpers";
import type { Despesa } from "@/lib/types";

interface Props {
  onBack: () => void;
}

export default function NovaDespesaPage({ onBack }: Props) {
  const { currentUser, tiposDespesa, cartoes, addDespesa } = useAppStore();
  const [form, setForm] = useState({
    dataDespesa: new Date().toISOString().slice(0, 10),
    cliente: "",
    numeroOS: "",
    tipoDespesaId: "",
    valor: "",
    documento: "",
    cartaoId: "",
    observacao: "",
  });
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const meusCartoes = cartoes.filter((c) => c.usuarioId === currentUser?.id && c.ativo);
  const tiposAtivos = tiposDespesa.filter((t) => t.ativo);
  const tipoSelecionado = tiposAtivos.find((t) => t.id === form.tipoDespesaId);
  const valorNum = parseFloat(form.valor) || 0;
  const acimaLimite =
    tipoSelecionado?.limiteMaximo !== undefined && valorNum > tipoSelecionado.limiteMaximo;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.dataDespesa) e.dataDespesa = "Obrigatório";
    if (!form.cliente.trim()) e.cliente = "Obrigatório";
    if (!form.numeroOS.trim()) e.numeroOS = "Obrigatório";
    if (!form.tipoDespesaId) e.tipoDespesaId = "Obrigatório";
    if (!form.valor || valorNum <= 0) e.valor = "Informe um valor válido";
    if (!form.documento.trim()) e.documento = "Obrigatório";
    if (meusCartoes.length > 0 && !form.cartaoId) e.cartaoId = "Selecione o cartão";
    if (tipoSelecionado?.exigeComprovante && !comprovanteFile) e.comprovante = "Comprovante obrigatório";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const cartao = meusCartoes.find((c) => c.id === form.cartaoId);
    const tipo = tipoSelecionado;

    const despesa: Omit<Despesa, "id" | "dataCriacao" | "dataAtualizacao"> = {
      tecnicoId: currentUser!.id,
      dataDespesa: form.dataDespesa,
      cliente: form.cliente,
      numeroOS: form.numeroOS,
      tipoDespesaId: form.tipoDespesaId,
      valor: valorNum,
      documento: form.documento,
      cartaoId: form.cartaoId || undefined,
      observacao: form.observacao,
      comprovanteNome: comprovanteFile?.name,
      statusAprovacao: "AguardandoGestor",
      statusERP: "EnviadoAguardandoGestor",
      erpId: `ERP-${Date.now()}`,
      erpPayload: JSON.stringify({
        cliente: form.cliente,
        os: form.numeroOS,
        tipo: tipo?.nome,
        valor: valorNum,
        complemento: `${form.cliente} ${form.numeroOS} ${tipo?.nome}`,
        observacao: `${form.observacao} Cartão: ${cartao ? `${cartao.nome} **** ${cartao.ultimos4}` : "N/A"}`,
        statusAprovacao: "AguardandoGestor",
        status: "Pendente",
      }),
      erpResposta: JSON.stringify({ success: true, id: `ERP-${Date.now()}`, message: "Lançado com sucesso" }),
    };

    addDespesa(despesa);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Despesa lançada!</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Sua despesa foi salva e enviada ao ERP. Aguardando aprovação do gestor.
        </p>
        <button
          onClick={onBack}
          className="mt-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          Ver minhas despesas
        </button>
      </div>
    );
  }

  const fieldClass = (key: string) =>
    `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring transition ${
      errors[key] ? "border-destructive bg-destructive/5" : "border-input bg-background"
    }`;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Nova Despesa</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">
        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Data da Despesa <span className="text-destructive">*</span></label>
            <input type="date" value={form.dataDespesa}
              onChange={(e) => setForm({ ...form, dataDespesa: e.target.value })}
              className={fieldClass("dataDespesa")} />
            {errors.dataDespesa && <p className="text-xs text-destructive">{errors.dataDespesa}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tipo de Despesa <span className="text-destructive">*</span></label>
            <select value={form.tipoDespesaId}
              onChange={(e) => setForm({ ...form, tipoDespesaId: e.target.value })}
              className={fieldClass("tipoDespesaId")}>
              <option value="">Selecione...</option>
              {tiposAtivos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            {errors.tipoDespesaId && <p className="text-xs text-destructive">{errors.tipoDespesaId}</p>}
          </div>
        </div>

        {/* Tipo info */}
        {tipoSelecionado && (
          <div className={`rounded-lg px-3 py-2.5 text-sm flex items-start gap-2 ${acimaLimite ? "bg-destructive/10 border border-destructive/20" : "bg-muted"}`}>
            <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${acimaLimite ? "text-destructive" : "text-muted-foreground"}`} />
            <div className="flex flex-col gap-0.5">
              {tipoSelecionado.limiteMaximo !== undefined && (
                <span className={acimaLimite ? "text-destructive font-medium" : "text-foreground"}>
                  {acimaLimite
                    ? `Despesa acima do limite permitido (${formatCurrency(tipoSelecionado.limiteMaximo)}). Será enviada para aprovação do gestor.`
                    : `Limite: ${formatCurrency(tipoSelecionado.limiteMaximo)}`}
                </span>
              )}
              {tipoSelecionado.exigeComprovante && <span className="text-muted-foreground text-xs">Comprovante obrigatório</span>}
              {tipoSelecionado.exigeAprovacaoAcimaLimite && !acimaLimite && (
                <span className="text-muted-foreground text-xs">Exige aprovação acima do limite</span>
              )}
              {tipoSelecionado.observacaoPadrao && (
                <span className="text-muted-foreground text-xs italic">{tipoSelecionado.observacaoPadrao}</span>
              )}
            </div>
          </div>
        )}

        {/* Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Cliente <span className="text-destructive">*</span></label>
            <input type="text" value={form.cliente} placeholder="Nome do cliente"
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              className={fieldClass("cliente")} />
            {errors.cliente && <p className="text-xs text-destructive">{errors.cliente}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">N° da OS <span className="text-destructive">*</span></label>
            <input type="text" value={form.numeroOS} placeholder="Ex: OS-12345"
              onChange={(e) => setForm({ ...form, numeroOS: e.target.value })}
              className={fieldClass("numeroOS")} />
            {errors.numeroOS && <p className="text-xs text-destructive">{errors.numeroOS}</p>}
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Valor (R$) <span className="text-destructive">*</span></label>
            <input type="number" step="0.01" min="0" value={form.valor} placeholder="0,00"
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              className={fieldClass("valor")} />
            {errors.valor && <p className="text-xs text-destructive">{errors.valor}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Documento <span className="text-destructive">*</span></label>
            <input type="text" value={form.documento} placeholder="NF, Cupom, etc."
              onChange={(e) => setForm({ ...form, documento: e.target.value })}
              className={fieldClass("documento")} />
            {errors.documento && <p className="text-xs text-destructive">{errors.documento}</p>}
          </div>
        </div>

        {/* Cartão */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Cartão Utilizado {meusCartoes.length > 0 && <span className="text-destructive">*</span>}</label>
          <select value={form.cartaoId}
            onChange={(e) => setForm({ ...form, cartaoId: e.target.value })}
            className={fieldClass("cartaoId")}>
            <option value="">Selecione o cartão...</option>
            {meusCartoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} – {c.bandeira} **** {c.ultimos4}
                {c.padrao ? " (padrão)" : ""}
              </option>
            ))}
          </select>
          {errors.cartaoId && <p className="text-xs text-destructive">{errors.cartaoId}</p>}
        </div>

        {/* Observação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Observação</label>
          <textarea value={form.observacao} rows={3} placeholder="Descreva detalhes da despesa..."
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
        </div>

        {/* Comprovante */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            Comprovante
            {tipoSelecionado?.exigeComprovante && <span className="text-destructive"> *</span>}
          </label>
          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-6 cursor-pointer transition ${
            errors.comprovante ? "border-destructive bg-destructive/5" : "border-border hover:border-accent hover:bg-accent/5"
          }`}>
            {comprovanteFile ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">{comprovanteFile.name}</span>
                <button type="button" onClick={(e) => { e.preventDefault(); setComprovanteFile(null); }}
                  className="text-muted-foreground hover:text-destructive transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Clique para anexar comprovante</span>
                <span className="text-xs text-muted-foreground/60">JPG, PNG, PDF até 10MB</span>
              </>
            )}
            <input type="file" accept="image/*,.pdf" className="hidden"
              onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)} />
          </label>
          {errors.comprovante && <p className="text-xs text-destructive">{errors.comprovante}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack}
            className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
            Cancelar
          </button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition">
            Lançar Despesa
          </button>
        </div>
      </form>
    </div>
  );
}

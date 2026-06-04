"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { ArrowLeft, Upload, X, Info, Save } from "lucide-react";
import { formatCurrency } from "@/lib/helpers";
import type { Despesa } from "@/lib/types";

interface Props {
  onBack: () => void;
  editDespesa?: Despesa | null;
}

export default function NovaDespesaPage({ onBack, editDespesa }: Props) {
  const { currentUser, tiposDespesa, cartoes, addDespesa, updateDespesa } = useAppStore();
  const isEditing = !!editDespesa;
  
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
  const [existingComprovante, setExistingComprovante] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(editDespesa?.id || null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Carregar dados se editando
  useEffect(() => {
    if (editDespesa) {
      setForm({
        dataDespesa: editDespesa.dataDespesa,
        cliente: editDespesa.cliente,
        numeroOS: editDespesa.numeroOS,
        tipoDespesaId: editDespesa.tipoDespesaId,
        valor: editDespesa.valor.toString(),
        documento: editDespesa.documento || "",
        cartaoId: editDespesa.cartaoId || "",
        observacao: editDespesa.observacao || "",
      });
      if (editDespesa.comprovanteNome) {
        setExistingComprovante(editDespesa.comprovanteNome);
      }
    }
  }, [editDespesa]);

  const meusCartoes = cartoes.filter((c) => c.usuarioId === currentUser?.id && c.ativo);
  const tiposAtivos = tiposDespesa.filter((t) => t.ativo);
  const tipoSelecionado = tiposAtivos.find((t) => t.id === form.tipoDespesaId);
  const valorNum = parseFloat(form.valor) || 0;
  const acimaLimite = tipoSelecionado?.limiteMaximo !== undefined && valorNum > tipoSelecionado.limiteMaximo;
  const dentroLimite = tipoSelecionado?.limiteMaximo !== undefined && valorNum <= tipoSelecionado.limiteMaximo;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.dataDespesa) e.dataDespesa = "Obrigatório";
    if (!form.cliente.trim()) e.cliente = "Obrigatório";
    if (!form.numeroOS.trim()) e.numeroOS = "Obrigatório";
    if (!form.tipoDespesaId) e.tipoDespesaId = "Obrigatório";
    if (!form.valor || valorNum <= 0) e.valor = "Informe um valor válido";
    if (!form.documento.trim()) e.documento = "Obrigatório";
    if (meusCartoes.length > 0 && !form.cartaoId) e.cartaoId = "Selecione o cartão";
    if (tipoSelecionado?.exigeComprovante && !comprovanteFile && !existingComprovante) {
      e.comprovante = "Comprovante obrigatório";
    }
    return e;
  };

  const buildDespesaData = () => ({
    tecnicoId: currentUser!.id,
    dataDespesa: form.dataDespesa,
    cliente: form.cliente,
    numeroOS: form.numeroOS,
    tipoDespesaId: form.tipoDespesaId,
    valor: valorNum,
    documento: form.documento,
    cartaoId: form.cartaoId || undefined,
    observacao: form.observacao,
    comprovanteNome: comprovanteFile?.name || existingComprovante || undefined,
    comprovanteUrl: comprovanteFile ? URL.createObjectURL(comprovanteFile) : editDespesa?.comprovanteUrl,
    statusAprovacao: "AguardandoGestor" as const,
    statusERP: "Rascunho" as const,
  });

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const data = buildDespesaData();

    if (savedId) {
      // Atualizar despesa existente
      updateDespesa(savedId, data);
      setFeedback({ type: "success", msg: "Despesa atualizada! Você pode continuar editando ou enviar." });
    } else {
      // Criar nova despesa como rascunho
      const newId = addDespesa(data);
      setSavedId(newId);
      setFeedback({ type: "success", msg: "Despesa salva como rascunho! Você pode continuar editando ou enviar." });
    }

    setErrors({});
    setTimeout(() => setFeedback(null), 4000);
  };

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
        <h1 className="text-lg font-bold text-foreground">
          {isEditing ? "Editar Despesa" : "Nova Despesa"}
        </h1>
        {savedId && (
          <span className="ml-auto px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium">
            Rascunho
          </span>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          feedback.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      <form onSubmit={handleSalvar} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">
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
          <div className={`rounded-lg px-3 py-2.5 text-sm flex items-start gap-2 ${
            acimaLimite 
              ? "bg-destructive/10 border border-destructive/20" 
              : dentroLimite 
                ? "bg-success/10 border border-success/20" 
                : "bg-muted"
          }`}>
            <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              acimaLimite ? "text-destructive" : dentroLimite ? "text-success" : "text-muted-foreground"
            }`} />
            <div className="flex flex-col gap-0.5">
              {tipoSelecionado.limiteMaximo !== undefined && (
                <span className={acimaLimite ? "text-destructive font-medium" : dentroLimite ? "text-success font-medium" : "text-foreground"}>
                  {acimaLimite
                    ? `Valor acima do limite (${formatCurrency(tipoSelecionado.limiteMaximo)}). Será enviada para aprovação do gestor.`
                    : `Valor dentro do limite (${formatCurrency(tipoSelecionado.limiteMaximo)}). Aprovação automática ao enviar.`}
                </span>
              )}
              {tipoSelecionado.exigeComprovante && <span className="text-muted-foreground text-xs">Comprovante obrigatório</span>}
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
            ) : existingComprovante ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">{existingComprovante}</span>
                <button type="button" onClick={(e) => { e.preventDefault(); setExistingComprovante(null); }}
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

        {/* Botões */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button type="button" onClick={onBack}
            className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
            Cancelar
          </button>
          <button type="submit"
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            Salvar Rascunho
          </button>
        </div>
      </form>
    </div>
  );
}

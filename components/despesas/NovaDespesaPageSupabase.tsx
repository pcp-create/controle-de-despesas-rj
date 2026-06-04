"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/auth-context";
import { useDespesas, useTiposDespesa, useCartoes, type Despesa } from "@/lib/supabase/hooks";
import { ArrowLeft, Upload, X, Info, Save } from "lucide-react";

interface Props {
  onBack: () => void;
  editDespesa?: Despesa | null;
}

export default function NovaDespesaPageSupabase({ onBack, editDespesa }: Props) {
  const { profile } = useAuth();
  const { tiposDespesa } = useTiposDespesa();
  const { cartoes } = useCartoes();
  const { addDespesa, updateDespesa } = useDespesas();

  const [form, setForm] = useState({
    tipoDespesaId: editDespesa?.tipo_despesa_id || "",
    cartaoId: editDespesa?.cartao_id || "",
    cliente: editDespesa?.cliente || "",
    numeroOS: editDespesa?.numero_os || "",
    valor: editDespesa?.valor?.toString() || "",
    documento: editDespesa?.documento || "",
    observacao: editDespesa?.observacao || "",
    dataDespesa: editDespesa?.data_despesa || new Date().toISOString().slice(0, 10),
  });
  
  const [comprovante, setComprovante] = useState<{ nome: string; url: string } | null>(
    editDespesa?.comprovante_nome ? { nome: editDespesa.comprovante_nome, url: editDespesa.comprovante_url || "" } : null
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const tipoSelecionado = tiposDespesa.find((t) => t.id === form.tipoDespesaId);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.tipoDespesaId) errs.tipoDespesaId = "Selecione o tipo";
    if (!form.cliente.trim()) errs.cliente = "Informe o cliente";
    if (!form.numeroOS.trim()) errs.numeroOS = "Informe o número da OS";
    if (!form.valor || isNaN(Number(form.valor)) || Number(form.valor) <= 0) errs.valor = "Valor inválido";
    if (!form.dataDespesa) errs.dataDespesa = "Informe a data";
    
    if (tipoSelecionado?.limite_maximo && Number(form.valor) > tipoSelecionado.limite_maximo) {
      errs.valor = `Valor excede o limite de R$ ${tipoSelecionado.limite_maximo.toFixed(2)}`;
    }
    if (tipoSelecionado?.exige_comprovante && !comprovante) {
      errs.comprovante = "Este tipo de despesa exige comprovante";
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setErrors({});

    const despesaData = {
      tipo_despesa_id: form.tipoDespesaId,
      cartao_id: form.cartaoId || null,
      cliente: form.cliente,
      numero_os: form.numeroOS,
      valor: Number(form.valor),
      documento: form.documento || null,
      observacao: form.observacao || null,
      data_despesa: form.dataDespesa,
      comprovante_nome: comprovante?.nome || null,
      comprovante_url: comprovante?.url || null,
      status_aprovacao: "AguardandoGestor" as const,
      status_erp: "Rascunho" as const,
      gestor_aprovador_id: null,
      justificativa_reprovacao: null,
      data_envio: null,
      data_aprovacao: null,
      erp_id: null,
      erp_payload: null,
      erp_resposta: null,
    };

    let result;
    if (editDespesa) {
      result = await updateDespesa(editDespesa.id, despesaData);
    } else {
      result = await addDespesa(despesaData);
    }

    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Despesa salva! Redirecionando..." });
      setTimeout(() => onBack(), 1500);
    }
    
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Simulação - em produção faria upload para Supabase Storage
      setComprovante({ nome: file.name, url: URL.createObjectURL(file) });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-muted transition text-muted-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {editDespesa ? "Editar Despesa" : "Nova Despesa"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Preencha os dados do lançamento
          </p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
          feedback.type === "success" 
            ? "bg-success/10 border border-success/20 text-success"
            : "bg-destructive/10 border border-destructive/20 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Tipo de Despesa *</label>
            <select
              value={form.tipoDespesaId}
              onChange={(e) => setForm({ ...form, tipoDespesaId: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              {tiposDespesa.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            {errors.tipoDespesaId && <span className="text-xs text-destructive">{errors.tipoDespesaId}</span>}
          </div>

          {/* Cartão */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Cartão</label>
            <select
              value={form.cartaoId}
              onChange={(e) => setForm({ ...form, cartaoId: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Nenhum</option>
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>{c.apelido || `${c.bandeira} *${c.ultimos_digitos}`}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Cliente *</label>
            <input
              type="text"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Nome do cliente"
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.cliente && <span className="text-xs text-destructive">{errors.cliente}</span>}
          </div>

          {/* OS */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Número da OS *</label>
            <input
              type="text"
              value={form.numeroOS}
              onChange={(e) => setForm({ ...form, numeroOS: e.target.value })}
              placeholder="OS-00000"
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.numeroOS && <span className="text-xs text-destructive">{errors.numeroOS}</span>}
          </div>

          {/* Valor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Valor (R$) *
              {tipoSelecionado?.limite_maximo && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Limite: R$ {tipoSelecionado.limite_maximo.toFixed(2)}
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              placeholder="0,00"
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.valor && <span className="text-xs text-destructive">{errors.valor}</span>}
          </div>

          {/* Data */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Data da Despesa *</label>
            <input
              type="date"
              value={form.dataDespesa}
              onChange={(e) => setForm({ ...form, dataDespesa: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.dataDespesa && <span className="text-xs text-destructive">{errors.dataDespesa}</span>}
          </div>
        </div>

        {/* Documento */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Documento
            {tipoSelecionado?.documento_padrao && (
              <span className="ml-2 text-xs text-muted-foreground">
                Sugestão: {tipoSelecionado.documento_padrao}
              </span>
            )}
          </label>
          <input
            type="text"
            value={form.documento}
            onChange={(e) => setForm({ ...form, documento: e.target.value })}
            placeholder="Número do cupom/nota"
            className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Observação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            placeholder="Informações adicionais..."
            rows={2}
            className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {/* Comprovante */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Comprovante
            {tipoSelecionado?.exige_comprovante && (
              <span className="text-destructive ml-1">*</span>
            )}
          </label>
          
          {comprovante ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{comprovante.nome}</p>
              </div>
              <button
                type="button"
                onClick={() => setComprovante(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-accent/50 hover:bg-accent/5 cursor-pointer transition">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Clique para anexar comprovante</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
          {errors.comprovante && <span className="text-xs text-destructive">{errors.comprovante}</span>}
        </div>

        {/* Info tipo */}
        {tipoSelecionado && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
            <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{tipoSelecionado.nome}</strong>
              {tipoSelecionado.descricao && <span> — {tipoSelecionado.descricao}</span>}
              {tipoSelecionado.limite_maximo && (
                <span className="block mt-1">Limite máximo: R$ {tipoSelecionado.limite_maximo.toFixed(2)}</span>
              )}
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? "Salvando..." : "Salvar Despesa"}
          </button>
        </div>
      </form>
    </div>
  );
}

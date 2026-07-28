"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useCartoes, useFrotas, type Despesa } from "@/lib/supabase/hooks";
import { uploadComprovante } from "@/lib/supabase/storage";
import { ArrowLeft, Upload, X, Info, Save, Loader2, BedDouble, CalendarRange, AlertTriangle, CheckCircle2, Fuel, Car, CreditCard, ChevronDown, ChevronUp, Banknote, Building2, Receipt, Search } from "lucide-react";
import { formatCurrency } from "@/lib/helpers";

interface Props {
  onBack: () => void;
  editDespesa?: Despesa | null;
}

// ─── Regra de vencimento ─────────────────────────────────────────────────────
// Lançado ATÉ dia 08: vence no dia 19 do mesmo mês
// Lançado APÓS dia 08: vence no dia 19 do mês seguinte
function calcularVencimento(dataDespesa: string, offsetMeses: number = 0): string {
  const dt = new Date(dataDespesa + "T12:00:00");
  const dia = dt.getDate();
  // Determina o mês base: se dia > 8, vai pro mês seguinte; depois soma os offsets de parcela
  const mesBase = dia <= 8 ? 0 : 1;
  const totalOffset = mesBase + offsetMeses;
  const venc = new Date(dt.getFullYear(), dt.getMonth() + totalOffset, 19);
  return venc.toISOString().slice(0, 10);
}

export default function NovaDespesaPageSupabase({ onBack, editDespesa }: Props) {
  const { currentUser } = useAppStore();
  const { tiposDespesa } = useTiposDespesa();
  const { cartoes } = useCartoes(currentUser?.id);
  const { addDespesa, updateDespesa } = useDespesas(currentUser?.id);
  const { frotas } = useFrotas();

  const [form, setForm] = useState({
    tipoDespesaId: editDespesa?.tipo_despesa_id || "",
    cartaoId: editDespesa?.cartao_id || "",
    cliente: editDespesa?.cliente || "",
    numeroOS: editDespesa?.numero_os || "",
    valor: editDespesa?.valor?.toString() || "",
    documento: editDespesa?.documento || "",
    observacao: editDespesa?.observacao || "",
    dataDespesa: editDespesa?.data_despesa || new Date().toISOString().slice(0, 10),
    // Campos de hospedagem
    dataCheckin:  editDespesa?.data_checkin  || "",
    dataCheckout: editDespesa?.data_checkout || "",
    // Campos de combustível — pré-seleciona veículo padrão em nova despesa
    frotaId: editDespesa?.frota_id || ((currentUser as any)?.frota_padrao_id as string | null) || "",
    kmAtual: editDespesa?.km_atual?.toString() || "",
    litrosAbastecidos: editDespesa?.litros_abastecidos?.toString() || "",
    valorLitro: editDespesa?.valor_litro?.toString() || "",
    tipoCombustivel: (editDespesa as any)?.tipo_combustivel || "",
  });

  // ─── Tipo de pagamento ───────────────────────────────────────────────────────
  const [pagamentoTipo, setPagamentoTipo] = useState<"cartao" | "dinheiro" | "faturado" | "boleto">(
    editDespesa?.pagamento_tipo ?? "cartao"
  );

  // ─── Parcelamento ────────────────────────────────────────────────────────────
  const [parcelado, setParcelado] = useState(editDespesa?.parcelado ?? false);
  const [numeroParcelas, setNumeroParcelas] = useState(editDespesa?.numero_parcelas ?? 2);

  const [comprovante, setComprovante] = useState<{ nome: string; url: string; path?: string } | null>(
    editDespesa?.comprovante_nome ? { nome: editDespesa.comprovante_nome, url: editDespesa.comprovante_url || "" } : null
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [migrationSql, setMigrationSql] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup-km-metricas")
      .then((r) => r.json())
      .then((d) => { if (d.needsMigration) setMigrationSql(d.sql); })
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const tipoSelecionado = tiposDespesa.find((t) => t.id === form.tipoDespesaId);
  const calculaDiarias = (tipoSelecionado as any)?.calculaDiarias === true || tipoSelecionado?.calcula_diarias === true;
  const isCombustivel = tipoSelecionado?.nome?.toLowerCase().includes("combust") ?? false;
  const frotasAtivas = frotas.filter((f) => f.ativo);

  // Combobox de veículo no bloco de abastecimento
  const frotaPadraoId = !editDespesa ? ((currentUser as any)?.frota_padrao_id as string | null) ?? null : null;
  const [mostrarListaFrota, setMostrarListaFrota] = useState(false);
  const [buscaFrota, setBuscaFrota] = useState("");

  // Quando faturado, apenas tipos de combustível ficam disponíveis
  const tiposDisponiveis = pagamentoTipo === "faturado"
    ? tiposDespesa.filter((t) => t.nome?.toLowerCase().includes("combust"))
    : tiposDespesa;

  // Calcula número de diárias em tempo real
  const numeroDiarias = useMemo(() => {
    if (!calculaDiarias || !form.dataCheckin || !form.dataCheckout) return null;
    const checkin  = new Date(form.dataCheckin);
    const checkout = new Date(form.dataCheckout);
    const diff = Math.floor((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [calculaDiarias, form.dataCheckin, form.dataCheckout]);

  // Valor por diária
  const valorPorDiaria = useMemo(() => {
    if (!numeroDiarias || !form.valor || isNaN(Number(form.valor))) return null;
    return Number(form.valor) / numeroDiarias;
  }, [numeroDiarias, form.valor]);

  // Status do valor em relação ao limite
  const statusLimite = useMemo(() => {
    const limite = tipoSelecionado?.limite_maximo;
    if (!limite) return null;
    if (calculaDiarias) {
      if (!valorPorDiaria) return null;
      return valorPorDiaria <= limite ? "ok" : "excede";
    }
    const valor = Number(form.valor);
    if (!valor) return null;
    return valor <= limite ? "ok" : "excede";
  }, [tipoSelecionado, calculaDiarias, valorPorDiaria, form.valor]);

  // ─── Cálculo de parcelas ─────────────────────────────────────────────────────
  const valorTotal = Number(form.valor) || 0;
  const qtdParcelas = parcelado ? Math.max(2, numeroParcelas) : 1;
  const valorParcela = valorTotal > 0 && qtdParcelas > 0 ? valorTotal / qtdParcelas : 0;

  const previewParcelas = useMemo(() => {
    if (!parcelado || !form.dataDespesa || valorTotal <= 0) return [];
    return Array.from({ length: qtdParcelas }, (_, i) => ({
      numero: i + 1,
      valor: valorParcela,
      vencimento: calcularVencimento(form.dataDespesa, i),
    }));
  }, [parcelado, form.dataDespesa, valorTotal, qtdParcelas, valorParcela]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.tipoDespesaId) errs.tipoDespesaId = "Selecione o tipo";
    if (pagamentoTipo === "cartao" && !form.cartaoId) errs.cartaoId = "Selecione o cartão";
    if (!form.documento) errs.documento = "Selecione o tipo de documento";
    if (!form.valor || isNaN(Number(form.valor)) || Number(form.valor) <= 0) errs.valor = "Valor inválido";
    if (!form.dataDespesa) errs.dataDespesa = "Informe a data";
    if (parcelado && numeroParcelas < 2) errs.numeroParcelas = "Mínimo de 2 parcelas";
    if (parcelado && numeroParcelas > 48) errs.numeroParcelas = "Máximo de 48 parcelas";
    if (statusLimite === "excede" && !form.observacao.trim()) {
      errs.observacao = "Observação obrigatória quando o valor excede o limite";
    }
    if (tipoSelecionado?.exige_comprovante && !comprovante) {
      errs.comprovante = "Este tipo de despesa exige comprovante";
    }
    if (calculaDiarias) {
      if (!form.dataCheckin) errs.dataCheckin = "Informe o check-in";
      if (!form.dataCheckout) errs.dataCheckout = "Informe o check-out";
      if (form.dataCheckin && form.dataCheckout && !numeroDiarias) {
        errs.dataCheckout = "Check-out deve ser posterior ao check-in";
      }
    }
    if (isCombustivel) {
      if (!form.frotaId) errs.frotaId = "Selecione o veículo";
      if (!form.tipoCombustivel) errs.tipoCombustivel = "Selecione o tipo de combustível";
      if (!form.kmAtual || isNaN(Number(form.kmAtual)) || Number(form.kmAtual) < 0)
        errs.kmAtual = "Informe o KM atual";
      if (!form.litrosAbastecidos || isNaN(Number(form.litrosAbastecidos)) || Number(form.litrosAbastecidos) <= 0)
        errs.litrosAbastecidos = "Informe os litros abastecidos";
      if (!form.valorLitro || isNaN(Number(form.valorLitro)) || Number(form.valorLitro) <= 0)
        errs.valorLitro = "Informe o valor por litro";
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

    // Base da despesa compartilhada por todas as parcelas
    const baseData = {
      tipo_despesa_id: form.tipoDespesaId,
      pagamento_tipo: pagamentoTipo,
      cartao_id: pagamentoTipo === "cartao" ? (form.cartaoId || null) : null,
      cliente: form.cliente,
      numero_os: form.numeroOS,
      documento: form.documento || null,
      observacao: form.observacao || null,
      data_despesa: form.dataDespesa,
      data_checkin:  calculaDiarias && form.dataCheckin  ? form.dataCheckin  : null,
      data_checkout: calculaDiarias && form.dataCheckout ? form.dataCheckout : null,
      numero_diarias: numeroDiarias ?? null,
      frota_id: isCombustivel && form.frotaId ? form.frotaId : null,
      km_atual: isCombustivel && form.kmAtual ? Number(form.kmAtual) : null,
      litros_abastecidos: isCombustivel && form.litrosAbastecidos ? Number(form.litrosAbastecidos) : null,
      valor_litro: isCombustivel && form.valorLitro ? Number(form.valorLitro) : null,
      tipo_combustivel: isCombustivel && form.tipoCombustivel ? form.tipoCombustivel : null,
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

    if (editDespesa) {
      // Edição: atualiza somente a despesa existente (sem regerar parcelas)
      const result = await updateDespesa(editDespesa.id, {
        ...baseData,
        valor: Number(form.valor),
        parcelado: parcelado,
        numero_parcelas: parcelado ? qtdParcelas : 1,
        parcela_atual: editDespesa.parcela_atual ?? 1,
        grupo_parcela_id: editDespesa.grupo_parcela_id ?? null,
        data_vencimento: calcularVencimento(form.dataDespesa, 0),
      });
      if (result.error) {
        setFeedback({ type: "error", msg: result.error });
      } else {
        setFeedback({ type: "success", msg: "Despesa atualizada! Redirecionando..." });
        setTimeout(() => onBack(), 1500);
      }
    } else if (parcelado) {
      // Criação parcelada: gera um grupo de parcelas com UUID compartilhado
      const grupoId = crypto.randomUUID();
      let hasError = false;

      for (let i = 0; i < qtdParcelas; i++) {
        const result = await addDespesa({
          ...baseData,
          valor: Number((valorParcela).toFixed(2)),
          parcelado: true,
          numero_parcelas: qtdParcelas,
          parcela_atual: i + 1,
          grupo_parcela_id: grupoId,
          data_vencimento: calcularVencimento(form.dataDespesa, i),
        });
        if (result.error) {
          setFeedback({ type: "error", msg: `Erro na parcela ${i + 1}: ${result.error}` });
          hasError = true;
          break;
        }
      }

      if (!hasError) {
        setFeedback({ type: "success", msg: `${qtdParcelas} parcelas criadas! Redirecionando...` });
        setTimeout(() => onBack(), 1500);
      }
    } else {
      // Criação simples
      const result = await addDespesa({
        ...baseData,
        valor: Number(form.valor),
        parcelado: false,
        numero_parcelas: 1,
        parcela_atual: 1,
        grupo_parcela_id: null,
        data_vencimento: calcularVencimento(form.dataDespesa, 0),
      });
      if (result.error) {
        setFeedback({ type: "error", msg: result.error });
      } else {
        setFeedback({ type: "success", msg: "Despesa salva! Redirecionando..." });
        setTimeout(() => onBack(), 1500);
      }
    }

    setLoading(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;

    if (file.size > 13 * 1024 * 1024) {
      setErrors({ ...errors, comprovante: "Arquivo deve ter no máximo 13MB" });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setErrors({ ...errors, comprovante: "Use JPG, PNG, GIF, WebP ou PDF." });
      return;
    }

    setUploading(true);
    setErrors({ ...errors, comprovante: "" });
    const result = await uploadComprovante(currentUser.id, file);
    if ("error" in result) {
      setErrors({ ...errors, comprovante: result.error });
    } else {
      setComprovante({ nome: result.nome, url: result.url, path: result.path });
    }
    setUploading(false);
  };

  return (
    <div className="max-w-2xl mx-auto">

      {/* Banner: migration pendente para campos de abastecimento */}
      {migrationSql && (
        <div className="flex flex-col gap-2 p-4 mb-4 rounded-xl border border-warning/40 bg-warning/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">Atualização de banco necessária</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Execute o SQL abaixo no <strong>Supabase SQL Editor</strong> (Dashboard → SQL Editor) para habilitar os campos de abastecimento. Após executar, recarregue a página.
              </p>
            </div>
            <button onClick={() => setMigrationSql(null)} className="text-muted-foreground hover:text-foreground transition shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded-lg text-foreground break-all select-all">
              {migrationSql}
            </code>
            <button
              onClick={() => {
                try {
                  const el = document.createElement("textarea");
                  el.value = migrationSql;
                  el.style.position = "fixed";
                  el.style.opacity = "0";
                  document.body.appendChild(el);
                  el.select();
                  document.execCommand("copy");
                  document.body.removeChild(el);
                } catch {}
              }}
              className="shrink-0 text-xs px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted transition font-medium"
            >
              Copiar SQL
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted transition text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {editDespesa ? "Editar Despesa" : "Nova Despesa"}
          </h1>
          <p className="text-sm text-muted-foreground">Preencha os dados do lançamento</p>
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

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">

        {/* -------- Forma de Pagamento -------- */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Forma de Pagamento <span className="text-destructive">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setPagamentoTipo("cartao")}
              className={`flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium transition-colors ${
                pagamentoTipo === "cartao"
                  ? "bg-primary text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              Cartão
            </button>
            <button
              type="button"
              onClick={() => { setPagamentoTipo("dinheiro"); setForm((f) => ({ ...f, cartaoId: "" })); setParcelado(false); }}
              className={`flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium transition-colors border-l border-input ${
                pagamentoTipo === "dinheiro"
                  ? "bg-success text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              Dinheiro
            </button>
            <button
              type="button"
              onClick={() => {
              setPagamentoTipo("faturado");
              setParcelado(false);
              setForm((f) => {
                const tipoAtual = tiposDespesa.find((t) => t.id === f.tipoDespesaId);
                const isCombust = tipoAtual?.nome?.toLowerCase().includes("combust");
                return { ...f, cartaoId: "", tipoDespesaId: isCombust ? f.tipoDespesaId : "" };
              });
            }}
              className={`flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium transition-colors border-t sm:border-t-0 border-l sm:border-l border-input ${
                pagamentoTipo === "faturado"
                  ? "bg-accent text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              Faturado
            </button>
            <button
              type="button"
              onClick={() => { setPagamentoTipo("boleto"); setForm((f) => ({ ...f, cartaoId: "" })); setParcelado(false); }}
              className={`flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium transition-colors border-t sm:border-t-0 border-l border-input ${
                pagamentoTipo === "boleto"
                  ? "bg-warning text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Receipt className="w-4 h-4 shrink-0" />
              Boleto
            </button>
          </div>
          {pagamentoTipo === "dinheiro" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Esta despesa irá para a aba de Reembolso. O financeiro processará o reembolso para você.
            </p>
          )}
          {pagamentoTipo === "faturado" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Despesa faturada diretamente para a empresa. Você não precisa pagar no ato — o financeiro irá conferir.
            </p>
          )}
          {pagamentoTipo === "boleto" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Pagamento via boleto. A despesa será registrada no Financeiro / ERP para conferência.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Tipo de Despesa <span className="text-destructive">*</span></label>
            <select
              value={form.tipoDespesaId}
              onChange={(e) => setForm({ ...form, tipoDespesaId: e.target.value, dataCheckin: "", dataCheckout: "" })}
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              {tiposDisponiveis.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            {errors.tipoDespesaId && <span className="text-xs text-destructive">{errors.tipoDespesaId}</span>}
          </div>

          {/* Cartão — só exibido quando pagamento for cartão */}
          {pagamentoTipo === "cartao" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Cartão <span className="text-destructive">*</span></label>
              <select
                value={form.cartaoId}
                onChange={(e) => setForm({ ...form, cartaoId: e.target.value })}
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione o cartão...</option>
                {cartoes.filter((c) => c.ativo).map((c) => {
                  const label = c.apelido
                    ? `${c.apelido} — ${c.banco} ${c.bandeira} *${c.ultimos_digitos}`
                    : `${c.banco} ${c.bandeira} *${c.ultimos_digitos}`;
                  return (
                    <option key={c.id} value={c.id}>{label}</option>
                  );
                })}
              </select>
              {errors.cartaoId && <span className="text-xs text-destructive">{errors.cartaoId}</span>}
            </div>
          )}

          {/* Cliente */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Cliente</label>
            <input
              type="text"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Nome do cliente"
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* OS */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Número da OS</label>
            <input
              type="text"
              value={form.numeroOS}
              onChange={(e) => setForm({ ...form, numeroOS: e.target.value })}
              placeholder="OS-00000"
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Valor total */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              {calculaDiarias ? "Valor total da nota (R$)" : "Valor (R$)"} <span className="text-destructive">*</span>
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

          {/* Data da despesa — sempre visível, seja hospedagem ou não */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Data da Despesa <span className="text-destructive">*</span></label>
            <input
              type="date"
              value={form.dataDespesa}
              onChange={(e) => setForm({ ...form, dataDespesa: e.target.value })}
              className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.dataDespesa && <span className="text-xs text-destructive">{errors.dataDespesa}</span>}
          </div>
        </div>

        {/* -------- Bloco de Parcelamento — cartão e boleto -------- */}
        {(pagamentoTipo === "cartao" || pagamentoTipo === "boleto") && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
          {/* Toggle parcelado */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">Despesa parcelada?</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={parcelado}
              onClick={() => setParcelado((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                parcelado ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  parcelado ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          {/* Campos expandidos quando parcelado */}
          {parcelado && (
            <div className="flex flex-col gap-3 pt-1 border-t border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Número de parcelas */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Número de Parcelas <span className="text-destructive">*</span></label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNumeroParcelas((v) => Math.max(2, v - 1))}
                      className="w-9 h-9 rounded-lg border border-input bg-background flex items-center justify-center hover:bg-muted transition"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={2}
                      max={48}
                      value={numeroParcelas}
                      onChange={(e) => setNumeroParcelas(Math.max(2, Math.min(48, Number(e.target.value))))}
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setNumeroParcelas((v) => Math.min(48, v + 1))}
                      className="w-9 h-9 rounded-lg border border-input bg-background flex items-center justify-center hover:bg-muted transition"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                  {errors.numeroParcelas && <span className="text-xs text-destructive">{errors.numeroParcelas}</span>}
                </div>

                {/* Valor por parcela */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Valor por Parcela</label>
                  <div className="px-3 py-2.5 rounded-lg border border-input bg-muted/50 text-sm font-semibold text-primary">
                    {valorParcela > 0 ? formatCurrency(valorParcela) : "—"}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {valorTotal > 0 && qtdParcelas > 0
                      ? `${qtdParcelas}x de ${formatCurrency(valorParcela)} = ${formatCurrency(valorTotal)}`
                      : "Informe o valor total acima"}
                  </span>
                </div>
              </div>

              {/* Preview das parcelas */}
              {previewParcelas.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Vencimentos calculados
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                    {previewParcelas.map((p) => (
                      <div
                        key={p.numero}
                        className="flex flex-col gap-0.5 p-2 rounded-lg bg-white border border-border text-xs"
                      >
                        <span className="text-muted-foreground font-medium">
                          Parcela {p.numero}/{qtdParcelas}
                        </span>
                        <span className="font-semibold text-foreground">{formatCurrency(p.valor)}</span>
                        <span className="text-primary">
                          Vence: {new Date(p.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Regra: lançado até dia 08 vence no dia 19 do mesmo mês; após dia 08 vence no dia 19 do mês seguinte. O Financeiro pode ajustar o vencimento após confirmação.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resumo de vencimento para despesa simples */}
          {!parcelado && form.dataDespesa && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                Vencimento previsto:{" "}
                <strong className="text-foreground">
                  {new Date(calcularVencimento(form.dataDespesa) + "T12:00:00").toLocaleDateString("pt-BR")}
                </strong>
                {" — editável pelo Financeiro após lançamento"}
              </span>
            </div>
          )}
        </div>
        )}

        {/* -------- Bloco de Hospedagem -------- */}
        {calculaDiarias && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-primary">
              <BedDouble className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">Período de Hospedagem</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Check-in */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Check-in <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  value={form.dataCheckin}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, dataCheckin: v }));
                  }}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.dataCheckin && <span className="text-xs text-destructive">{errors.dataCheckin}</span>}
              </div>

              {/* Check-out */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Check-out <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  value={form.dataCheckout}
                  min={form.dataCheckin || undefined}
                  onChange={(e) => setForm((f) => ({ ...f, dataCheckout: e.target.value }))}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.dataCheckout && <span className="text-xs text-destructive">{errors.dataCheckout}</span>}
              </div>
            </div>

            {/* Resumo diárias */}
            {numeroDiarias && (
              <div className="flex flex-col gap-2">
                {/* Linha de resumo */}
                <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg bg-white border border-border text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarRange className="w-4 h-4" />
                    <span>
                      <strong className="text-foreground">{numeroDiarias}</strong> diária{numeroDiarias > 1 ? "s" : ""}
                    </span>
                  </div>
                  {valorPorDiaria !== null && (
                    <div className="text-muted-foreground">
                      <strong className="text-foreground">{formatCurrency(valorPorDiaria)}</strong> / diária
                    </div>
                  )}
                </div>

                {/* Indicador de limite */}
                {tipoSelecionado?.limite_maximo && valorPorDiaria !== null && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    statusLimite === "ok"
                      ? "bg-success/10 border border-success/20 text-success"
                      : "bg-destructive/10 border border-destructive/20 text-destructive"
                  }`}>
                    {statusLimite === "ok" ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <span>
                      {statusLimite === "ok"
                        ? `Valor por diária (${formatCurrency(valorPorDiaria)}) dentro do limite de ${formatCurrency(tipoSelecionado.limite_maximo)} — aprovação automática.`
                        : `Valor por diária (${formatCurrency(valorPorDiaria)}) excede o limite de ${formatCurrency(tipoSelecionado.limite_maximo)} — será enviado para aprovação do gestor.`
                      }
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* -------- Bloco de Combustível -------- */}
        {isCombustivel && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-accent">
              <Fuel className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">Dados do Abastecimento</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Veículo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  Placa do Veículo *
                </label>
                {frotasAtivas.length === 0 ? (
                  <div className="px-3 py-2.5 rounded-lg border border-input bg-muted text-sm text-muted-foreground">
                    Nenhum veículo cadastrado na frota
                  </div>
                ) : (() => {
                  const veiculoPadrao = frotaPadraoId ? frotasAtivas.find((f) => f.id === frotaPadraoId) : null;
                  const veiculoSelecionado = form.frotaId ? frotasAtivas.find((f) => f.id === form.frotaId) : null;

                  return (
                    <div className="flex flex-col gap-1.5">
                      {!mostrarListaFrota ? (
                        /* ── Card do veículo selecionado ── */
                        veiculoSelecionado ? (
                          <div className="flex items-center justify-between px-4 py-3 rounded-lg border-2 border-primary bg-primary/5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                <Car className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {veiculoSelecionado.placa}
                                  {veiculoSelecionado.id === frotaPadraoId && (
                                    <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Padrão</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {veiculoSelecionado.marca} {veiculoSelecionado.modelo}
                                  {veiculoSelecionado.ano ? ` · ${veiculoSelecionado.ano}` : ""}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setMostrarListaFrota(true); setBuscaFrota(""); }}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0 ml-2"
                            >
                              Usar outro
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setMostrarListaFrota(true); setBuscaFrota(""); }}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-input hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground hover:text-primary"
                          >
                            <Car className="w-4 h-4" />
                            Selecionar veículo
                          </button>
                        )
                      ) : (
                        /* ── Combobox suspenso ── */
                        <div className="flex flex-col gap-1.5">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                              type="text"
                              autoFocus
                              value={buscaFrota}
                              onChange={(e) => setBuscaFrota(e.target.value)}
                              placeholder="Buscar por placa, marca ou modelo..."
                              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {/* Dropdown suspenso */}
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
                              <div className="max-h-56 overflow-y-auto">
                                {(() => {
                                  const q = buscaFrota.toLowerCase();
                                  const filtrados = frotasAtivas.filter((f) =>
                                    !q ||
                                    f.placa.toLowerCase().includes(q) ||
                                    f.marca.toLowerCase().includes(q) ||
                                    f.modelo.toLowerCase().includes(q) ||
                                    (f.tipo ?? "").toLowerCase().includes(q) ||
                                    (f.cor ?? "").toLowerCase().includes(q) ||
                                    String(f.ano ?? "").includes(q) ||
                                    (f.observacao ?? "").toLowerCase().includes(q)
                                  );
                                  if (filtrados.length === 0) return (
                                    <p className="px-4 py-5 text-sm text-muted-foreground text-center">
                                      Nenhum veículo encontrado.
                                    </p>
                                  );
                                  return filtrados.map((f) => (
                                    <button
                                      key={f.id}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setForm({ ...form, frotaId: f.id });
                                        setMostrarListaFrota(false);
                                        setBuscaFrota("");
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                                    >
                                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <Car className="w-3.5 h-3.5 text-muted-foreground" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                          {f.placa}
                                          {f.id === frotaPadraoId && (
                                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-normal">Padrão</span>
                                          )}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {f.marca} {f.modelo}{f.ano ? ` · ${f.ano}` : ""}
                                        </p>
                                      </div>
                                    </button>
                                  ));
                                })()}
                              </div>
                            </div>
                          </div>
                          {veiculoPadrao && (
                            <button
                              type="button"
                              onClick={() => {
                                setForm({ ...form, frotaId: frotaPadraoId! });
                                setMostrarListaFrota(false);
                                setBuscaFrota("");
                              }}
                              className="text-xs text-primary hover:underline self-start"
                            >
                              Voltar ao veículo padrão ({veiculoPadrao.placa})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {errors.frotaId && <span className="text-xs text-destructive">{errors.frotaId}</span>}
              </div>

              {/* KM Atual */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  KM Atual <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  value={form.kmAtual}
                  onChange={(e) => setForm({ ...form, kmAtual: e.target.value })}
                  placeholder="Ex: 45320"
                  min={0}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.kmAtual && <span className="text-xs text-destructive">{errors.kmAtual}</span>}
              </div>

              {/* Tipo de combustível */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Tipo de combustível <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["Gasolina", "Gasolina Aditivada", "Etanol", "Diesel S10", "Diesel S500"] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setForm({ ...form, tipoCombustivel: tipo })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                        form.tipoCombustivel === tipo
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>
                {errors.tipoCombustivel && <span className="text-xs text-destructive">{errors.tipoCombustivel}</span>}
              </div>

              {/* Litros e Valor/litro — lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Litros abastecidos <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={form.litrosAbastecidos}
                      onChange={(e) => setForm({ ...form, litrosAbastecidos: e.target.value })}
                      placeholder="Ex: 40.5"
                      min={0}
                      step={0.001}
                      className="w-full pl-3 pr-8 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">L</span>
                  </div>
                  {errors.litrosAbastecidos && <span className="text-xs text-destructive">{errors.litrosAbastecidos}</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Valor / litro <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                    <input
                      type="number"
                      value={form.valorLitro}
                      onChange={(e) => setForm({ ...form, valorLitro: e.target.value })}
                      placeholder="6,19"
                      min={0}
                      step={0.001}
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {errors.valorLitro && <span className="text-xs text-destructive">{errors.valorLitro}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Documento */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Documento <span className="text-destructive">*</span>
            {tipoSelecionado?.documento_padrao && (
              <span className="ml-2 text-xs text-muted-foreground">Sugestão: {tipoSelecionado.documento_padrao}</span>
            )}
          </label>
          <select
            value={form.documento}
            onChange={(e) => setForm({ ...form, documento: e.target.value })}
            className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Selecione o tipo de documento...</option>
            <option value="Nota Fiscal (NF)">Nota Fiscal (NF)</option>
            <option value="Cupom">Cupom</option>
          </select>
          {errors.documento && <span className="text-xs text-destructive">{errors.documento}</span>}
        </div>

        {/* Observação */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Observação
            {statusLimite === "excede" && <span className="text-destructive ml-1">*</span>}
            {statusLimite === "excede" && (
              <span className="ml-2 text-xs text-destructive font-normal">
                Obrigatória quando o valor excede o limite
              </span>
            )}
          </label>
          <textarea
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            placeholder={statusLimite === "excede" ? "Justifique o valor acima do limite..." : "Informações adicionais..."}
            rows={2}
            className={`px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none bg-background ${
              statusLimite === "excede" ? "border-destructive/50 focus:ring-destructive/40" : "border-input"
            }`}
          />
          {errors.observacao && <span className="text-xs text-destructive">{errors.observacao}</span>}
        </div>

        {/* Comprovante */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Comprovante
            {tipoSelecionado?.exige_comprovante && <span className="text-destructive ml-1">*</span>}
          </label>
          {comprovante ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{comprovante.nome}</p>
                {comprovante.url && (
                  <a href={comprovante.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                    Visualizar arquivo
                  </a>
                )}
              </div>
              <button type="button" onClick={() => setComprovante(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : uploading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-accent/50 bg-accent/5">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-sm text-muted-foreground">Enviando comprovante...</span>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-accent/50 hover:bg-accent/5 cursor-pointer transition">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Clique para anexar comprovante</span>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
            </label>
          )}
          {errors.comprovante && <span className="text-xs text-destructive">{errors.comprovante}</span>}
        </div>

        {/* Info tipo */}
        {tipoSelecionado && !calculaDiarias && tipoSelecionado.limite_maximo != null && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
            tipoSelecionado.limite_maximo === 0
              ? "bg-warning/5 border-warning/20 text-muted-foreground"
              : statusLimite === "ok"
              ? "bg-success/5 border-success/20 text-success"
              : statusLimite === "excede"
              ? "bg-destructive/5 border-destructive/20 text-destructive"
              : "bg-accent/5 border-accent/20 text-muted-foreground"
          }`}>
            {tipoSelecionado.limite_maximo === 0 ? (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
            ) : statusLimite === "ok" ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />
            ) : statusLimite === "excede" ? (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
            )}
            <span>
              {tipoSelecionado.limite_maximo === 0 && "Esta categoria não possui limite definido — qualquer valor será enviado para aprovação do gestor."}
              {tipoSelecionado.limite_maximo !== 0 && statusLimite === "ok" && `Valor dentro do limite de ${formatCurrency(tipoSelecionado.limite_maximo)} — aprovação automática.`}
              {tipoSelecionado.limite_maximo !== 0 && statusLimite === "excede" && `Valor excede o limite de ${formatCurrency(tipoSelecionado.limite_maximo)} — será enviado para aprovação do gestor.`}
              {tipoSelecionado.limite_maximo !== 0 && !statusLimite && <>Limite máximo: {formatCurrency(tipoSelecionado.limite_maximo)}</>}
            </span>
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

"use client";

import type { Despesa } from "@/lib/supabase/hooks";
import type { Profile } from "@/lib/supabase/hooks";
import {
  formatCurrency,
  formatDate,
  pagamentoTipoConfig,
} from "@/lib/helpers";
import {
  CreditCard,
  Layers,
  Car,
  Fuel,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Banknote,
  Send,
  ServerCrash,
  FileText,
  CalendarDays,
  User,
  Hash,
  Eye,
} from "lucide-react";

// ─── helpers locais ────────────────────────────────────────────────────────────
function fmt(dt: string | null | undefined) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <span className="text-sm text-foreground leading-snug">{value ?? <span className="text-muted-foreground/50">—</span>}</span>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function StatusChip({ ok, label, sub }: { ok: boolean; label: string; sub?: string | null }) {
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${
      ok ? "bg-success/5 border-success/20 text-success" : "bg-muted/40 border-border text-muted-foreground"
    }`}>
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        : <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />}
      <div>
        <p className="font-semibold leading-tight">{label}</p>
        {sub && <p className="text-muted-foreground mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  d: Despesa;
  parcelas?: Despesa[];
  parcelado?: boolean;
  numeroParcelas?: number;
  profiles: Profile[];
  /** Exibe a seção de Lançamentos (interno, ERP, reembolso). Padrão: true */
  showLancamentos?: boolean;
  /** Ações renderizadas no rodapé (botões de enviar, editar etc.) */
  acoes?: React.ReactNode;
}

export default function DespesaExpandida({
  d,
  parcelas = [],
  parcelado = false,
  numeroParcelas = 1,
  profiles,
  showLancamentos = true,
  acoes,
}: Props) {
  const tecnico    = profiles.find((p) => p.id === d.tecnico_id);
  const gestor     = profiles.find((p) => p.id === d.gestor_aprovador_id);
  const financeiro = profiles.find((p) => p.id === d.aprovado_financeiro_por);
  const reembBy    = profiles.find((p) => p.id === d.reembolso_processado_por);
  const lancadoBy  = profiles.find((p) => p.id === d.lancado_sistema_por);
  const erpBy      = profiles.find((p) => p.id === d.lancado_erp_por);

  const pagCfg = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"] ?? pagamentoTipoConfig.cartao;
  const isCombust = d.tipo_combustivel || d.litros_abastecidos;
  const isHosp    = d.data_checkin && d.data_checkout;

  return (
    <div className="px-4 pb-5 pt-4 border-t border-border bg-muted/20 space-y-5">

      {/* ── SEÇÃO 1: IDENTIFICAÇÃO ──────────────────────────────────── */}
      <div>
        <SectionTitle icon={<FileText className="w-3.5 h-3.5" />} label="Identificação" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <InfoRow label="Funcionário"   value={tecnico?.nome ?? d.tecnico_id} />
          <InfoRow label="Data da Despesa" value={formatDate(d.data_despesa)} />
          <InfoRow label="Criado em"     value={fmt(d.created_at)} />
          <InfoRow label="Cliente / OS"  value={d.cliente ? `${d.cliente}${d.numero_os ? ` — OS ${d.numero_os}` : ""}` : (d.numero_os ? `OS ${d.numero_os}` : null)} />
          <InfoRow label="Documento"     value={d.documento} />
          {d.data_vencimento && (
            <InfoRow
              label="Vencimento"
              value={<span className="text-warning font-medium">{formatDate(d.data_vencimento)}</span>}
            />
          )}
          {d.observacao && (
            <div className="col-span-2 sm:col-span-3">
              <InfoRow label="Observação" value={d.observacao} />
            </div>
          )}
          <div className="col-span-2 sm:col-span-3">
            <InfoRow label="ID Interno" value={<span className="font-mono text-xs text-muted-foreground">{d.id}</span>} />
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 2: PAGAMENTO ─────────────────────────────────────── */}
      <div>
        <SectionTitle icon={<CreditCard className="w-3.5 h-3.5" />} label="Pagamento" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tipo</span>
            <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium ${pagCfg.color}`}>
              {pagCfg.label}
            </span>
          </div>
          {d.cartao && (
            <div className="col-span-2">
              <InfoRow
                label="Cartão"
                value={
                  <span className="font-mono text-sm">
                    {d.cartao.banco} — {d.cartao.bandeira} **** {d.cartao.ultimos_digitos}
                    {d.cartao.apelido ? ` (${d.cartao.apelido})` : ""}
                    {d.cartao.empresa_id_m8 != null && (
                      <span className="ml-2 text-xs text-muted-foreground">M8: {d.cartao.empresa_id_m8}</span>
                    )}
                  </span>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 3: PARCELAMENTO ──────────────────────────────────── */}
      {parcelado && parcelas.length > 0 && (
        <div>
          <SectionTitle icon={<Layers className="w-3.5 h-3.5" />} label={`Parcelamento — ${numeroParcelas}x`} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {parcelas.map((p) => (
              <div key={p.id} className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-background border border-border text-xs">
                <span className="text-muted-foreground font-medium">{p.parcela_atual}/{numeroParcelas}</span>
                <span className="font-semibold text-foreground text-sm">{formatCurrency(Number(p.valor))}</span>
                {p.data_vencimento && (
                  <span className="text-warning">
                    Vence: {new Date(p.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 4: HOSPEDAGEM ────────────────────────────────────── */}
      {isHosp && (
        <div>
          <SectionTitle icon={<CalendarDays className="w-3.5 h-3.5" />} label="Hospedagem" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <InfoRow label="Check-in"  value={formatDate(d.data_checkin!)} />
            <InfoRow label="Check-out" value={formatDate(d.data_checkout!)} />
            {d.numero_diarias && (
              <InfoRow
                label="Diárias"
                value={
                  <span>
                    <strong>{d.numero_diarias}</strong> × {formatCurrency(Number(d.valor) / d.numero_diarias)}
                  </span>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 5: FROTA / COMBUSTÍVEL ──────────────────────────── */}
      {(d.frota || isCombust) && (
        <div>
          <SectionTitle icon={<Car className="w-3.5 h-3.5" />} label="Frota e Combustível" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {d.frota && (
              <>
                <InfoRow label="Placa"    value={<span className="font-mono font-semibold">{d.frota.placa}</span>} />
                <InfoRow label="Modelo"   value={d.frota.modelo} />
                {d.frota.km_media_litro && (
                  <InfoRow label="KM Médio" value={`${d.frota.km_media_litro} km/L`} />
                )}
              </>
            )}
            {d.km_atual && (
              <InfoRow label="KM Apontado" value={`${d.km_atual.toLocaleString("pt-BR")} km`} />
            )}
            {d.litros_abastecidos && (
              <InfoRow label="Litros" value={`${d.litros_abastecidos}L`} />
            )}
            {d.valor_litro && (
              <InfoRow label="Valor / Litro" value={formatCurrency(d.valor_litro)} />
            )}
            {d.tipo_combustivel && (
              <InfoRow label="Combustível" value={d.tipo_combustivel} />
            )}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 6: COMPROVANTE ──────────────────────────────────── */}
      {d.comprovante_nome && (
        <div>
          <SectionTitle icon={<FileText className="w-3.5 h-3.5" />} label="Comprovante" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground truncate flex-1">{d.comprovante_nome}</span>
            {d.comprovante_url && (
              <button
                onClick={() => window.open(d.comprovante_url!, "_blank")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 7: APROVAÇÃO ────────────────────────────────────── */}
      <div>
        <SectionTitle icon={<User className="w-3.5 h-3.5" />} label="Aprovação" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {d.status_aprovacao === "AguardandoGestor" && (
            <StatusChip ok={false} label="Aguardando aprovação do gestor" />
          )}
          {d.status_aprovacao === "AprovadoGestor" && (
            <StatusChip
              ok
              label={`Aprovado por ${gestor?.nome ?? "Gestor"}`}
              sub={fmt(d.data_aprovacao)}
            />
          )}
          {d.status_aprovacao === "Reprovado" && (
            <div className="col-span-2 flex items-start gap-2 p-2.5 rounded-lg border bg-destructive/5 border-destructive/20 text-destructive text-xs">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Reprovado por {gestor?.nome ?? "Gestor"} — {fmt(d.data_aprovacao)}</p>
                {d.justificativa_reprovacao && (
                  <p className="mt-1 text-destructive/80">{d.justificativa_reprovacao}</p>
                )}
              </div>
            </div>
          )}
          {d.aprovado_financeiro && (
            <StatusChip
              ok
              label={`Financeiro aprovado${financeiro?.nome ? ` por ${financeiro.nome}` : ""}`}
              sub={fmt(d.aprovado_financeiro_em)}
            />
          )}
        </div>
      </div>

      {/* ── SEÇÃO 8: LANÇAMENTOS ──────────────────────────────────── */}
      {showLancamentos && <div>
        <SectionTitle icon={<Building2 className="w-3.5 h-3.5" />} label="Lançamentos" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatusChip
            ok={d.lancado_sistema}
            label="Lançamento interno"
            sub={d.lancado_sistema
              ? `${fmt(d.lancado_sistema_em)}${lancadoBy?.nome ? ` — ${lancadoBy.nome}` : ""}`
              : "Pendente"}
          />
          <StatusChip
            ok={d.lancado_erp}
            label="Enviado ao ERP M8"
            sub={d.lancado_erp
              ? `${fmt(d.lancado_erp_em)}${erpBy?.nome ? ` — ${erpBy.nome}` : ""}${d.erp_id ? `\nID: ${d.erp_id}` : ""}`
              : d.pagamento_tipo === "faturado" ? "N/A (Faturado)" : "Pendente"}
          />
          <StatusChip
            ok={d.reembolso_processado}
            label="Reembolso"
            sub={d.reembolso_processado
              ? `${fmt(d.reembolso_processado_em)}${reembBy?.nome ? ` — ${reembBy.nome}` : ""}`
              : d.pagamento_tipo === "dinheiro" ? "Pendente" : "N/A"}
          />
        </div>

        {/* ERP ID + erro */}
        {(d.erp_id || d.erp_erro) && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {d.erp_id && (
              <InfoRow label="ERP ID" value={<span className="font-mono">{d.erp_id}</span>} />
            )}
            {d.erp_erro && (
              <div className="sm:col-span-2 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive">
                <ServerCrash className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Erro ERP {d.erp_etapa_erro ? `(Etapa ${d.erp_etapa_erro})` : ""}</p>
                  <p className="mt-0.5 text-destructive/80">{d.erp_erro}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      }

      {/* ── SEÇÃO 9: DATAS SISTEMA ────────────────────────────────── */}
      <div>
        <SectionTitle icon={<Hash className="w-3.5 h-3.5" />} label="Registro" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <InfoRow label="Criado em"     value={fmt(d.created_at)} />
          <InfoRow label="Atualizado em" value={fmt(d.updated_at)} />
          {d.data_envio && <InfoRow label="Enviado em" value={fmt(d.data_envio)} />}
        </div>
      </div>

      {/* ── AÇÕES ─────────────────────────────────────────────────── */}
      {acoes && <div className="flex flex-wrap gap-2 pt-1">{acoes}</div>}
    </div>
  );
}

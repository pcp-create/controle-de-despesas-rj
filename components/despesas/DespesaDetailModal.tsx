"use client";

import { useAppStore } from "@/lib/store";
import { X, FileText, Download, Image, File } from "lucide-react";
import type { Despesa } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  erpStatusColor,
  erpStatusLabel,
  approvalStatusColor,
  approvalStatusLabel,
} from "@/lib/helpers";

interface Props {
  despesa: Despesa;
  onClose: () => void;
}

export default function DespesaDetailModal({ despesa: d, onClose }: Props) {
  const { tiposDespesa, cartoes, users, currentUser } = useAppStore();
  const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
  const cartao = cartoes.find((c) => c.id === d.cartaoId);
  const tecnico = users.find((u) => u.id === d.tecnicoId);
  const gestor = users.find((u) => u.id === d.gestorAprovadorId);

  // Verifica se o usuário pode ver anexos (dono, gestor, financeiro, admin)
  const canViewAnexo =
    currentUser?.id === d.tecnicoId ||
    currentUser?.perfil === "gestor" ||
    currentUser?.perfil === "financeiro" ||
    currentUser?.perfil === "administrador";

  const isImage = d.comprovanteNome?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const isPDF = d.comprovanteNome?.match(/\.pdf$/i);

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm text-foreground">{value ?? "-"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            <h2 className="font-semibold text-foreground">Detalhe da Despesa</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-1">
          <div className="flex gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${approvalStatusColor[d.statusAprovacao]}`}>
              {approvalStatusLabel[d.statusAprovacao]}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${erpStatusColor[d.statusERP]}`}>
              {erpStatusLabel[d.statusERP]}
            </span>
          </div>

          {row("Técnico", tecnico?.nome)}
          {row("Data da Despesa", formatDate(d.dataDespesa))}
          {row("Cliente", d.cliente)}
          {row("N° da OS", d.numeroOS)}
          {row("Tipo de Despesa", tipo?.nome)}
          {row("Valor", <span className="font-semibold text-foreground">{formatCurrency(d.valor)}</span>)}
          {row("Documento", d.documento)}
          {row("Cartão Utilizado", cartao ? `${cartao.nome} – ${cartao.bandeira} **** ${cartao.ultimos4}` : "-")}
          {row("Observação", d.observacao)}
          
          {/* Seção de Comprovante */}
          {d.comprovanteNome && canViewAnexo && (
            <div className="mt-3 p-4 bg-muted/30 rounded-xl border border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Comprovante Anexado</p>
              <div className="flex items-start gap-3">
                <div className={`p-3 rounded-lg ${isImage ? "bg-accent/10" : "bg-primary/10"}`}>
                  {isImage ? (
                    <Image className="w-6 h-6 text-accent" />
                  ) : isPDF ? (
                    <FileText className="w-6 h-6 text-primary" />
                  ) : (
                    <File className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{d.comprovanteNome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isImage ? "Imagem" : isPDF ? "Documento PDF" : "Arquivo"} • Anexado em {formatDateTime(d.dataCriacao)}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        // Em produção, isso abriria o arquivo do storage
                        if (d.comprovanteUrl) {
                          window.open(d.comprovanteUrl, "_blank");
                        } else {
                          alert("Visualização do comprovante: " + d.comprovanteNome);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Visualizar
                    </button>
                    <button
                      onClick={() => {
                        // Em produção, isso baixaria o arquivo
                        alert("Download do comprovante: " + d.comprovanteNome);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted rounded-lg transition flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {d.comprovanteNome && !canViewAnexo && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
              Comprovante disponível apenas para o técnico responsável, gestor ou financeiro.
            </div>
          )}
          
          {row("ID ERP", d.erpId)}
          {row("Data do Lançamento", formatDateTime(d.dataCriacao))}

          {d.gestorAprovadorId && (
            <>
              {row("Gestor Aprovador", gestor?.nome)}
              {row("Data de Aprovação", formatDateTime(d.dataAprovacao ?? ""))}
            </>
          )}

          {d.justificativaReprovacao && row(
            "Justificativa de Reprovação",
            <span className="text-destructive">{d.justificativaReprovacao}</span>
          )}

          {d.erpPayload && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Payload ERP</p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(JSON.parse(d.erpPayload), null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-input text-sm font-medium hover:bg-muted transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

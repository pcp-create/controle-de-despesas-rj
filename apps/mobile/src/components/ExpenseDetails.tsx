import { useEffect, useRef, useState } from "react";
import { Receipt, CreditCard, UserRound, X, Eye } from "lucide-react";
import { db } from "../db";
import type { Catalog, Expense, LocalRecord } from "../model";
export default function ExpenseDetails({
  record,
  catalog,
  employee,
  onClose,
  onEdit,
}: {
  record: LocalRecord<Expense>;
  catalog?: Catalog;
  employee: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState<string>();
  const d = record.data;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    (async () => {
      const operation = await db.operations
        .where("owner")
        .equals(record.owner)
        .filter((o) => o.entity === d.id && !!o.attachmentId)
        .first();
      const attachment = operation?.attachmentId
        ? await db.attachments.get(operation.attachmentId)
        : undefined;
      if (attachment) url = URL.createObjectURL(attachment.blob);
      const remote =
        typeof d.comprovante_url === "string" &&
        /^https:\/\//.test(d.comprovante_url)
          ? d.comprovante_url
          : undefined;
      if (alive) setReceipt(url || remote);
      else if (url) URL.revokeObjectURL(url);
    })().catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [d.id, d.comprovante_url, record.owner]);
  const date = (value: unknown) =>
    typeof value === "string" && value
      ? value.slice(0, 10).split("-").reverse().join("/")
      : "—";
  const timestamp = (value: unknown) =>
    typeof value === "string" && Number.isFinite(Date.parse(value))
      ? new Date(value).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";
  const card = catalog?.cards.find((c) => c.id === d.cartao_id);
  const approved = d.status_aprovacao === "AprovadoGestor";
  const rejected = d.status_aprovacao === "Reprovado";
  return (
    <dialog
      ref={dialog}
      className="expense-detail-dialog"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="detail-top">
        <div>
          <h2>
            {catalog?.types.find((t) => t.id === d.tipo_despesa_id)?.nome ||
              "Despesa"}
          </h2>
          <strong>
            {Number(d.valor).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </strong>
        </div>
        <button
          className="text-button"
          aria-label="Fechar detalhes"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <section>
        <h3>
          <Receipt size={18} />
          Identificação
        </h3>
        <dl className="detail-grid">
          <div>
            <dt>Funcionário</dt>
            <dd>{employee}</dd>
          </div>
          <div>
            <dt>Data da despesa</dt>
            <dd>
              {date(d.data_despesa)} {d.hora_despesa || ""}
            </dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>{timestamp(d.created_at)}</dd>
          </div>
          <div>
            <dt>Cliente / OS</dt>
            <dd>
              {[d.cliente, d.numero_os].filter(Boolean).join(" / ") || "—"}
            </dd>
          </div>
          <div>
            <dt>Documento</dt>
            <dd>{d.documento || "—"}</dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd className="detail-due">{date(d.data_vencimento)}</dd>
          </div>
          <div className="detail-wide">
            <dt>Observação</dt>
            <dd>{d.observacao || "—"}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>
          <CreditCard size={18} />
          Pagamento
        </h3>
        <dl className="detail-grid">
          <div>
            <dt>Tipo</dt>
            <dd>
              <span className="badge">
                {{
                  cartao: "Cartão",
                  dinheiro: "Dinheiro",
                  faturado: "Faturado",
                  boleto: "Boleto",
                }[String(d.pagamento_tipo)] || "—"}
              </span>
            </dd>
          </div>
          <div>
            <dt>Parcela</dt>
            <dd>
              {String(d.parcela_atual || 1)} de {String(d.numero_parcelas || 1)}
            </dd>
          </div>
          {d.pagamento_tipo === "cartao" && (
            <div className="detail-wide">
              <dt>Cartão</dt>
              <dd>
                {card
                  ? `${card.banco} · **** ${card.ultimos_digitos}${card.apelido ? ` (${card.apelido})` : ""}`
                  : "Cartão não disponível nos cadastros locais"}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section>
        <h3>
          <Receipt size={18} />
          Comprovante
        </h3>
        <div className="detail-receipt">
          <span>
            {d.comprovante_nome ||
              (receipt
                ? "Comprovante da despesa"
                : "Sem comprovante disponível")}
          </span>
          {receipt && (
            <a href={receipt} target="_blank" rel="noreferrer">
              <Eye size={18} />
              Ver
            </a>
          )}
        </div>
      </section>
      <section>
        <h3>
          <UserRound size={18} />
          Aprovação
        </h3>
        <div
          className={`detail-approval ${record.pending ? "expense-pending-send" : approved ? "expense-approved" : rejected ? "expense-rejected" : "expense-awaiting"}`}
        >
          <strong>
            {record.pending
              ? "Aguardando envio"
              : approved
                ? "Aprovada"
                : rejected
                  ? "Reprovada"
                  : "Aguardando aprovação"}
            {!record.pending && (approved || rejected) && d.aprovador_nome && ` por ${String(d.aprovador_nome)}`}
          </strong>
          {rejected && (
            <p>
              Motivo: {String(d.justificativa_reprovacao || "Não informado")}
            </p>
          )}
          {d.data_aprovacao && <p>{timestamp(d.data_aprovacao)}</p>}
        </div>
        {rejected && !record.pending && (
          <button className="detail-edit" onClick={onEdit}>
            Ajustar e reenviar
          </button>
        )}
      </section>
    </dialog>
  );
}

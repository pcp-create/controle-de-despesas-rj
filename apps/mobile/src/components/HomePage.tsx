import { useState } from "react";
import {
  MoreVertical,
  Receipt,
  Car,
  FilePlus2,
  ChevronRight,
  Search,
  Filter,
  Eye,
  Pencil,
  Fuel,
  CalendarDays,
  UserRound,
  Info,
  Clock,
  CreditCard,
} from "lucide-react";
import ExpenseDetails from "./ExpenseDetails";
import type { Catalog, Expense, LocalRecord } from "../model";
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const status = (e: LocalRecord<Expense>) =>
  e.pending
    ? "send"
    : e.data.status_aprovacao === "Reprovado"
      ? "rejected"
      : e.data.status_aprovacao === "AprovadoGestor"
        ? "approved"
        : "awaiting";
const labels = {
  send: "Aguardando envio",
  rejected: "Reprovada",
  approved: "Aprovada",
  awaiting: "Aguardando aprovação",
};
const colors = {
  send: "expense-pending-send",
  rejected: "expense-rejected",
  approved: "expense-approved",
  awaiting: "expense-awaiting",
};
export default function HomePage({
  employee,
  expenses,
  catalog,
  onNew,
  onKm,
  onEdit,
}: {
  employee: string;
  expenses: LocalRecord<Expense>[];
  catalog?: Catalog;
  onNew: () => void;
  onKm: () => void;
  onEdit: (expense: Expense) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("recent");
  const [filters, setFilters] = useState(false);
  const [payment, setPayment] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const typeName = (e: Expense) =>
    catalog?.types.find((t) => t.id === e.tipo_despesa_id)?.nome || "Despesa";
  const matches = (e: LocalRecord<Expense>, key: string) =>
    key === "all" ||
    (key === "pending"
      ? ["send", "awaiting"].includes(status(e))
      : status(e) === key);
  const normalized = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = expenses
    .filter(
      (e) =>
        matches(e, tab) &&
        (!payment || e.data.pagamento_tipo === payment) &&
        normalized(
          [
            typeName(e.data),
            e.data.cliente,
            e.data.observacao,
            e.data.justificativa_reprovacao,
            e.data.numero_os,
          ].join(" "),
        ).includes(normalized(query)),
    )
    .sort((a, b) =>
      sort === "value"
        ? Number(b.data.valor) - Number(a.data.valor)
        : sort === "oldest"
          ? a.data.data_despesa.localeCompare(b.data.data_despesa)
          : b.data.data_despesa.localeCompare(a.data.data_despesa),
    );
  const sum = (rows: LocalRecord<Expense>[]) =>
    money(rows.reduce((s, e) => s + Number(e.data.valor), 0));
  const detail = expenses.find((e) => e.key === selected);
  return (
    <>
      <section className="home-summary">
        <div className="home-summary-total">
          <p>SEU RESUMO NO APARELHO</p>
          <strong>{sum(expenses)}</strong>
          <span>{expenses.length} parcela(s) / despesa(s) armazenadas</span>
          <small>
            Histórico: até 200 parcelas recentes, mais lançamentos locais.
          </small>
        </div>
        <div className="home-summary-stats">
          <div>
            <Receipt size={20} />
            <span>
              Total de despesas<strong>{expenses.length}</strong>
            </span>
          </div>
          <div>
            <CreditCard size={20} />
            <span>
              Valor aprovado
              <strong className="summary-approved">
                {sum(expenses.filter((e) => status(e) === "approved"))}
              </strong>
            </span>
          </div>
          <div>
            <Clock size={20} />
            <span>
              Pendentes / ajuste
              <strong className="summary-pending">
                {sum(expenses.filter((e) => status(e) !== "approved"))}
              </strong>
            </span>
          </div>
        </div>
      </section>
      <div className="quick-actions home-actions">
        <button aria-label="Nova despesa" onClick={onNew} disabled={!catalog}>
          <FilePlus2 />
          <span>
            Nova despesa<small>Registrar um novo gasto</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button
          aria-label="Registrar KM"
          className="secondary"
          onClick={onKm}
          disabled={!catalog}
        >
          <Car />
          <span>
            Registrar KM<small>Adicionar km da viagem</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="home-list-heading">
        <h2>
          Suas despesas <span>({expenses.length})</span>
        </h2>
        <select
          aria-label="Ordenar despesas"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="value">Maior valor</option>
        </select>
      </div>
      <div className="home-search">
        <label>
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Buscar despesas"
            placeholder="Buscar despesa, cliente ou motivo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          aria-expanded={filters}
          onClick={() => setFilters(!filters)}
        >
          <Filter size={16} />
          Filtros
        </button>
      </div>
      {filters && (
        <label className="home-payment-filter">
          Forma de pagamento
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">Todas</option>
            <option value="cartao">Cartão</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="faturado">Faturado</option>
            <option value="boleto">Boleto</option>
          </select>
        </label>
      )}
      <div className="home-tabs" aria-label="Status das despesas">
        {[
          ["all", "Todas"],
          ["pending", "Pendentes"],
          ["approved", "Aprovadas"],
          ["rejected", "Reprovadas"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label} ({expenses.filter((e) => matches(e, key)).length})
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="empty">
          {expenses.length
            ? "Nenhuma despesa encontrada com esses filtros."
            : "Suas despesas aparecerão aqui, mesmo sem internet."}
        </p>
      )}
      {visible.map((e) => {
        const state = status(e);
        return (
          <article className="home-expense clean-expense" key={e.key}>
            <div className="home-expense-body">
              <div className="clean-expense-title">
                <strong>{typeName(e.data)}</strong>
                <strong>{money(Number(e.data.valor))}</strong>
              </div>
              <p className="home-expense-meta">
                {e.data.data_despesa.split("-").reverse().join("/")} ·{" "}
                {e.data.cliente || "Sem cliente"}
              </p>
              <div className="clean-expense-status">
                <span className={`badge ${colors[state]}`}>
                  {labels[state]}
                </span>
                {state === "rejected" && (
                  <p className="home-rejection">
                    Motivo:{" "}
                    {String(e.data.justificativa_reprovacao || "Não informado")}
                  </p>
                )}
              </div>
            </div>
            <div className="clean-expense-controls">
              <button
                aria-label="Ações da despesa"
                aria-expanded={menu === e.key}
                onClick={() => setMenu(menu === e.key ? null : e.key)}
              >
                <MoreVertical size={17} />
              </button>
              {menu === e.key && (
                <div className="expense-action-menu">
                  <button
                    onClick={() => {
                      setSelected(e.key);
                      setMenu(null);
                    }}
                  >
                    Ver detalhes
                  </button>
                  {state === "rejected" && (
                    <button onClick={() => onEdit(e.data)}>
                      Ajustar e reenviar
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
      {detail && (
        <ExpenseDetails
          record={detail}
          catalog={catalog}
          employee={employee}
          onClose={() => setSelected(null)}
          onEdit={() => onEdit(detail.data)}
        />
      )}
      <div className="home-storage-note">
        <Info size={23} />
        <div>
          <strong>Despesas armazenadas no aparelho</strong>
          <p>
            Os lançamentos pendentes serão sincronizados com o app aberto quando
            houver conexão com a internet.
          </p>
        </div>
      </div>
    </>
  );
}

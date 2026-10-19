import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  Upload,
  CheckCircle2,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  Info,
} from "lucide-react";
import { db, saveExpense } from "../db";
import { message } from "../ui";
import {
  localDate,
  validateReceipt,
  type Catalog,
  type Expense,
  type Payload,
} from "../model";

const documentTypes = ["Nota Fiscal (NF)", "Cupom"];
const fuelTypes = [
  "Gasolina",
  "Gasolina Aditivada",
  "Etanol",
  "Diesel S10",
  "Diesel S500",
];

function dueDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const due = new Date(year, month - 1 + (day > 8 ? 1 : 0), 19);
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-19`;
}
const localTime = () => new Date().toTimeString().slice(0, 5);

export default function ExpenseForm({
  owner,
  catalog,
  onSaved,
  editing,
  onCancel,
}: {
  owner: string;
  catalog: Catalog;
  onSaved: () => void;
  editing?: Expense;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Payload>({
    id: crypto.randomUUID(),
    valor: 0,
    tipo_despesa_id: "",
    cliente: "",
    numero_os: "",
    documento: "",
    data_despesa: localDate(),
    hora_despesa: localTime(),
    data_vencimento: localDate(),
    pagamento_tipo: "cartao",
    numero_parcelas: 1,
    enviar: true,
    cartao_id: catalog.cards.find((c) => c.is_padrao)?.id || "",
  });
  const [parcelado, setParcelado] = useState(false);
  const [photo, setPhoto] = useState<File>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (editing) {
      setForm({
        ...editing,
        numero_parcelas: 1,
        hora_despesa: editing.hora_despesa || localTime(),
        enviar: true,
        expected_updated_at: editing.updated_at || "",
      });
      setReady(true);
      return;
    }
    let live = true;
    db.drafts
      .get(owner)
      .then((d) => {
        if (!live) return;
        if (d) {
          setParcelado(Number(d.payload.numero_parcelas) > 1);
          setForm({
            ...d.payload,
            hora_despesa: d.payload.hora_despesa || localTime(),
          });
          if (d.photo)
            setPhoto(
              new File([d.photo], d.photoName || "comprovante.jpg", {
                type: d.photo.type,
              }),
            );
        }
        setReady(true);
      })
      .catch((e) => setError(message(e)));
    return () => {
      live = false;
    };
  }, [owner]);
  useEffect(() => {
    if (!ready || busy || editing) return;
    // Serialize writes so an older photo/form cannot overwrite a newer draft.
    draftWrites.current = draftWrites.current
      .catch(() => {})
      .then(() =>
        db.drafts.put({ owner, payload: form, photo, photoName: photo?.name }),
      );
    draftWrites.current.catch(() =>
      setError(
        "Não foi possível preservar o rascunho no aparelho. Verifique o espaço disponível.",
      ),
    );
  }, [owner, form, photo, ready, busy]);
  const type = catalog.types.find((t) => t.id === form.tipo_despesa_id);
  const installments = parcelado;
  const count = Number(form.numero_parcelas) || 1;
  const cents = Math.round(Number(form.valor) * 100);
  const money = (value: number) =>
    (value / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const due = form.data_despesa ? dueDate(String(form.data_despesa)) : "";
  const fuel = type?.nome.toLowerCase().includes("combust");
  function field(key: string, label: string, kind = "text", required = false) {
    return (
      <label>
        <span>
          {label}
          {required && (
            <span className="required-mark" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </span>
        <input
          type={kind}
          value={String(form[key] ?? "")}
          required={required}
          min={kind === "number" ? 0 : undefined}
          step={kind === "number" ? "0.01" : undefined}
          onChange={(e) =>
            setForm({
              ...form,
              [key]:
                kind === "number" ? Number(e.target.value) : e.target.value,
            })
          }
        />
      </label>
    );
  }
  function moneyField(key: string, label: string) {
    return (
      <label>
        <span>
          {label}{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </span>
        <input
          type="text"
          inputMode="numeric"
          required
          placeholder="0,00"
          value={
            Number(form[key]) > 0
              ? Number(form[key]).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : ""
          }
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
            if (digits.length > 12) return;
            setForm({ ...form, [key]: digits ? Number(digits) / 100 : 0 });
          }}
        />
      </label>
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!type) throw new Error("Selecione um tipo de despesa.");
      if (type.exige_comprovante && !photo && !editing?.comprovante_url)
        throw new Error("Anexe o comprovante.");
      if (form.pagamento_tipo === "cartao" && !form.cartao_id)
        throw new Error("Selecione seu cartão.");
      if (
        !Number.isInteger(Number(form.numero_parcelas)) ||
        Number(form.numero_parcelas) < (installments ? 2 : 1) ||
        Number(form.numero_parcelas) > 48
      )
        throw new Error("Informe de 1 a 48 parcelas.");
      if (
        type.calcula_diarias &&
        (!form.data_checkin ||
          !form.data_checkout ||
          String(form.data_checkout) <= String(form.data_checkin))
      )
        throw new Error("Confira as datas da hospedagem.");
      const days = type.calcula_diarias
        ? (Date.parse(String(form.data_checkout)) -
            Date.parse(String(form.data_checkin))) /
          86400000
        : 1;
      if (
        type.limite_maximo != null &&
        Number(form.valor) / days > type.limite_maximo &&
        !String(form.observacao || "").trim()
      )
        throw new Error(
          "Informe uma justificativa para o valor acima do limite.",
        );
      if (Math.round(Number(form.valor) * 100) < Number(form.numero_parcelas))
        throw new Error("Cada parcela precisa ter pelo menos um centavo.");
      if (
        fuel &&
        (!form.frota_id ||
          Number(form.litros_abastecidos) <= 0 ||
          Number(form.valor_litro) <= 0)
      )
        throw new Error("Confira o veículo, os litros e o preço por litro.");
      await draftWrites.current;
      await saveExpense(
        owner,
        {
          ...form,
          data_despesa: String(form.data_despesa),
          tipo_despesa_id: String(form.tipo_despesa_id),
          cliente: String(form.cliente || ""),
          ...(fuel
            ? { litros_abastecidos: Number(form.litros_abastecidos) }
            : {}),
          data_vencimento: editing
            ? String(editing.data_vencimento || due)
            : due,
          valor: Number(Number(form.valor).toFixed(2)),
        } as Expense,
        photo,
        db,
        Boolean(editing),
      );
      onSaved();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  if (!ready) return <p>Recuperando rascunho…</p>;
  return (
    <form className="panel expense-form" onSubmit={submit}>
      <h2>{editing ? "Ajustar despesa reprovada" : "Nova despesa"}</h2>
      {editing?.justificativa_reprovacao && (
        <p className="error">
          Motivo: {String(editing.justificativa_reprovacao)}
        </p>
      )}
      <p className="hint">
        Salva primeiro no aparelho. Você acompanha o envio na aba Sincronizar.
      </p>
      <fieldset className="payment-fieldset">
        <legend>
          Forma de Pagamento{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="payment-options">
          {[
            { id: "cartao", name: "Cartão", Icon: CreditCard },
            { id: "dinheiro", name: "Dinheiro", Icon: Banknote },
            { id: "faturado", name: "Faturado", Icon: Building2 },
            { id: "boleto", name: "Boleto", Icon: Receipt },
          ].map(({ id, name, Icon }) => (
            <label key={id} className={`payment-option payment-${id}`}>
              <input
                type="radio"
                name="pagamento_tipo"
                value={id}
                checked={form.pagamento_tipo === id}
                required
                onChange={() => setForm({ ...form, pagamento_tipo: id })}
              />
              <span>
                <Icon size={18} aria-hidden="true" />
                {name}
              </span>
            </label>
          ))}
        </div>
        {form.pagamento_tipo !== "cartao" && (
          <p className="payment-help">
            <Info size={17} aria-hidden="true" />
            <span>
              {form.pagamento_tipo === "dinheiro"
                ? "Esta despesa irá para a aba de Reembolso. O financeiro processará o reembolso para você."
                : form.pagamento_tipo === "faturado"
                  ? "Despesa faturada diretamente para a empresa. Você não precisa pagar no ato — o financeiro irá conferir."
                  : "Pagamento via boleto. A despesa passa pelo lançamento normal no Financeiro, mas não é enviada ao ERP M8."}
            </span>
          </p>
        )}
      </fieldset>
      {form.pagamento_tipo === "cartao" && (
        <label>
          <span>
            Cartão{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <select
            required
            value={String(form.cartao_id || "")}
            onChange={(e) => setForm({ ...form, cartao_id: e.target.value })}
          >
            <option value="">Selecione</option>
            {catalog.cards
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.apelido || c.banco} · {c.ultimos_digitos}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        <span>
          Tipo de Despesa{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </span>
        <select
          required
          value={String(form.tipo_despesa_id)}
          onChange={(e) => {
            const t = catalog.types.find((t) => t.id === e.target.value);
            setForm({
              ...form,
              tipo_despesa_id: e.target.value,
              documento: documentTypes.includes(t?.documento_padrao || "")
                ? t!.documento_padrao!
                : "",
            });
          }}
        >
          <option value="">Selecione</option>
          {catalog.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="grid">
        {field("cliente", "Cliente")}
        {field("numero_os", "Ordem de serviço")}
      </div>
      {moneyField("valor", "Valor total (R$)")}
      <fieldset className="expense-date-time">
        <legend>
          Data e Hora da Despesa{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </legend>
        <div>
          <input
            type="date"
            aria-label="Data da despesa"
            required
            value={String(form.data_despesa)}
            onChange={(e) => setForm({ ...form, data_despesa: e.target.value })}
          />
          <input
            type="time"
            aria-label="Hora da despesa"
            required
            value={String(form.hora_despesa || "")}
            onChange={(e) => setForm({ ...form, hora_despesa: e.target.value })}
          />
        </div>
      </fieldset>
      <label>
        <span>
          Tipo de documento{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </span>
        <select
          required
          value={
            documentTypes.includes(String(form.documento))
              ? String(form.documento)
              : ""
          }
          onChange={(e) => setForm({ ...form, documento: e.target.value })}
        >
          <option value="" disabled>
            Selecione o tipo de documento...
          </option>
          {documentTypes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {!editing && (
        <section className="installment-panel">
          <div className="installment-heading">
            <span>
              <CreditCard size={19} aria-hidden="true" />
              Despesa parcelada?
            </span>
            <button
              type="button"
              role="switch"
              aria-label="Despesa parcelada?"
              aria-checked={installments}
              className="installment-switch"
              onClick={() => {
                setParcelado(!installments);
                setForm({ ...form, numero_parcelas: installments ? 1 : 2 });
              }}
            >
              <span />
            </button>
          </div>
          {installments ? (
            <div className="installment-content">
              <label>
                <span>
                  Número de Parcelas{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <div className="installment-stepper">
                  <button
                    type="button"
                    aria-label="Diminuir parcelas"
                    disabled={count <= 2}
                    onClick={() =>
                      setForm({ ...form, numero_parcelas: count - 1 })
                    }
                  >
                    −
                  </button>
                  <input
                    aria-label="Número de Parcelas"
                    type="number"
                    min="2"
                    max="48"
                    step="1"
                    required
                    value={String(form.numero_parcelas)}
                    onChange={(e) =>
                      setForm({ ...form, numero_parcelas: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    aria-label="Aumentar parcelas"
                    disabled={count >= 48}
                    onClick={() =>
                      setForm({ ...form, numero_parcelas: count + 1 })
                    }
                  >
                    +
                  </button>
                </div>
              </label>
              <label>
                Valor por Parcela
                <output className="installment-value">
                  {cents > 0 &&
                  Number.isInteger(count) &&
                  count >= 2 &&
                  count <= 48
                    ? cents % count
                      ? `${money(Math.floor(cents / count))} a ${money(Math.ceil(cents / count))}`
                      : money(cents / count)
                    : "—"}
                </output>
              </label>
              <p className="hint">
                {cents > 0
                  ? "O total será distribuído entre as parcelas, com ajuste de centavos quando necessário."
                  : "Informe o valor total acima."}
              </p>
            </div>
          ) : (
            <p className="payment-help">
              <Info size={17} aria-hidden="true" />
              <span>
                Vencimento previsto:{" "}
                <strong>
                  {due ? due.split("-").reverse().join("/") : "—"}
                </strong>{" "}
                — editável pelo Financeiro após lançamento.
              </span>
            </p>
          )}
        </section>
      )}
      {editing && (
        <p className="hint">
          A correção mantém esta despesa e seu vencimento. Em compras
          parceladas, o valor corresponde somente a esta parcela.
        </p>
      )}
      {type?.calcula_diarias && (
        <div className="grid">
          {field("data_checkin", "Check-in", "date", true)}
          {field("data_checkout", "Check-out", "date", true)}
        </div>
      )}
      {fuel && (
        <fieldset>
          <legend>Abastecimento</legend>
          <label>
            <span>
              Veículo{" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <select
              required
              value={String(form.frota_id || "")}
              onChange={(e) => setForm({ ...form, frota_id: e.target.value })}
            >
              <option value="">Selecione</option>
              {catalog.fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.placa} · {f.modelo}
                </option>
              ))}
            </select>
          </label>
          {field("km_atual", "KM do hodômetro", "number", true)}
          <label>
            <span>
              Tipo de combustível{" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <select
              name="tipo_combustivel"
              required
              value={String(form.tipo_combustivel || "")}
              onChange={(e) =>
                setForm({ ...form, tipo_combustivel: e.target.value })
              }
            >
              <option value="" disabled>
                Selecione o combustível...
              </option>
              {fuelTypes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="grid">
            <label>
              <span>
                Litros{" "}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                pattern="[0-9]+([.,][0-9]+)?"
                placeholder="0,000"
                value={String(form.litros_abastecidos ?? "").replace(".", ",")}
                onChange={(e) => {
                  const value = e.target.value.replace(",", ".");
                  if (/^\d*(\.\d*)?$/.test(value))
                    setForm({ ...form, litros_abastecidos: value });
                }}
              />
            </label>
            {moneyField("valor_litro", "Preço por litro")}
          </div>
        </fieldset>
      )}
      <label>
        Observação / justificativa
        <textarea
          value={String(form.observacao || "")}
          onChange={(e) => setForm({ ...form, observacao: e.target.value })}
        />
      </label>
      <div className="attachment">
        <Upload size={24} />
        <strong>
          {photo
            ? photo.name
            : editing?.comprovante_url
              ? "Comprovante atual será mantido"
              : "Anexar comprovante"}
          {type?.exige_comprovante && (
            <span className="required-mark" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </strong>
        <p>Foto ou PDF, até 13 MB. Fica salvo mesmo sem internet.</p>
        <label className="file-button">
          Tirar foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                try {
                  validateReceipt(f);
                  setPhoto(f);
                  setError("");
                } catch (e) {
                  setError(message(e));
                }
            }}
          />
        </label>
        <label className="file-button secondary">
          Escolher arquivo
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                try {
                  validateReceipt(f);
                  setPhoto(f);
                  setError("");
                } catch (e) {
                  setError(message(e));
                }
            }}
          />
        </label>
        {photo && (
          <button
            className="text-button"
            type="button"
            onClick={() => setPhoto(undefined)}
          >
            Remover anexo
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar ajuste
        </button>
      )}
      <button disabled={busy}>
        <CheckCircle2 size={18} />
        {busy
          ? "Salvando no aparelho…"
          : editing
            ? "Enviar novamente para aprovação"
            : "Salvar e enviar quando conectar"}
      </button>
    </form>
  );
}

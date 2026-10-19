import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Car,
  Square,
  Play,
  Gauge,
  Clock,
  Info,
  TriangleAlert,
} from "lucide-react";
import { db, startTrip, finishTrip } from "../db";
import TripDuration from "./TripDuration";
import { message } from "../ui";
import TripHistory from "./TripHistory";
import type { Profile, Catalog, Trip } from "../model";

export default function KmPage({
  profile,
  catalog,
  onSaved,
  notice,
  onDismissNotice,
}: {
  profile: Profile;
  catalog: Catalog;
  onSaved: () => void;
  notice: string;
  onDismissNotice: () => void;
}) {
  const trips =
    useLiveQuery(
      () => db.trips.where("owner").equals(profile.id).toArray(),
      [profile.id],
    ) || [];
  const open = trips.find((t) => t.data.status === "aberto");
  const [starting, setStarting] = useState(false);
  const fleet = catalog.fleets.find((f) => f.id === open?.data.frota_id);
  const km = (value: number) => `${value.toLocaleString("pt-BR")} km`;
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [finalKm, setFinalKm] = useState("");
  const [hasOccurrence, setHasOccurrence] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (open && stopping !== open.data.id) return;
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (open)
        await finishTrip(
          profile.id,
          open.data.id,
          Number(f.get("km_final")),
          hasOccurrence ? String(f.get("ocorrencia") || "").trim() : "",
          db,
          String(f.get("observacao") || "").trim(),
        );
      else
        await startTrip(profile.id, {
          id: crypto.randomUUID(),
          frota_id: String(f.get("frota_id")),
          km_inicial: Number(f.get("km_inicial")),
          data_inicio: new Date().toISOString(),
          status: "aberto",
          destino: String(f.get("destino")),
          motivo: String(f.get("motivo")),
        } as Trip);
      setFinalKm("");
      setHasOccurrence(false);
      setStarting(false);
      setStopping(null);
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {(notice || (!open && !starting)) && (
        <div className="km-toolbar">
          {!open && !starting && (
            <button type="button" onClick={() => setStarting(true)}>
              <Play size={18} aria-hidden="true" />
              Iniciar Viagem
            </button>
          )}
          {notice && (
            <div role="status" className="notice">
              <Info size={18} aria-hidden="true" />
              <span>{notice}</span>
              <button className="text-button" onClick={onDismissNotice}>
                Fechar
              </button>
            </div>
          )}
        </div>
      )}
      {(open || starting) && (
        <form
          className={open ? "panel active-trip" : "panel"}
          key={open?.data.id || "new"}
          onSubmit={submit}
        >
          {!open && <h2>Iniciar viagem</h2>}
          {open ? (
            <>
              <div className="active-trip-heading">
                <span className="trip-car-icon">
                  <Car size={24} aria-hidden="true" />
                </span>
                <div>
                  <h2>Viagem em andamento</h2>
                  <p className="trip-vehicle">
                    {fleet?.placa || "Veículo"}
                    {fleet?.modelo && ` — ${fleet.modelo}`}
                  </p>
                  <div className="active-trip-details">
                    <span>
                      <Gauge size={16} aria-hidden="true" /> KM inicial:{" "}
                      <strong>{km(open.data.km_inicial)}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      <Clock size={16} aria-hidden="true" />
                      <TripDuration start={open.data.data_inicio} compact />
                    </span>
                  </div>
                </div>
              </div>
              {stopping !== open.data.id ? (
                <button
                  type="button"
                  className="stop-button"
                  onClick={() => setStopping(open.data.id)}
                >
                  <Square size={18} aria-hidden="true" />
                  Finalizar
                </button>
              ) : (
                <>
                  <label>
                    <span>
                      KM final{" "}
                      <span className="required-mark" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      name="km_final"
                      value={finalKm}
                      onChange={(e) => setFinalKm(e.target.value)}
                      type="number"
                      step="1"
                      min={open.data.km_inicial}
                      required
                    />
                  </label>
                  {finalKm !== "" &&
                    Number.isInteger(Number(finalKm)) &&
                    Number(finalKm) >= open.data.km_inicial && (
                      <p className="km-preview" role="status">
                        Percorrido: {km(Number(finalKm) - open.data.km_inicial)}
                      </p>
                    )}
                  <label>
                    Observação final
                    <textarea name="observacao" />
                  </label>
                  <fieldset
                    className="occurrence-fieldset"
                    aria-labelledby="occurrence-title"
                  >
                    <div className="occurrence-bar">
                      <div className="occurrence-heading">
                        <span className="occurrence-alert">
                          <TriangleAlert size={25} aria-hidden="true" />
                        </span>
                        <div>
                          <strong id="occurrence-title">
                            Houve alguma ocorrência?
                          </strong>
                          <p>
                            Registre se houve algum imprevisto durante a viagem.
                          </p>
                        </div>
                      </div>
                      <div className="occurrence-options">
                        <button
                          type="button"
                          className={`occurrence-choice occurrence-yes ${hasOccurrence ? "selected" : ""}`}
                          aria-pressed={hasOccurrence}
                          onClick={() => setHasOccurrence(true)}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          className={`occurrence-choice occurrence-no ${!hasOccurrence ? "selected" : ""}`}
                          aria-pressed={!hasOccurrence}
                          onClick={() => setHasOccurrence(false)}
                        >
                          Não
                        </button>
                      </div>
                    </div>
                    {hasOccurrence && (
                      <label>
                        <span>
                          Ocorrência{" "}
                          <span className="required-mark" aria-hidden="true">
                            *
                          </span>
                        </span>
                        <textarea
                          name="ocorrencia"
                          className="occurrence-description"
                          placeholder="Descreva a ocorrência durante a viagem..."
                          required
                          onChange={(e) =>
                            e.target.setCustomValidity(
                              e.target.value.trim()
                                ? ""
                                : "Descreva a ocorrência.",
                            )
                          }
                        />
                      </label>
                    )}
                  </fieldset>
                </>
              )}
            </>
          ) : (
            <>
              <label>
                <span>
                  Veículo{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <select
                  name="frota_id"
                  defaultValue={profile.frota_padrao_id || ""}
                  required
                >
                  <option value="">Selecione</option>
                  {catalog.fleets.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.placa} · {f.modelo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  KM inicial{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  name="km_inicial"
                  type="number"
                  step="1"
                  min="0"
                  required
                />
              </label>
              <label>
                <span>
                  Destino{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <input name="destino" required />
              </label>
              <label>
                Motivo
                <input name="motivo" />
              </label>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {(!open || stopping === open.data.id) && (
            <div className="trip-submit-actions">
              {open && (
                <button
                  type="button"
                  className="trip-cancel"
                  disabled={busy}
                  onClick={() => setStopping(null)}
                >
                  Cancelar
                </button>
              )}
              <button className={open ? "stop-button" : ""} disabled={busy}>
                {open ? (
                  <Square size={18} aria-hidden="true" />
                ) : (
                  <Car size={18} aria-hidden="true" />
                )}
                {busy
                  ? "Salvando…"
                  : open
                    ? "Finalizar viagem"
                    : "Iniciar viagem"}
              </button>
            </div>
          )}
          {(!open || stopping === open.data.id) && (
            <p className="hint">
              O horário do aparelho será registrado. A disponibilidade do
              veículo é confirmada ao sincronizar.
            </p>
          )}
          {!open && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setStarting(false);
                setError("");
              }}
            >
              Cancelar
            </button>
          )}
        </form>
      )}
      <TripHistory trips={trips} catalog={catalog} profile={profile} />
    </>
  );
}

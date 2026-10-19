import { useState } from "react";
import {
  Car,
  CalendarDays,
  SlidersHorizontal,
  Eye,
  Route,
  Clock,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
} from "lucide-react";
import {
  localDate,
  type Catalog,
  type Profile,
  type Trip,
  type LocalRecord,
} from "../model";
import TripDuration, { compactDuration } from "./TripDuration";

const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;
const day = (date: string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export default function TripHistory({
  trips,
  catalog,
  profile,
}: {
  trips: LocalRecord<Trip>[];
  catalog: Catalog;
  profile: Profile;
}) {
  const [date, setDate] = useState(localDate);
  const [filters, setFilters] = useState(false);
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const visible = trips
    .filter(
      ({ data }) =>
        (!date || day(data.data_inicio) === date) &&
        (status === "all" || data.status === status),
    )
    .sort((a, b) => b.data.data_inicio.localeCompare(a.data.data_inicio));
  const distance = visible.reduce(
    (sum, { data }) =>
      sum +
      (data.km_final == null
        ? 0
        : Math.max(0, data.km_final - data.km_inicial)),
    0,
  );
  const duration = visible.reduce(
    (sum, { data }) =>
      sum +
      (typeof data.data_fim === "string"
        ? Math.max(
            0,
            Date.parse(data.data_fim) - Date.parse(data.data_inicio),
          ) || 0
        : 0),
    0,
  );
  const detail = trips.find((t) => t.key === selected);
  return (
    <>
      <div className="km-history-heading">
        <h2>
          Suas viagens <span>({visible.length})</span>
        </h2>
        <div className="km-history-filters">
          <label className="km-date">
            <CalendarDays size={16} aria-hidden="true" />
            <input
              aria-label="Data das viagens"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            className="km-icon"
            aria-label="Filtrar viagens"
            aria-expanded={filters}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>
      {filters && (
        <div className="km-filter-panel">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todas</option>
              <option value="aberto">Em andamento</option>
              <option value="finalizado">Finalizadas</option>
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setDate("");
              setStatus("all");
            }}
          >
            Todas as datas
          </button>
        </div>
      )}
      <div
        className="km-table-scroll"
        role="region"
        aria-label="Histórico de viagens"
        tabIndex={0}
      >
        <table className="km-table">
          <thead>
            <tr>
              {[
                "Veículo",
                "Horário",
                "KM Inicial",
                "KM Final",
                "Percorrido",
                "Duração",
                "Status",
                "Ações",
              ].map((title) => (
                <th key={title} scope="col">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ key, data }) => {
              const vehicle = catalog.fleets.find(
                (f) => f.id === data.frota_id,
              );
              return (
                <tr key={key}>
                  <td>
                    <div className="km-table-vehicle">
                      <span className="trip-car-icon">
                        <Car size={20} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{vehicle?.placa || "Veículo"}</strong>
                        <small>{vehicle?.modelo || "—"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>
                      {new Date(data.data_inicio).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                    <small>
                      {new Date(data.data_inicio).toLocaleDateString("pt-BR")}
                    </small>
                  </td>
                  <td>{km(data.km_inicial)}</td>
                  <td>{data.km_final == null ? "—" : km(data.km_final)}</td>
                  <td className="trip-distance">
                    {data.km_final == null
                      ? "—"
                      : km(data.km_final - data.km_inicial)}
                  </td>
                  <td>
                    {data.status === "aberto" ? (
                      <TripDuration start={data.data_inicio} compact />
                    ) : typeof data.data_fim === "string" ? (
                      compactDuration(
                        data.data_inicio,
                        Date.parse(data.data_fim),
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        data.status === "aberto" ? "badge warning" : "badge"
                      }
                    >
                      {data.status === "aberto" ? "Em andamento" : "Finalizada"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="km-icon"
                      aria-label={`Ver detalhes da viagem ${new Date(data.data_inicio).toLocaleString("pt-BR")}`}
                      onClick={() => setSelected(selected === key ? null : key)}
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <p className="km-empty">
            Nenhuma viagem encontrada para este filtro.
          </p>
        )}
      </div>
      {detail && (
        <section className="panel km-trip-detail">
          <h3>Detalhes da viagem</h3>
          <p>{profile.nome}</p>
          <p>Destino: {detail.data.destino || "—"}</p>
          <p>Motivo: {detail.data.motivo || "—"}</p>
          <p>Observação final: {detail.data.observacao || "—"}</p>
          <p>Ocorrência: {detail.data.ocorrencia || "—"}</p>
          <p>Sincronização: {detail.pending ? "No aparelho" : "Enviada"}</p>
          <button className="text-button" onClick={() => setSelected(null)}>
            Fechar detalhes
          </button>
        </section>
      )}
      <section className="km-summary" aria-label="Resumo das viagens filtradas">
        <div>
          <Route aria-hidden="true" />
          <span>
            <small>
              {date === localDate()
                ? "Total percorrido hoje"
                : "Total percorrido"}
            </small>
            <strong>{km(distance)}</strong>
          </span>
        </div>
        <div>
          <Clock aria-hidden="true" />
          <span>
            <small>Tempo finalizado</small>
            <strong>
              {compactDuration(new Date(0).toISOString(), duration)}
            </strong>
          </span>
        </div>
        <div>
          <Car aria-hidden="true" />
          <span>
            <small>Viagens</small>
            <strong>{visible.length}</strong>
          </span>
        </div>
        <button
          className="km-report-button"
          onClick={() => setReport(!report)}
          aria-expanded={report}
        >
          <ChartNoAxesColumnIncreasing size={20} />
          Ver relatório
          <ChevronRight size={16} />
        </button>
      </section>
      {report && (
        <section className="panel">
          <h3>Relatório do período selecionado</h3>
          <p>
            {date
              ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")
              : "Todas as datas"}{" "}
            · {profile.nome}
          </p>
          <p>
            {visible.filter((t) => t.data.status === "finalizado").length}{" "}
            finalizada(s) ·{" "}
            {visible.filter((t) => t.data.status === "aberto").length} em
            andamento · {visible.filter((t) => t.pending).length} aguardando
            envio
          </p>
          <p>
            Distância: {km(distance)} · Tempo das viagens finalizadas:{" "}
            {compactDuration(new Date(0).toISOString(), duration)}
          </p>
          <p className="hint">
            Resumo dos registros armazenados neste aparelho, conforme os filtros
            selecionados.
          </p>
        </section>
      )}
    </>
  );
}

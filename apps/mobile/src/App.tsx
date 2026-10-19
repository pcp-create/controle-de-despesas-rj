import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { App as NativeApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import {
  Car,
  CheckCircle2,
  CloudOff,
  FilePlus2,
  Home,
  LogOut,
  Receipt,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { db } from "./db";
import { refreshData, transport } from "./remote";
import { SyncEngine } from "./sync";
import { supabase } from "./supabase";
import { localDate, type Expense, type Profile } from "./model";
import { message, activeKey } from "./ui";
import Login from "./components/Login";
import Password from "./components/Password";
import ExpenseForm from "./components/ExpenseForm";
import TripDuration from "./components/TripDuration";
import { updateTripNotification } from "./tripNotification";
import HomePage from "./components/HomePage";
import KmPage from "./components/KmPage";

const engine = new SyncEngine(transport);
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Page = "home" | "expense" | "km" | "sync";

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [page, setPage] = useState<Page>("home");
  useEffect(() => {
    const listener = NativeApp.addListener("backButton", () => {
      if (page !== "home") setPage("home");
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [page]);
  useEffect(() => {
    if (page !== "expense") setEditingExpense(undefined);
  }, [page, profile?.id]);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    // Clear the obsolete success notice retained by development hot reload.
    if (
      notice ===
      "Dados atualizados. Confira abaixo se há lançamentos pendentes."
    ) {
      setNotice("");
    }
  }, [notice]);
  const syncRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const catalog = useLiveQuery(
    () => (profile ? db.catalogs.get(profile.id) : undefined),
    [profile?.id],
  );
  const expenses =
    useLiveQuery(
      () =>
        profile ? db.expenses.where("owner").equals(profile.id).toArray() : [],
      [profile?.id],
    ) || [];
  const operations =
    useLiveQuery(
      () =>
        profile
          ? db.operations.where("owner").equals(profile.id).toArray()
          : [],
      [profile?.id],
    ) || [];
  const trips = useLiveQuery(
    () => (profile ? db.trips.where("owner").equals(profile.id).toArray() : []),
    [profile?.id],
  );
  const openTrip = trips?.find((trip) => trip.data.status === "aberto");
  useEffect(() => {
    if (!ready || !trips) return;
    const update = () => {
      void updateTripNotification(openTrip?.data.data_inicio)
        .then((enabled) => {
          if (!enabled && openTrip)
            setNotice(
              "Ative as notificações do app nas configurações do Android para ver o KM em aberto na tela de bloqueio.",
            );
        })
        .catch(() =>
          setNotice(
            "Não foi possível atualizar a notificação de KM. Confira a viagem na aba KM.",
          ),
        );
    };
    update();
    const listener = NativeApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) update();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [ready, trips, openTrip?.data.data_inicio]);
  function setAccount(p: Profile | null) {
    ownerRef.current = p?.id || null;
    setProfile(p);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = localStorage.getItem(activeKey);
        if (id) {
          const cached = await db.profiles.get(id);
          if (alive && cached?.ativo) setAccount(cached);
        }
        // Request durable browser storage when supported. Android assets are bundled;
        // queued data remains in WebView IndexedDB across process restarts.
        await navigator.storage?.persist?.();
      } catch (e) {
        if (alive) setNotice(message(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    const network = Network.addListener("networkStatusChange", (s) =>
      setOnline(s.connected),
    );
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      alive = false;
      void network.then((h) => h.remove());
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  async function synchronize() {
    const account = ownerRef.current;
    if (!account || syncRef.current || !navigator.onLine) return;
    syncRef.current = true;
    setSyncing(true);
    try {
      await engine.run(account);
      const updated = await refreshData(account);
      if (ownerRef.current === account) {
        setAccount(updated);
      }
    } catch (e) {
      setNotice(message(e));
    } finally {
      syncRef.current = false;
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!profile || profile.primeiro_acesso || !online) return;
    void synchronize();
    const timer = setInterval(() => void synchronize(), 30000);
    const foreground = NativeApp.addListener("appStateChange", (s) => {
      if (s.isActive) void synchronize();
    });
    return () => {
      clearInterval(timer);
      void foreground.then((h) => h.remove());
    };
  }, [profile?.id, profile?.primeiro_acesso, online]);
  async function logout() {
    if (syncRef.current) {
      setNotice("Aguarde a sincronização terminar antes de sair.");
      return;
    }
    // Do not silently strand unsynchronized work under another login.
    if (operations.length) {
      setNotice(
        "Sincronize os lançamentos pendentes antes de sair. Se a sessão expirou, use “Entrar novamente” na aba Sincronizar.",
      );
      return;
    }
    localStorage.removeItem(activeKey);
    await supabase.auth.signOut({ scope: "local" });
    setAccount(null);
    setPage("home");
  }
  async function reauthenticate() {
    if (syncRef.current) return;
    localStorage.removeItem(activeKey);
    await supabase.auth.signOut({ scope: "local" });
    setAccount(null);
  }
  if (!ready)
    return (
      <main className="login">
        <p>Preparando seus dados…</p>
      </main>
    );
  if (!profile) return <Login onLogin={setAccount} />;
  if (profile.primeiro_acesso)
    return <Password profile={profile} onDone={setAccount} />;
  const saved = () => {
    setEditingExpense(undefined);
    setNotice(
      "Salvo neste aparelho. A sincronização será tentada quando houver conexão.",
    );
    setPage("home");
    void synchronize();
  };
  return (
    <div className="app">
      <header>
        <div className="brand-small">
          <img
            src="/logo-rj.png"
            alt="RJ Compressores"
            className="brand-logo"
          />
          <span className="brand-title">Controle de Despesas</span>
        </div>
        <button
          className="icon-button"
          aria-label="Sair"
          onClick={() => void logout()}
        >
          <LogOut size={20} />
        </button>
      </header>
      <div className={`connection ${online ? "" : "offline"}`}>
        {online ? <CheckCircle2 size={15} /> : <WifiOff size={15} />}
        <span>
          {online ? "Conectado" : "Sem internet · você pode continuar"}
        </span>
        <span className={operations.length > 0 ? "sync-pending" : undefined}>
          {operations.length} pendente(s)
        </span>
      </div>
      <main className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {localDate().split("-").reverse().join(" / ")}
            </p>
            <h1>
              {page === "home"
                ? `Olá, ${profile.nome.split(" ")[0]}.`
                : page === "expense"
                  ? "Registrar despesa"
                  : page === "km"
                    ? "Controle de KM"
                    : "Sincronização"}
            </h1>
          </div>
          <button
            className="icon-button light sync-action"
            aria-label="Sincronizar agora"
            title={
              operations.length
                ? `${operations.length} lançamento(s) pendente(s) de sincronização`
                : "Sincronizar agora"
            }
            disabled={syncing || !online}
            onClick={() => void synchronize()}
          >
            <RefreshCw size={22} className={syncing ? "spin" : ""} />
            {operations.length > 0 && (
              <span
                className="sync-alert"
                role="status"
                aria-label={`${operations.length} lançamento(s) pendente(s) de sincronização`}
              >
                !
              </span>
            )}
          </button>
        </div>
        {notice && !(page === "km" && catalog) && (
          <div role="status" className="notice">
            {notice}
            <button className="text-button" onClick={() => setNotice("")}>
              Fechar
            </button>
          </div>
        )}
        {openTrip && page !== "km" && (
          <section className="panel">
            <h2>KM em aberto</h2>
            <TripDuration start={openTrip.data.data_inicio} />
            <button onClick={() => setPage("km")}>Abrir viagem</button>
          </section>
        )}
        {!catalog && (
          <div className="panel">
            <h2>Prepare o aparelho</h2>
            <p>
              Conecte-se e sincronize uma vez para baixar tipos de despesa,
              cartões e veículos antes de sair a campo.
            </p>
            <button
              onClick={() => void synchronize()}
              disabled={syncing || !online}
            >
              Baixar cadastros
            </button>
          </div>
        )}
        {page === "home" && (
          <HomePage
            employee={profile.nome}
            expenses={expenses}
            catalog={catalog}
            onNew={() => setPage("expense")}
            onKm={() => setPage("km")}
            onEdit={(expense) => {
              setEditingExpense(expense);
              setPage("expense");
            }}
          />
        )}
        {page === "expense" && catalog && (
          <ExpenseForm
            key={editingExpense?.id || "new"}
            owner={profile.id}
            catalog={catalog}
            onSaved={saved}
            editing={editingExpense}
            onCancel={() => {
              setEditingExpense(undefined);
              setPage("home");
            }}
          />
        )}
        {page === "km" && catalog && (
          <KmPage
            notice={notice}
            onDismissNotice={() => setNotice("")}
            profile={profile}
            catalog={catalog}
            onSaved={() => {
              void synchronize();
            }}
          />
        )}
        {page === "sync" && (
          <>
            <div className="panel">
              <CloudOff size={32} />
              <h2>
                {operations.length ? "Lançamentos no aparelho" : "Tudo enviado"}
              </h2>
              <p>
                Fotos e lançamentos ficam guardados até o servidor confirmar o
                recebimento. Erros não apagam seus dados.
              </p>
              <p className="hint">
                Última atualização:{" "}
                {catalog
                  ? new Date(catalog.refreshed).toLocaleString("pt-BR")
                  : "Ainda não realizada"}
              </p>
              <button
                disabled={syncing || !online}
                onClick={() => void synchronize()}
              >
                {syncing ? "Sincronizando…" : "Sincronizar agora"}
              </button>
              <button
                className="text-button"
                disabled={syncing}
                onClick={() => void reauthenticate()}
              >
                Entrar novamente (preserva pendências)
              </button>
            </div>
            {operations.map((o) => (
              <article className="panel" key={o.id}>
                <strong>
                  {o.kind === "expense.create" || o.kind === "expense.resubmit"
                    ? "Despesa"
                    : o.kind === "km.start"
                      ? "Início de viagem"
                      : "Fim de viagem"}
                </strong>
                <p className={o.error ? "error" : "hint"}>
                  {o.error || "Aguardando conexão para enviar."}
                </p>
                <small>Tentativas: {o.attempts}</small>
                <button
                  className="secondary"
                  disabled={syncing || !online}
                  onClick={async () => {
                    await db.operations.update(o.id, {
                      state: "pending",
                      nextAttempt: 0,
                      error: undefined,
                    });
                    void synchronize();
                  }}
                >
                  Tentar novamente
                </button>
              </article>
            ))}
            <p className="hint">
              Não desinstale o aplicativo nem limpe seus dados enquanto houver
              pendências. Erros de conflito precisam ser conferidos com o
              gestor; os registros locais são preservados.
            </p>
          </>
        )}
      </main>
      <nav aria-label="Navegação principal">
        {(
          [
            { id: "home", label: "Início", Icon: Home },
            { id: "expense", label: "Despesa", Icon: FilePlus2 },
            { id: "km", label: "KM", Icon: Car },
            { id: "sync", label: "Sincronizar", Icon: RefreshCw },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-label={label}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
            aria-current={page === id ? "page" : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
            {id === "sync" && operations.length > 0 && (
              <b
                className="sync-pending-badge"
                role="status"
                aria-label={`${operations.length} lançamento(s) pendente(s) de sincronização`}
              >
                ! {operations.length}
              </b>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

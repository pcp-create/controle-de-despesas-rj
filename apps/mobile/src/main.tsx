import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="login">
        <h1>Não foi possível abrir o aplicativo.</h1>
        <p>Seus dados locais não foram apagados.</p>
        <button onClick={() => location.reload()}>Tentar novamente</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { db } from "../db";
import { supabase } from "../supabase";
import { getProfile } from "../remote";
import { message, activeKey } from "../ui";
import type { Profile } from "../model";

export default function Login({ onLogin }: { onLogin: (p: Profile) => void }) {
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const username = String(form.get("usuario")).trim();
      let email = username;
      if (!username.includes("@")) {
        const result = await supabase.rpc("mobile_login_email", {
          p_usuario: username,
        });
        if (result.error)
          throw new Error(
            "Não foi possível consultar o usuário. Verifique a conexão e a migração Android no Supabase.",
          );
        if (!result.data) throw new Error("Usuário ou senha inválidos.");
        email = result.data;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: String(form.get("senha")),
      });
      if (error)
        throw new Error(
          "Não foi possível entrar. Confira a conexão, o usuário e a senha.",
        );
      const profile = await getProfile();
      await db.profiles.put(profile);
      localStorage.setItem(activeKey, profile.id);
      onLogin(profile);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login login-screen">
      <div className="brand-mark">
        <img src="/logo-rj.png" alt="RJ Compressores" className="brand-logo" />
      </div>
      <h1>Controle de Despesas</h1>
      <p className="login-subtitle">RJ Compressores</p>
      <form className="panel" onSubmit={submit}>
        <h2>Entrar na sua conta</h2>
        <label>
          <span>
            Usuário{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <input
            placeholder="Digite seu usuário"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </label>
        <label>
          <span>
            Senha{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <span className="password-field">
            <input
              placeholder="Digite sua senha"
              name="senha"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <p className="login-access-help">
          <strong>Sem acesso?</strong> Se você não possui uma conta ou esqueceu
          suas credenciais, entre em contato com o administrador do sistema para
          gerar seu acesso.
        </p>
      </form>
      <footer className="login-footer">
        © {new Date().getFullYear()} RJ Compressores. Todos os direitos
        reservados.
      </footer>
    </main>
  );
}

import { useState, type FormEvent } from "react";
import { db } from "../db";
import { supabase } from "../supabase";
import { message } from "../ui";
import type { Profile } from "../model";

export default function Password({
  profile,
  onDone,
}: {
  profile: Profile;
  onDone: (p: Profile) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const password = String(f.get("senha"));
      if (password.length < 8 || password !== f.get("confirmar"))
        throw new Error(
          "Use pelo menos 8 caracteres e confirme a mesma senha.",
        );
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const update = await supabase
        .from("profiles")
        .update({ primeiro_acesso: false })
        .eq("id", profile.id);
      if (update.error) throw update.error;
      const updated = { ...profile, primeiro_acesso: false };
      await db.profiles.put(updated);
      onDone(updated);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <form className="panel" onSubmit={submit}>
        <h1>Defina sua senha</h1>
        <p>Conecte-se à internet para concluir seu primeiro acesso.</p>
        <label>
          <span>
            Nova senha{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <input
            name="senha"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          <span>
            Confirmar senha{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <input
            name="confirmar"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>Salvar senha</button>
      </form>
    </main>
  );
}

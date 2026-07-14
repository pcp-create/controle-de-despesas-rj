"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/auth-context";
import { Eye, EyeOff, Lock, User } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError("");
    setLoading(true);

    if (!usuario || !senha) {
      setError("Preencha usuário e senha");
      setLoading(false);
      return;
    }

    try {
      const result = await signIn(usuario, senha);

      if (result.error) {
        setError(result.error);
        setLoading(false);
      }
      // Se não há erro, o listener do auth-context vai atualizar o estado
    } catch (err) {
      setError("Erro ao processar solicitação");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4">
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
              <circle cx="20" cy="20" r="18" fill="white" fillOpacity="0.15" />
              <path d="M12 20 L20 12 L28 20 L20 28 Z" fill="white" fillOpacity="0.9" />
              <circle cx="20" cy="20" r="4" fill="white" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white leading-tight">
            Controle de Despesas
          </h1>
          <p className="text-sm text-sidebar-foreground/60 mt-1">RJ Compressores</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            Entrar na sua conta
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Usuário */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="usuario">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="usuario"
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Digite seu usuário"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="senha">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="senha"
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  required
                  autoComplete="current-password"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(!showSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  tabIndex={-1}
                >
                  {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm text-muted-foreground">Lembrar usuário</span>
              </label>
              <button
                type="button"
                className="text-sm text-accent hover:underline"
              >
                Esqueci a senha
              </button>
            </div>

            {/* Erro */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition mt-1"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-sidebar-foreground/40 mt-6">
          &copy; {new Date().getFullYear()} RJ Compressores. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

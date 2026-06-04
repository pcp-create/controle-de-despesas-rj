"use client";

import { useState } from "react";
import { useAuth, type Perfil } from "@/lib/supabase/auth-context";
import { Eye, EyeOff, Lock, Mail, User, UserCog } from "lucide-react";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("administrador");
  const [showSenha, setShowSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[v0] handleSubmit called - email:", email, "senha:", senha ? "***" : "empty");
    setError("");
    setLoading(true);
    
    if (!email || !senha) {
      setError("Preencha email e senha");
      setLoading(false);
      return;
    }
    
    try {
      if (isSignUp) {
        // Cadastro
        if (!nome || !usuario) {
          setError("Preencha todos os campos");
          setLoading(false);
          return;
        }
        const result = await signUp(email, senha, { nome, usuario, perfil });
        if (result.error) {
          setError(result.error);
        }
      } else {
        // Login
        const result = await signIn(email, senha);
        if (result.error) {
          if (result.error.includes("Invalid login")) {
            setError("Email ou senha incorretos");
          } else {
            setError(result.error);
          }
        }
      }
    } catch (err) {
      setError("Erro ao processar solicitacao");
    }
    
    setLoading(false);
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
            {isSignUp ? "Criar conta" : "Entrar na sua conta"}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <>
                {/* Nome */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="nome">
                    Nome completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="nome"
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Digite seu nome completo"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                      required
                    />
                  </div>
                </div>

                {/* Usuario */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="usuario">
                    Usuario
                  </label>
                  <div className="relative">
                    <UserCog className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="usuario"
                      type="text"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="Digite um nome de usuario"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                      required
                    />
                  </div>
                </div>

                {/* Perfil */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="perfil">
                    Perfil
                  </label>
                  <select
                    id="perfil"
                    value={perfil}
                    onChange={(e) => setPerfil(e.target.value as Perfil)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                    required
                  >
                    <option value="administrador">Administrador</option>
                    <option value="gestor">Gestor</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="tecnico">Tecnico</option>
                  </select>
                </div>
              </>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  required
                  autoComplete="email"
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
                  autoComplete={isSignUp ? "new-password" : "current-password"}
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
              {isSignUp && (
                <p className="text-xs text-muted-foreground">Minimo de 6 caracteres</p>
              )}
            </div>

            {!isSignUp && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm text-muted-foreground">Lembrar email</span>
                </label>
                <button
                  type="button"
                  className="text-sm text-accent hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>
            )}

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
              {loading ? (isSignUp ? "Criando conta..." : "Entrando...") : (isSignUp ? "Criar conta" : "Entrar")}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-sm text-accent hover:underline"
            >
              {isSignUp ? "Ja tenho uma conta" : "Criar nova conta"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-sidebar-foreground/40 mt-6">
          &copy; {new Date().getFullYear()} RJ Compressores. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

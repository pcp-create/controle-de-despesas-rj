"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { X, Lock } from "lucide-react";

interface Props {
  forced?: boolean;
  userId: string;
  onClose?: () => void;
}

export default function AlterarSenhaModal({ forced, userId, onClose }: Props) {
  const alterarSenha = useAppStore((s) => s.alterarSenha);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (novaSenha !== confirmar) {
      setError("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (novaSenha.length < 4) {
      setError("A nova senha deve ter pelo menos 4 caracteres.");
      return;
    }
    const result = alterarSenha(userId, senhaAtual, novaSenha);
    if (!result.ok) {
      setError(result.msg);
    } else {
      setSuccess(result.msg);
      setTimeout(() => {
        onClose?.();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-accent" />
            <h2 className="font-semibold text-foreground">
              {forced ? "Redefinir Senha Padrão" : "Alterar Senha"}
            </h2>
          </div>
          {!forced && onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-5">
          {forced && (
            <div className="mb-4 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-sm text-warning">
              Por segurança, altere a senha padrão antes de continuar.
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Senha atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-sm text-success">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
            >
              Salvar Nova Senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

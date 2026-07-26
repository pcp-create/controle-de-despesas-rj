"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { X, Lock } from "lucide-react";

interface Props {
  forced?: boolean;
  onClose?: () => void;
}

export default function AlterarSenhaModalSupabase({ forced, onClose }: Props) {
  const { currentUser, loadSupabaseData } = useAppStore();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (novaSenha !== confirmar) {
      setError("A nova senha e a confirmação não coincidem.");
      setLoading(false);
      return;
    }
    if (novaSenha.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      // 1. Atualizar senha no Supabase Auth (necessário para o login funcionar)
      const { error: authError } = await supabase.auth.updateUser({ password: novaSenha });
      if (authError) {
        setError("Erro ao alterar senha: " + authError.message);
        setLoading(false);
        return;
      }

      // 2. Atualizar senha e primeiro_acesso na tabela profiles
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ senha: novaSenha, primeiro_acesso: false })
        .eq("id", currentUser?.id);

      if (updateError) {
        setError("Erro ao salvar: " + updateError.message);
      } else {
        setSuccess("Senha alterada com sucesso!");
        // Recarrega o currentUser — quando primeiro_acesso voltar false,
        // o AppShell desmonta o modal forçado automaticamente.
        // Para o modal voluntário, chama onClose após o reload.
        await loadSupabaseData();
        if (!forced) {
          onClose?.();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar senha");
    }
    
    setLoading(false);
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
            <div className="mb-4 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning flex flex-col gap-1">
              <span className="font-semibold">Primeiro acesso detectado</span>
              <span className="text-warning/80">Por segurança, você precisa criar uma senha pessoal antes de continuar. Não será possível usar o sistema com a senha padrão.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
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
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {loading ? "Salvando..." : "Salvar Nova Senha"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

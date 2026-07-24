"use client";

import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth-context";
import { useEffect } from "react";
import SimpleLogin from "@/components/auth/SimpleLogin";
import AppShellSupabase from "@/components/layout/AppShellSupabase";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const { setCurrentUser } = useAppStore();

  // Sincronizar o perfil do AuthContext com o Zustand store
  // (necessário para compatibilidade com componentes que usam useAppStore)
  useEffect(() => {
    if (profile) {
      setCurrentUser(profile as any);
    }
  }, [profile, setCurrentUser]);

  // Aguardar a sessão ser verificada antes de qualquer decisão
  if (loading) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  // Só mostra o app quando a sessão está 100% confirmada (profile preenchido)
  if (!user || !profile) {
    return <SimpleLogin />;
  }

  return <AppShellSupabase />;
}





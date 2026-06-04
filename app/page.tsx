"use client";

import { useAuth } from "@/lib/supabase/auth-context";
import LoginPage from "@/components/auth/LoginPage";
import AppShellSupabase from "@/components/layout/AppShellSupabase";
import AlterarSenhaModalSupabase from "@/components/auth/AlterarSenhaModalSupabase";

export default function Home() {
  const { user, profile, loading } = useAuth();

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

  if (!user || !profile) {
    return <LoginPage />;
  }

  return (
    <>
      {profile.primeiro_acesso && (
        <AlterarSenhaModalSupabase forced />
      )}
      <AppShellSupabase />
    </>
  );
}

"use client";

import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth-context";
import { Menu, Bell, ChevronDown, LogOut, Lock } from "lucide-react";
import { useState } from "react";

interface Props {
  onMenuClick: () => void;
  onAlterarSenha: () => void;
}

export default function HeaderSupabase({ onMenuClick, onAlterarSenha }: Props) {
  const { currentUser } = useAppStore();
  const { signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const perfilLabel: Record<string, string> = {
    administrador: "Administrador",
    gestor: "Gestor",
    financeiro: "Financeiro",
    tecnico: "Técnico",
  };

  const initials = currentUser?.nome
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    setDropdownOpen(false);
    await signOut();
  };

  return (
    <header className="flex items-center justify-between h-14 px-4 md:px-6 bg-white border-b border-border flex-shrink-0">
      {/* Hamburguer — apenas mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      {/* Placeholder para alinhar itens no desktop */}
      <div className="hidden lg:block" />

      {/* Right: User menu */}
      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-lg hover:bg-muted transition text-muted-foreground">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
        </button>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-muted transition"
          >
            <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-sm font-medium text-foreground leading-tight max-w-32 truncate">
                {currentUser?.nome.split(" ")[0]}
              </span>
              <span className="text-xs text-muted-foreground leading-tight">
                {perfilLabel[currentUser?.perfil ?? ""] ?? currentUser?.perfil}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-xl shadow-lg border border-border py-1">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{currentUser?.nome}</p>
                  <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
                </div>
                <button
                  onClick={() => { setDropdownOpen(false); onAlterarSenha(); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition"
                >
                  <Lock className="w-4 h-4" />
                  Alterar Senha
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

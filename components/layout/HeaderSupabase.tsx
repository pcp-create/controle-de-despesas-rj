"use client";

import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth-context";
import { Menu, Bell, ChevronDown, LogOut, Lock, TrendingUp, Banknote, CheckSquare } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { PendenciasCount } from "@/hooks/usePendenciasCount";
interface Props {
  onMenuClick: () => void;
  onAlterarSenha: () => void;
  totalPendencias?: number;
  pendencias?: PendenciasCount;
  onNavigate?: (page: string) => void;
}

export default function HeaderSupabase({ onMenuClick, onAlterarSenha, totalPendencias = 0, pendencias, onNavigate }: Props) {
  const { currentUser } = useAppStore();
  const { signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown do sino ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    if (bellOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bellOpen]);

  const bellItems = [
    {
      key: "aprovacao",
      icon: <CheckSquare className="w-4 h-4 text-warning" />,
      label: "Aprovações pendentes",
      count: pendencias?.aprovacao ?? 0,
    },
    {
      key: "financeiro",
      icon: <TrendingUp className="w-4 h-4 text-accent" />,
      label: "Lançamentos ERP pendentes",
      count: pendencias?.financeiro ?? 0,
    },
    {
      key: "reembolso",
      icon: <Banknote className="w-4 h-4 text-success" />,
      label: "Reembolsos pendentes",
      count: pendencias?.reembolso ?? 0,
    },
  ].filter((i) => i.count > 0);

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
        {/* Sino com badge */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative p-2 rounded-lg hover:bg-muted transition text-muted-foreground"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5" />
            {totalPendencias > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold leading-none">
                {totalPendencias > 99 ? "99+" : totalPendencias}
              </span>
            )}
          </button>

          {/* Dropdown do sino */}
          {bellOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-white rounded-xl shadow-lg border border-border py-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Pendências</p>
              </div>

              {bellItems.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhuma pendência no momento
                </div>
              ) : (
                bellItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => { setBellOpen(false); onNavigate?.(item.key); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-muted transition text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <span className="flex-1 text-sm text-foreground">{item.label}</span>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-white text-[10px] font-bold leading-none shrink-0">
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

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
              <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white rounded-xl shadow-lg border border-border py-1">
                <div className="px-3 py-2 border-b border-border overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate">{currentUser?.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentUser?.email}</p>
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

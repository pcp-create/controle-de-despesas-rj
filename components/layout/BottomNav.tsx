"use client";

import { useAppStore } from "@/lib/store";
import type { PageKey } from "./AppShell";
import type { PendenciasCount } from "@/hooks/usePendenciasCount";
import React from "react";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  BarChart3,
  Car,
} from "lucide-react";

// Mapeamento de qual contador de pendências corresponde a cada item do menu mobile
const BADGE_MAP: Partial<Record<PageKey, keyof Omit<PendenciasCount, "total">>> = {
  "minhas-despesas": "minhasDespesas",
  aprovacao:         "aprovacao",
  financeiro:        "financeiro",
  reembolso:         "reembolso",
};

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  pendencias?: PendenciasCount;
}

export default function BottomNav({ currentPage, onNavigate, pendencias }: Props) {
  const currentUser = useAppStore((s) => s.currentUser);
  const perfil = currentUser?.perfil;

  const items: { key: PageKey; icon: React.ReactNode; label: string }[] = [
    { key: "nova-despesa",    icon: <PlusCircle      className="w-5 h-5" />, label: "Nova"       },
    { key: "minhas-despesas", icon: <FileText        className="w-5 h-5" />, label: "Despesas"   },
    { key: "dashboard",       icon: <LayoutDashboard className="w-5 h-5" />, label: "Início"     },
    { key: "controle-km",     icon: <Car             className="w-5 h-5" />, label: "Viagem"     },
    { key: "relatorios",      icon: <BarChart3       className="w-5 h-5" />, label: "Relatórios" },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border flex safe-area-pb">
      {items.map((item) => {
        const active = currentPage === item.key;
        const badgeKey = BADGE_MAP[item.key];
        const badgeCount = (pendencias && badgeKey) ? pendencias[badgeKey] : 0;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              active ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <span className="relative inline-flex">
              {item.icon}
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-destructive text-white font-bold text-[8px] leading-none">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

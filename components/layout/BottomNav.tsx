"use client";

import { useAppStore } from "@/lib/store";
import type { PageKey } from "./AppShell";
import React from "react";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  BarChart3,
  Car,
} from "lucide-react";

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export default function BottomNav({ currentPage, onNavigate }: Props) {
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border flex">
      {items.map((item) => {
        const active = currentPage === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              active ? "text-accent" : "text-muted-foreground"
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

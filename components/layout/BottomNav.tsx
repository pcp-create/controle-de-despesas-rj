"use client";

import { useAppStore } from "@/lib/store";
import type { PageKey } from "./AppShell";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  CheckSquare,
  TrendingUp,
  BarChart3,
  Users,
  Banknote,
} from "lucide-react";

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export default function BottomNav({ currentPage, onNavigate }: Props) {
  const currentUser = useAppStore((s) => s.currentUser);
  const perfil = currentUser?.perfil;

  const items = (() => {
    if (perfil === "funcionario") return [
      { key: "dashboard" as PageKey, icon: <LayoutDashboard className="w-5 h-5" />, label: "Início" },
      { key: "minhas-despesas" as PageKey, icon: <FileText className="w-5 h-5" />, label: "Despesas" },
      { key: "nova-despesa" as PageKey, icon: <PlusCircle className="w-5 h-5" />, label: "Nova" },
    ];
    if (perfil === "gestor") return [
      { key: "dashboard" as PageKey, icon: <LayoutDashboard className="w-5 h-5" />, label: "Início" },
      { key: "aprovacao" as PageKey, icon: <CheckSquare className="w-5 h-5" />, label: "Aprovações" },
    ];
    if (perfil === "financeiro") return [
      { key: "dashboard" as PageKey, icon: <LayoutDashboard className="w-5 h-5" />, label: "Início" },
      { key: "nova-despesa" as PageKey, icon: <PlusCircle className="w-5 h-5" />, label: "Nova" },
      { key: "minhas-despesas" as PageKey, icon: <FileText className="w-5 h-5" />, label: "Despesas" },
      { key: "financeiro" as PageKey, icon: <TrendingUp className="w-5 h-5" />, label: "Financeiro" },
      { key: "reembolso" as PageKey, icon: <Banknote className="w-5 h-5" />, label: "Reembolso" },
    ];
    return [
      { key: "dashboard" as PageKey, icon: <LayoutDashboard className="w-5 h-5" />, label: "Início" },
      { key: "usuarios" as PageKey, icon: <Users className="w-5 h-5" />, label: "Usuários" },
      { key: "financeiro" as PageKey, icon: <TrendingUp className="w-5 h-5" />, label: "Financeiro" },
      { key: "relatorios" as PageKey, icon: <BarChart3 className="w-5 h-5" />, label: "Relatórios" },
    ];
  })();

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

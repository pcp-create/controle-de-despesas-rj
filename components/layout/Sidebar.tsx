"use client";

import { useAppStore } from "@/lib/store";
import type { PageKey } from "./AppShell";
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  CheckSquare,
  BarChart3,
  TrendingUp,
  Users,
  Tag,
  ClipboardList,
  X,
  LogOut,
} from "lucide-react";

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  profiles: string[];
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4.5 h-4.5" />, profiles: ["administrador", "gestor", "financeiro", "tecnico"] },
  { key: "nova-despesa", label: "Nova Despesa", icon: <PlusCircle className="w-4.5 h-4.5" />, profiles: ["tecnico"] },
  { key: "minhas-despesas", label: "Minhas Despesas", icon: <FileText className="w-4.5 h-4.5" />, profiles: ["tecnico"] },
  { key: "aprovacao", label: "Aprovações", icon: <CheckSquare className="w-4.5 h-4.5" />, profiles: ["gestor"] },
  { key: "financeiro", label: "Financeiro / ERP", icon: <TrendingUp className="w-4.5 h-4.5" />, profiles: ["financeiro", "administrador"] },
  { key: "relatorios", label: "Relatórios", icon: <BarChart3 className="w-4.5 h-4.5" />, profiles: ["financeiro", "administrador"] },
  { key: "usuarios", label: "Usuários", icon: <Users className="w-4.5 h-4.5" />, profiles: ["administrador"] },
  { key: "tipos-despesa", label: "Tipos de Despesa", icon: <Tag className="w-4.5 h-4.5" />, profiles: ["administrador"] },
  { key: "auditoria", label: "Auditoria", icon: <ClipboardList className="w-4.5 h-4.5" />, profiles: ["administrador"] },
];

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ currentPage, onNavigate, mobile, onClose }: Props) {
  const { currentUser, logout } = useAppStore();
  const visible = NAV.filter((n) => n.profiles.includes(currentUser?.perfil ?? ""));

  return (
    <aside className="flex flex-col w-60 h-full bg-sidebar text-sidebar-foreground flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7z" fill="white" fillOpacity="0.9" />
              <circle cx="12" cy="12" r="3" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight">Controle de</p>
            <p className="text-xs font-bold text-white/70 leading-tight">Despesas RJ</p>
          </div>
        </div>
        {mobile && (
          <button onClick={onClose} className="p-1 rounded text-sidebar-foreground/60 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {visible.map((item) => {
          const active = currentPage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                active
                  ? "bg-sidebar-primary text-white shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <span className={active ? "text-white" : "text-sidebar-foreground/70"}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}

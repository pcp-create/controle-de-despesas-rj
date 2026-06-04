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
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  Server,
} from "lucide-react";

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  profiles: string[];
}

const NAV: NavItem[] = [
  { key: "dashboard",       label: "Dashboard",        icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","tecnico"] },
  { key: "nova-despesa",    label: "Nova Despesa",      icon: <PlusCircle      className="w-5 h-5 shrink-0" />, profiles: ["tecnico"] },
  { key: "minhas-despesas", label: "Minhas Despesas",   icon: <FileText        className="w-5 h-5 shrink-0" />, profiles: ["tecnico"] },
  { key: "aprovacao",       label: "Aprovações",        icon: <CheckSquare     className="w-5 h-5 shrink-0" />, profiles: ["gestor"] },
  { key: "financeiro",      label: "Financeiro / ERP",  icon: <TrendingUp      className="w-5 h-5 shrink-0" />, profiles: ["financeiro","administrador"] },
  { key: "integracoes-erp", label: "Integrações ERP",   icon: <Server          className="w-5 h-5 shrink-0" />, profiles: ["financeiro","administrador"] },
  { key: "relatorios",      label: "Relatórios",        icon: <BarChart3       className="w-5 h-5 shrink-0" />, profiles: ["financeiro","administrador"] },
  { key: "usuarios",        label: "Usuários",          icon: <Users           className="w-5 h-5 shrink-0" />, profiles: ["administrador"] },
  { key: "tipos-despesa",   label: "Tipos de Despesa",  icon: <Tag             className="w-5 h-5 shrink-0" />, profiles: ["administrador"] },
  { key: "auditoria",       label: "Auditoria",         icon: <ClipboardList   className="w-5 h-5 shrink-0" />, profiles: ["administrador"] },
];

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  /** Modo colapsado (somente ícones) — desktop */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Modo drawer mobile */
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobile,
  onClose,
}: Props) {
  const { currentUser, logout } = useAppStore();
  const visible = NAV.filter((n) => n.profiles.includes(currentUser?.perfil ?? ""));

  return (
    <aside
      className={`flex flex-col h-full bg-sidebar text-sidebar-foreground flex-shrink-0 transition-all duration-300 ${
        mobile ? "w-60" : collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo + toggle */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-sidebar-border">
        {/* Logo — oculta quando colapsado no desktop */}
        <div className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${collapsed && !mobile ? "w-0 opacity-0" : "w-auto opacity-100"}`}>
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7z" fill="white" fillOpacity="0.9" />
              <circle cx="12" cy="12" r="3" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
          <div className="shrink-0">
            <p className="text-xs font-bold text-white leading-tight">Controle de</p>
            <p className="text-xs font-bold text-white/70 leading-tight">Despesas RJ</p>
          </div>
        </div>

        {/* Ícone isolado quando colapsado */}
        {collapsed && !mobile && (
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7z" fill="white" fillOpacity="0.9" />
              <circle cx="12" cy="12" r="3" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
        )}

        {/* Fechar (mobile) ou colapsar (desktop) */}
        {mobile ? (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition shrink-0"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition shrink-0"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
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
              title={collapsed && !mobile ? item.label : undefined}
              className={`flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-all text-left ${
                collapsed && !mobile ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
              } ${
                active
                  ? "bg-sidebar-primary text-white shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <span className={active ? "text-white" : "text-sidebar-foreground/70"}>
                {item.icon}
              </span>
              {(!collapsed || mobile) && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={() => window.location.reload()}
          title={collapsed && !mobile ? "Sair" : undefined}
          className={`flex items-center gap-2 w-full rounded-lg text-sm text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition py-2 ${
            collapsed && !mobile ? "justify-center px-0" : "px-3"
          }`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!collapsed || mobile) && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}

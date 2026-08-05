"use client";

import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth-context";
import type { PageKey } from "./AppShell";
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Files,
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
  Car,
  Banknote,
  Gauge,
} from "lucide-react";
import type { PendenciasCount } from "@/hooks/usePendenciasCount";

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  profiles: string[];
}

interface NavGroup {
  label: string;
  /** Perfis que verão esse grupo (label do separador) — se vazio, sem label */
  visibleFor: string[];
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    visibleFor: ["administrador","gestor","financeiro","funcionario"],
    items: [
      { key: "dashboard",      label: "Dashboard",      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","funcionario"] },
      { key: "nova-despesa",   label: "Nova Despesa",   icon: <PlusCircle      className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","funcionario"] },
      { key: "minhas-despesas",label: "Minhas Despesas",icon: <FileText        className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","funcionario"] },
      { key: "controle-km",   label: "Controle de KM", icon: <Gauge           className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","funcionario"] },
      { key: "relatorios",     label: "Relatórios",     icon: <BarChart3       className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro","funcionario"] },
    ],
  },
  {
    label: "Financeiro",
    visibleFor: ["administrador","gestor","financeiro"],
    items: [
      { key: "todas-despesas",  label: "Todas as Despesas", icon: <Files      className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro"] },
      { key: "financeiro",      label: "Financeiro / ERP",  icon: <TrendingUp className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro"] },
      { key: "reembolso",       label: "Reembolso",         icon: <Banknote   className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor","financeiro"] },

    ],
  },
  {
    label: "Gestão",
    visibleFor: ["administrador","gestor"],
    items: [
      { key: "aprovacao",    label: "Aprovações",       icon: <CheckSquare className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor"] },
      { key: "frotas",       label: "Frotas",           icon: <Car         className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor"] },
      { key: "tipos-despesa",label: "Tipos de Despesa", icon: <Tag         className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor"] },
      { key: "integracoes-erp", label: "Integrações ERP", icon: <TrendingUp className="w-5 h-5 shrink-0" />, profiles: ["administrador","gestor"] },
    ],
  },
  {
    label: "Administração",
    visibleFor: ["administrador"],
    items: [
      { key: "usuarios",  label: "Usuários",  icon: <Users         className="w-5 h-5 shrink-0" />, profiles: ["administrador"] },
      { key: "auditoria", label: "Auditoria", icon: <ClipboardList className="w-5 h-5 shrink-0" />, profiles: ["administrador"] },
    ],
  },
];

// Mapeamento de qual chave de pendências corresponde a cada aba
const BADGE_MAP: Record<string, keyof Omit<PendenciasCount, "total">> = {
  financeiro:       "financeiro",
  reembolso:        "reembolso",
  aprovacao:        "aprovacao",
  frotas:           "consumo",
  "minhas-despesas": "minhasDespesas",
};

function NavBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-destructive text-white font-bold leading-none shrink-0 ${
        collapsed ? "w-4 h-4 text-[9px] absolute -top-1 -right-1" : "w-5 h-5 text-[10px] ml-auto"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface Props {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  /** Modo colapsado (somente ícones) — desktop */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Modo drawer mobile */
  mobile?: boolean;
  onClose?: () => void;
  pendencias?: PendenciasCount;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobile,
  onClose,
  pendencias,
}: Props) {
  const { currentUser } = useAppStore();
  const { signOut } = useAuth();
  const perfil = currentUser?.perfil ?? "";

  const visibleGroups = NAV_GROUPS
    .filter((g) => g.visibleFor.includes(perfil))
    .map((g) => ({
      ...g,
      items: g.items.filter((n) => n.profiles.includes(perfil)),
    }))
    .filter((g) => g.items.length > 0);

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
          <img 
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/RJ%20Branco%202-Pn9QBwHse0Kjls3Cpbdg4mGuwo47pg.png" 
            alt="RJ Compressores" 
            className="h-10 w-auto shrink-0"
          />
        </div>

        {/* Ícone isolado quando colapsado */}
        {collapsed && !mobile && (
          <img 
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/RJ%20Branco%202-Pn9QBwHse0Kjls3Cpbdg4mGuwo47pg.png" 
            alt="RJ" 
            className="h-8 w-auto mx-auto shrink-0"
          />
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
        {visibleGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3" : ""}>
            {/* Separador + label do grupo (só quando expandido e há label) */}
            {group.label && (
              <div className={`flex items-center gap-2 mb-1 ${collapsed && !mobile ? "justify-center px-0" : "px-1"}`}>
                {(!collapsed || mobile) ? (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 truncate">
                    {group.label}
                  </span>
                ) : (
                  <div className="w-4 h-px bg-sidebar-foreground/20" />
                )}
                {(!collapsed || mobile) && <div className="flex-1 h-px bg-sidebar-foreground/10" />}
              </div>
            )}

            {group.items.map((item) => {
              const active = currentPage === item.key;
              const badgeKey = BADGE_MAP[item.key];
              const badgeCount = badgeKey && pendencias ? pendencias[badgeKey] : 0;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  title={collapsed && !mobile ? item.label : undefined}
                  className={`relative flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-all text-left ${
                    collapsed && !mobile ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                  } ${
                    active
                      ? "bg-sidebar-primary text-white shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  {/* Ícone com badge quando colapsado */}
                  <span className={`relative ${active ? "text-white" : "text-sidebar-foreground/70"}`}>
                    {item.icon}
                    {(collapsed && !mobile) && (
                      <NavBadge count={badgeCount} collapsed={true} />
                    )}
                  </span>

                  {(!collapsed || mobile) && (
                    <>
                      <span className="truncate">{item.label}</span>
                      <NavBadge count={badgeCount} collapsed={false} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={() => signOut()}
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

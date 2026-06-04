"use client";

import { useState } from "react";
import { useDespesas } from "@/lib/supabase/hooks";
import type { Despesa } from "@/lib/supabase/hooks";
import { useLoadSupabaseData } from "@/hooks/useLoadSupabaseData";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import HeaderSupabase from "./HeaderSupabase";
import DashboardSupabase from "@/components/dashboard/DashboardSupabase";
import NovaDespesaPageSupabase from "@/components/despesas/NovaDespesaPageSupabase";
import MinhasDespesasPageSupabase from "@/components/despesas/MinhasDespesasPageSupabase";
import TodasDespesasPage from "@/components/despesas/TodasDespesasPage";
import AprovacaoPageSupabase from "@/components/aprovacao/AprovacaoPageSupabase";
import FinanceiroPageSupabase from "@/components/financeiro/FinanceiroPageSupabase";
import RelatoriosPageSupabase from "@/components/relatorios/RelatoriosPageSupabase";
import IntegracoesERPPageSupabase from "@/components/integracoes/IntegracoesERPPageSupabase";
import UsuariosPageSupabase from "@/components/admin/UsuariosPageSupabase";
import TiposDespesaPageSupabase from "@/components/admin/TiposDespesaPageSupabase";
import AlterarSenhaModalSupabase from "@/components/auth/AlterarSenhaModalSupabase";
import AuditoriaPageSupabase from "@/components/admin/AuditoriaPageSupabase";
import { useAppStore } from "@/lib/store";

export type PageKey =
  | "dashboard"
  | "nova-despesa"
  | "minhas-despesas"
  | "aprovacao"
  | "financeiro"
  | "integracoes-erp"
  | "relatorios"
  | "usuarios"
  | "tipos-despesa"
  | "auditoria"
  | "alterar-senha";

export default function AppShellSupabase() {
  const { currentUser } = useAppStore();
  useLoadSupabaseData();
  
  const [page, setPage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAlterarSenha, setShowAlterarSenha] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<Despesa | null>(null);

  const navigate = (p: PageKey) => {
    if (p === "alterar-senha") {
      setShowAlterarSenha(true);
      return;
    }
    setPage(p);
    setSidebarOpen(false);
    setEditingDespesa(null);
  };

  const handleEditDespesa = (despesa: Despesa) => {
    setEditingDespesa(despesa);
    setPage("nova-despesa");
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardSupabase onNavigate={navigate} />;
      case "nova-despesa": return (
        <NovaDespesaPageSupabase 
          onBack={() => { setEditingDespesa(null); setPage("minhas-despesas"); }} 
          editDespesa={editingDespesa}
        />
      );
      case "minhas-despesas": return (
        <MinhasDespesasPageSupabase 
          onNova={() => { setEditingDespesa(null); setPage("nova-despesa"); }}
          onEditar={handleEditDespesa}
        />
      );
      case "aprovacao": return <AprovacaoPageSupabase />;
      case "financeiro": return <FinanceiroPageSupabase />;
      case "integracoes-erp": return <IntegracoesERPPageSupabase />;
      case "relatorios": return <RelatoriosPageSupabase />;
      case "usuarios": return <UsuariosPageSupabase />;
      case "tipos-despesa": return <TiposDespesaPageSupabase />;
      case "auditoria": return <DashboardSupabase onNavigate={navigate} />; // Placeholder
      default: return <DashboardSupabase onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex">
        <Sidebar
          currentPage={page}
          onNavigate={navigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
            currentPage={page}
            onNavigate={navigate}
            collapsed={false}
            onToggleCollapse={() => {}}
            mobile
            onClose={() => setSidebarOpen(false)}
          />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <HeaderSupabase
          onMenuClick={() => setSidebarOpen(true)}
          onAlterarSenha={() => setShowAlterarSenha(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 lg:pb-6">
          {renderPage()}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <BottomNav currentPage={page} onNavigate={navigate} />

      {/* Floating Nova Despesa button mobile */}
      {currentUser?.perfil === "tecnico" && page !== "nova-despesa" && (
        <button
          onClick={() => navigate("nova-despesa")}
          className="fixed bottom-20 right-4 z-30 lg:hidden w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-accent/90 active:scale-95 transition-all"
          aria-label="Nova Despesa"
        >
          +
        </button>
      )}

      {showAlterarSenha && (
        <AlterarSenhaModalSupabase
          onClose={() => setShowAlterarSenha(false)}
        />
      )}
    </div>
  );
}

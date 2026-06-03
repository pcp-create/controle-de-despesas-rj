"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Header from "./Header";
import Dashboard from "@/components/dashboard/Dashboard";
import NovaDespesaPage from "@/components/despesas/NovaDespesaPage";
import MinhasDespesasPage from "@/components/despesas/MinhasDespesasPage";
import AprovacaoPage from "@/components/aprovacao/AprovacaoPage";
import FinanceiroPage from "@/components/financeiro/FinanceiroPage";
import RelatoriosPage from "@/components/relatorios/RelatoriosPage";
import UsuariosPage from "@/components/admin/UsuariosPage";
import TiposDespesaPage from "@/components/admin/TiposDespesaPage";
import AuditoriaPage from "@/components/admin/AuditoriaPage";
import AlterarSenhaModal from "@/components/auth/AlterarSenhaModal";

export type PageKey =
  | "dashboard"
  | "nova-despesa"
  | "minhas-despesas"
  | "aprovacao"
  | "financeiro"
  | "relatorios"
  | "usuarios"
  | "tipos-despesa"
  | "auditoria"
  | "alterar-senha";

export default function AppShell() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAlterarSenha, setShowAlterarSenha] = useState(false);

  const navigate = (p: PageKey) => {
    if (p === "alterar-senha") {
      setShowAlterarSenha(true);
      return;
    }
    setPage(p);
    setSidebarOpen(false);
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard onNavigate={navigate} />;
      case "nova-despesa": return <NovaDespesaPage onBack={() => setPage("minhas-despesas")} />;
      case "minhas-despesas": return <MinhasDespesasPage onNova={() => setPage("nova-despesa")} />;
      case "aprovacao": return <AprovacaoPage />;
      case "financeiro": return <FinanceiroPage />;
      case "relatorios": return <RelatoriosPage />;
      case "usuarios": return <UsuariosPage />;
      case "tipos-despesa": return <TiposDespesaPage />;
      case "auditoria": return <AuditoriaPage />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <Sidebar currentPage={page} onNavigate={navigate} />

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
        <Sidebar currentPage={page} onNavigate={navigate} mobile onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
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

      {showAlterarSenha && currentUser && (
        <AlterarSenhaModal
          userId={currentUser.id}
          onClose={() => setShowAlterarSenha(false)}
        />
      )}
    </div>
  );
}

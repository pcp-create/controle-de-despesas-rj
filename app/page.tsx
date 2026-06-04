"use client";

import { useAppStore } from "@/lib/store";
import { useEffect, useState } from "react";
import SimpleLogin from "@/components/auth/SimpleLogin";
import AppShellSupabase from "@/components/layout/AppShellSupabase";

export default function Home() {
  const currentUser = useAppStore((state) => state.currentUser);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Mostrar loading enquanto hydrata o localStorage
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <SimpleLogin />;
  }

  return <AppShellSupabase />;
}





"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import LoginPage from "@/components/auth/LoginPage";
import AppShell from "@/components/layout/AppShell";
import AlterarSenhaModal from "@/components/auth/AlterarSenhaModal";

export default function Home() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!currentUser) return <LoginPage />;

  return (
    <>
      {currentUser.primeiroAcesso && (
        <AlterarSenhaModal forced userId={currentUser.id} />
      )}
      <AppShell />
    </>
  );
}

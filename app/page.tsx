"use client";

import { useAppStore } from "@/lib/store";
import SimpleLogin from "@/components/auth/SimpleLogin";
import AppShellSupabase from "@/components/layout/AppShellSupabase";

export default function Home() {
  const { currentUser } = useAppStore();

  if (!currentUser) {
    return <SimpleLogin />;
  }

  return <AppShellSupabase />;
}





"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function useLoadSupabaseData() {
  const loadUsersFromSupabase = useAppStore((state) => state.loadUsersFromSupabase);

  useEffect(() => {
    loadUsersFromSupabase();
  }, [loadUsersFromSupabase]);
}

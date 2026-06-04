"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function useLoadSupabaseData() {
  const loadSupabaseData = useAppStore((state) => state.loadSupabaseData);

  useEffect(() => {
    loadSupabaseData();
  }, [loadSupabaseData]);
}

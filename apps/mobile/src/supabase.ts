import { createClient } from "@supabase/supabase-js";
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_KEY__, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "rj-mobile-auth",
  },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(25000),
      }),
  },
});

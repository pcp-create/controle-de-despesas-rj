import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function createClient() {
  console.log("[v0] createClient - URL:", SUPABASE_URL?.substring(0, 50), "KEY:", SUPABASE_ANON_KEY?.substring(0, 20));
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

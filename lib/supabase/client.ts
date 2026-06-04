import { createBrowserClient } from '@supabase/ssr'

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[v0] Supabase env vars not available yet, returning null client')
    return null
  }

  // Singleton pattern - reuse the same client instance
  if (!supabaseClient) {
    supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  return supabaseClient
}

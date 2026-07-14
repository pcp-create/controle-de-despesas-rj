import { createBrowserClient } from '@supabase/ssr'

// Hardcode values as fallback since NEXT_PUBLIC vars need to be available at build time
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://atyzdetofydlxauwwfen.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnVweWJnbnZ6emRycGtmdXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjQ1MzMsImV4cCI6MjA5NjEwMDUzM30.6M3323i61eenzPwTsK9T7Xp7wwfdyYPMBfHuULTd-b8"

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  // Singleton pattern - reuse the same client instance
  if (!supabaseClient) {
    supabaseClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }

  return supabaseClient
}

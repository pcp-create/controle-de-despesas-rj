import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Hardcode values as fallback since env vars may not be available
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://atyzdetofydlxauwwfen.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnVweWJnbnZ6emRycGtmdXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjQ1MzMsImV4cCI6MjA5NjEwMDUzM30.6M3323i61eenzPwTsK9T7Xp7wwfdyYPMBfHuULTd-b8"

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have proxy refreshing
          // user sessions.
        }
      },
    },
  })
}

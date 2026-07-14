import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Hardcode values as fallback since env vars may not be available
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://atyzdetofydlxauwwfen.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eXpkZXRvZnlkbHhhdXd3ZmVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjk5MTEsImV4cCI6MjA5OTYwNTkxMX0.cdb_YRJdrRA7PssLiRUoJtDKFsUi2vcyrIYHN1A1LFc"

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

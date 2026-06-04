import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Hardcode values as fallback since env vars may not be available in edge runtime
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xyvupybgnvzzdrpkfuwb.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnVweWJnbnZ6emRycGtmdXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjQ1MzMsImV4cCI6MjA5NjEwMDUzM30.6M3323i61eenzPwTsK9T7Xp7wwfdyYPMBfHuULTd-b8"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    request.nextUrl.pathname.startsWith('/protected') &&
    !user
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

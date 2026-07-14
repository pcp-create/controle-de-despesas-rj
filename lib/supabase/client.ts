import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = "https://atyzdetofydlxauwwfen.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eXpkZXRvZnlkbHhhdXd3ZmVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjk5MTEsImV4cCI6MjA5OTYwNTkxMX0.cdb_YRJdrRA7PssLiRUoJtDKFsUi2vcyrIYHN1A1LFc"

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with service role — for API routes that write
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Client-side anon client — for reads only
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

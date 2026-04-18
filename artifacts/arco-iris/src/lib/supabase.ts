import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the Arco-iris frontend. Mirrors the setup used by the
 * Ponto and Triagem apps - Supabase Auth's session machinery is disabled
 * because we roll our own company/password auth via SECURITY DEFINER RPCs.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

function buildClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-client-info": "nfs-arco-iris-web" },
    },
  });
}

export const supabase: SupabaseClient | null = buildClient();

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY " +
        "no painel da Vercel (Settings → Environment Variables) e refaça o deploy."
    );
  }
  return supabase;
}

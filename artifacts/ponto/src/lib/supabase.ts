import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the Ponto frontend.
 *
 * Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time (Vite
 * inlines them into the bundle). Both MUST be set in the Vercel project
 * environment — otherwise the app falls back to a client that throws a clear
 * error on first use instead of silently returning a generic "network error".
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

function buildClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      // We're using custom auth (company slug + password via RPC), not
      // Supabase Auth. Disable session persistence so the client doesn't
      // try to restore / refresh JWTs we never issued.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-client-info": "nfs-ponto-web" },
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

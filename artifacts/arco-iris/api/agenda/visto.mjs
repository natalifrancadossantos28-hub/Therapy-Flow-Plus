// "Ok, vi" / toque no aviso: o service worker manda o código do aviso e marcamos como visto.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  const ack = typeof req.body?.ack === "string" ? req.body.ack : "";
  if (!/^[0-9a-f]{32}$/.test(ack)) return res.status(400).json({ error: "código inválido" });
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return res.status(500).json({ error: "Supabase não configurado" });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc("agenda_exec_visto", { p_ack: ack });
  if (error) return res.status(500).json({ error: "falhou" });
  return res.status(200).json({ ok: Boolean(data) });
}

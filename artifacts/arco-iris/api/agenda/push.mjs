// Chamado pelo Supabase (pg_cron + pg_net) a cada lote de avisos da Agenda da Cláudia.
// Recebe só um token de uso único; os destinos e a chave vêm do banco por RPC.
import { createClient } from "@supabase/supabase-js";
import { enviarPush } from "./_webpush.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ error: "token inválido" });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return res.status(500).json({ error: "Supabase não configurado" });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc("agenda_exec_lote_abrir", { p_token: token });
  if (error || !data) return res.status(403).json({ error: "lote inválido ou já usado" });

  const resultados = await Promise.all(
    (data.envios ?? []).map(async (e) => {
      try {
        const r = await enviarPush(e.sub, e.payload, data.vapid);
        return { subId: e.subId, status: r.status, erro: r.texto };
      } catch (err) {
        return { subId: e.subId, status: 0, erro: String(err?.message ?? err).slice(0, 200) };
      }
    }),
  );
  await sb.rpc("agenda_exec_lote_fechar", { p_token: token, p_resultados: resultados });
  return res.status(200).json({ total: resultados.length, ok: resultados.filter((r) => r.status >= 200 && r.status < 300).length });
}

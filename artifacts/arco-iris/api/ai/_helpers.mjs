import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseUrl = () => process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";

/** Empresa do token de login (x-company-auth), conferido no banco. null = sessão inválida. */
export async function getCompanyId(req) {
  const token = req.headers["x-company-auth"];
  if (!token) return null;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl() || !key) throw new Error("Supabase não configurado");
  const hinted = Number(req.headers["x-company-id"]);
  const { data, error } = await createClient(supabaseUrl(), key).rpc("session_company_id", {
    p_token: String(token),
    p_company_id: Number.isFinite(hinted) ? hinted : null,
  });
  if (error || data == null) return null;
  return Number(data);
}

// Pacientes, fila e agenda não são legíveis pela chave pública: sem a chave de
// serviço os relatórios dariam zero, então falha com mensagem clara.
export function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl()) throw new Error("Supabase não configurado");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor");
  return createClient(supabaseUrl(), key);
}

// Tenta os modelos em ordem: o Google desliga versões antigas (404) e às vezes um modelo fica sem vaga (503/429).
const MODELOS_GEMINI = [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"].filter(Boolean);
export function getModel() {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const genAI = new GoogleGenerativeAI(apiKey);
  return {
    async generateContent(prompt) {
      let erro;
      for (const model of MODELOS_GEMINI) {
        try { return await genAI.getGenerativeModel({ model }).generateContent(prompt); }
        catch (e) { erro = e; if (!/\b(404|429|500|503)\b/.test(String(e?.message ?? e))) throw e; }
      }
      throw erro;
    },
  };
}

export function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function parseAIResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { resumo: text };
  }
}

export function cors(req, res) {
  const origin = req.headers.origin ?? "";
  if (origin && /\.vercel\.app$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-company-id, x-company-auth, x-master-auth");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

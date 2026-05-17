// Temporary debug endpoint to check env vars
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const envKeys = Object.keys(process.env).filter(
    (k) =>
      k.includes("DATABASE") ||
      k.includes("POSTGRES") ||
      k.includes("GEMINI") ||
      k.includes("SUPABASE")
  );
  res.json({
    availableEnvKeys: envKeys,
    nodeVersion: process.version,
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
  });
}

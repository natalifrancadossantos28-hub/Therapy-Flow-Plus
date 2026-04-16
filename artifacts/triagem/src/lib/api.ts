/**
 * API_BASE — URL raiz para chamadas ao backend.
 *
 * Em desenvolvimento (Replit): VITE_API_URL não está definida,
 *   então retorna "/api" e o proxy do Vite encaminha para localhost:8080.
 *
 * Em produção (Vercel): VITE_API_URL deve apontar para o backend do Replit
 *   (ex.: https://workspace--natalifrancados.replit.app).
 *   Retorna "https://seu-backend.replit.app/api".
 */
const raw = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE = raw ? raw.replace(/\/$/, "") + "/api" : "/api";

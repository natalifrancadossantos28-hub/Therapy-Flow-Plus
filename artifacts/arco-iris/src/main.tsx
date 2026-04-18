import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// In production (Vercel), rewrite /api/* requests to VITE_API_URL so the
// frontend hosted on Vercel can talk to the backend hosted elsewhere (Replit).
// In dev, the Vite proxy handles /api -> localhost:8080.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

function rewriteApiUrl(url: string): string {
  if (!API_URL) return url;
  if (url.startsWith("/api/") || url === "/api") {
    return API_URL + url;
  }
  return url;
}

// Inject company session headers on all /api/ requests + rewrite host in production
const _origFetch = window.fetch.bind(window);
window.fetch = function (input: RequestInfo | URL, options: RequestInit = {}) {
  const url = typeof input === "string" ? input
    : input instanceof URL ? input.href
    : (input as Request).url;

  const isApi = url.includes("/api/") || url.endsWith("/api");
  const rewritten = isApi && typeof input === "string" ? rewriteApiUrl(input) : input;

  if (isApi) {
    try {
      const raw = sessionStorage.getItem("nfs_ponto_session");
      const session = raw ? JSON.parse(raw) : null;
      if (session) {
        const headers = new Headers(options.headers || {});
        if (session.companyId) headers.set("x-company-id", String(session.companyId));
        if (session.type === "company" && session.adminToken) headers.set("x-company-auth", session.adminToken);
        if (session.type === "master" && session.masterToken) headers.set("x-master-auth", session.masterToken);
        return _origFetch(rewritten, { ...options, headers });
      }
    } catch { /* ignore */ }
  }
  return _origFetch(rewritten, options);
};

createRoot(document.getElementById("root")!).render(<App />);

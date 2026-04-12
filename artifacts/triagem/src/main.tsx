import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import CompanyGuard from "./CompanyGuard";

// Inject company session headers on all /api/ requests
const _origFetch = window.fetch.bind(window);
window.fetch = function (input: RequestInfo | URL, options: RequestInit = {}) {
  const url = typeof input === "string" ? input
    : input instanceof URL ? input.href
    : (input as Request).url;
  if (url.includes("/api/")) {
    try {
      const raw = sessionStorage.getItem("nfs_ponto_session");
      const session = raw ? JSON.parse(raw) : null;
      if (session) {
        const headers = new Headers(options.headers || {});
        if (session.companyId) headers.set("x-company-id", String(session.companyId));
        if (session.type === "company" && session.adminToken) headers.set("x-company-auth", session.adminToken);
        if (session.type === "master" && session.masterToken) headers.set("x-master-auth", session.masterToken);
        return _origFetch(input, { ...options, headers });
      }
    } catch { /* ignore */ }
  }
  return _origFetch(input, options);
};

createRoot(document.getElementById("root")!).render(
  <CompanyGuard module="moduleTriagem" appName="NFs – Triagem Multidisciplinar">
    <App />
  </CompanyGuard>
);

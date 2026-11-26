// Fase 6: portal unificado com 3 scopes de acesso.
// Scope "admin"       -> empresa (master/admin) com acesso total.
// Scope "reception"   -> empresa com acesso restrito ao painel da Recepcao e Fila.
// Scope "professional" -> profissional autenticado via PIN, so ve a propria agenda.
//
// O aparelho guarda só qual empresa usa (DEVICE_KEY), sem token. Cada login
// (senha ou PIN) recebe o próprio token do banco.

const SESSION_KEY = "nfs_ponto_session";
const LEGACY_KEY = "nfs_admin_auth";
const PROFESSIONAL_KEY = "nfs_professional_session";
const DEVICE_KEY = "nfs_device_company";

export type PortalScope = "admin" | "reception" | "professional";

export type CompanySession = {
  type: "company" | "master";
  scope?: "admin" | "reception"; // fase 6
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  adminToken?: string;
  masterToken?: string;
  moduleArcoIris?: boolean;
  moduleTriagem?: boolean;
  modulePonto?: boolean;
  epoch?: number;
};

export type ProfessionalSession = {
  professionalId: number;
  professionalName: string;
  specialty?: string;
};

type DeviceCompany = {
  companyId: number;
  companyName: string;
  companySlug: string;
};

function readDeviceCompany(): DeviceCompany | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as DeviceCompany) : null;
  } catch {
    return null;
  }
}

function writeDeviceCompany(session: CompanySession) {
  if (!session.companyId || !session.companySlug) return;
  const payload: DeviceCompany = {
    companyId: session.companyId,
    companyName: session.companyName ?? "",
    companySlug: session.companySlug,
  };
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage errors */
  }
}

/** Slug da empresa já usada neste aparelho (login atual ou cadastro do aparelho). */
export function getDeviceCompanySlug(): string | null {
  return getCompanySession()?.companySlug ?? readDeviceCompany()?.companySlug ?? null;
}

export function getCompanySession(): CompanySession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCompanySession(session: CompanySession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.setItem(LEGACY_KEY, "true");
  writeDeviceCompany(session);
}

export function getProfessionalSession(): ProfessionalSession | null {
  try {
    const raw = sessionStorage.getItem(PROFESSIONAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setProfessionalSession(session: ProfessionalSession) {
  sessionStorage.setItem(PROFESSIONAL_KEY, JSON.stringify(session));
}

export function getCurrentScope(): PortalScope | null {
  const company = getCompanySession();
  const professional = getProfessionalSession();
  // Profissional tem prioridade se ambas as sessoes estao presentes (ex.:
  // dispositivo enrollado + PIN validado pelo portal).
  if (professional) return "professional";
  if (company?.scope === "reception") return "reception";
  if (company && (company.type === "master" || company.moduleArcoIris)) return "admin";
  return null;
}

export function clearAllSessions() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LEGACY_KEY);
  sessionStorage.removeItem(PROFESSIONAL_KEY);
  for (const k of Object.keys(sessionStorage)) {
    if (k.startsWith("nfs_prof_pin_")) sessionStorage.removeItem(k);
  }
  // NAO limpa DEVICE_KEY: o enrollment persiste entre logouts.
}

export function clearDeviceEnrollment() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAdminScope(): boolean {
  const scope = getCurrentScope();
  return scope === "admin";
}

export function hasReceptionScope(): boolean {
  const scope = getCurrentScope();
  return scope === "admin" || scope === "reception";
}

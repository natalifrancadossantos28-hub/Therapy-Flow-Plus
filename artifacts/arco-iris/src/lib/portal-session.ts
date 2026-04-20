// Fase 6: portal unificado com 3 scopes de acesso.
// Scope "admin"       -> empresa (master/admin) com acesso total.
// Scope "reception"   -> empresa com acesso restrito ao painel da Recepcao e Fila.
// Scope "professional" -> profissional autenticado via PIN, so ve a propria agenda.
//
// Enrollment de dispositivo: quando um admin faz login no portal, as credenciais
// da empresa tambem sao salvas em localStorage (DEVICE_KEY). Quando um
// profissional loga depois via PIN, reusamos essas credenciais para permitir
// que a pagina /agenda-profissionais chame as RPCs protegidas da empresa
// (listAppointments, updateAppointment, etc) sem exigir a senha de novo.

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
  adminToken: string;
  moduleArcoIris?: boolean;
  moduleTriagem?: boolean;
  modulePonto?: boolean;
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
  if (!session.companyId || !session.companySlug || !session.adminToken) return;
  const payload: DeviceCompany = {
    companyId: session.companyId,
    companyName: session.companyName ?? "",
    companySlug: session.companySlug,
    adminToken: session.adminToken,
    moduleArcoIris: session.moduleArcoIris,
    moduleTriagem: session.moduleTriagem,
    modulePonto: session.modulePonto,
  };
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage errors */
  }
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
  // Enrollment: persiste credenciais da empresa no dispositivo para reaproveitar
  // em logins de profissional via PIN.
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

// Fase 6: usado pelo card Profissional do portal para restaurar a sessao da
// empresa a partir do enrollment do dispositivo. Retorna true se conseguiu.
export function restoreCompanyFromDevice(): boolean {
  const existing = getCompanySession();
  if (existing?.companySlug && existing.adminToken) return true;
  const dev = readDeviceCompany();
  if (!dev) return false;
  const session: CompanySession = {
    type: "company",
    scope: "reception", // escopo neutro; o scope real vem do professional.
    companyId: dev.companyId,
    companyName: dev.companyName,
    companySlug: dev.companySlug,
    adminToken: dev.adminToken,
    moduleArcoIris: dev.moduleArcoIris,
    moduleTriagem: dev.moduleTriagem,
    modulePonto: dev.modulePonto,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  sessionStorage.setItem(LEGACY_KEY, "true");
  return true;
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

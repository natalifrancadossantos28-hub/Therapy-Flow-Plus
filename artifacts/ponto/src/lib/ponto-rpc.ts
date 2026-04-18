// Typed Supabase RPC wrappers for the ponto (time-clock) module.
//
// All admin operations authenticate by sending the company slug + admin
// password that the login screen stored in sessionStorage under
// `nfs_ponto_session`. Kiosk operations only need the slug.

import { requireSupabase } from "./supabase";

// ── Session helpers ─────────────────────────────────────────────────────────
export type PontoSession = {
  type: "company" | "kiosk" | "master";
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  adminToken?: string;
  masterToken?: string;
  modulePonto?: boolean;
  moduleTriagem?: boolean;
  moduleArcoIris?: boolean;
};

const SESSION_KEY = "nfs_ponto_session";

export function readSession(): PontoSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PontoSession) : null;
  } catch {
    return null;
  }
}

export function requireCompanyCredentials(): { slug: string; password: string } {
  const s = readSession();
  if (!s?.companySlug || !s?.adminToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return { slug: s.companySlug, password: s.adminToken };
}

export function requireCompanySlug(): string {
  const s = readSession();
  if (!s?.companySlug) {
    throw new Error("Empresa não identificada. Use o link /kiosk/<slug>.");
  }
  return s.companySlug;
}

// ── Shared types ────────────────────────────────────────────────────────────
export type PontoEmployee = {
  id: number;
  companyId: number;
  name: string;
  cpf: string;
  role: string;
  photo: string | null;
  weeklyHours: number;
  active: boolean;
  entryTime: string | null;
  exitTime: string | null;
  breakMinutes: number;
  /** JSON string — `{mon:{in,out,dayOff}, tue:{...}, ...}` */
  schedule: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PontoRecord = {
  id: number;
  employeeId: number;
  companyId: number;
  type: string;
  punchedAt: string;
  date: string;
  createdAt: string;
  employeeName: string | null;
  employeePhoto: string | null;
  role?: string | null;
};

export type PontoPunchResult = {
  id: number;
  employeeId: number;
  companyId: number;
  type: string;
  punchedAt: string;
  date: string;
  createdAt: string;
  employeeName: string;
  employeePhoto: string | null;
  punchIndex: number;
  punchTypeLabel: string;
};

export type PontoKioskEmployee = {
  id: number;
  companyId: number;
  name: string;
  photo: string | null;
  role: string;
};

export type PontoDaySummary = {
  employeeId: number;
  employeeName: string;
  employeePhoto: string | null;
  role: string | null;
  date: string;
  records: Array<{
    id: number;
    employeeId: number;
    type: string;
    punchedAt: string;
    date: string;
  }>;
  totalHours: string | null;
};

// ── Row → app type mappers ──────────────────────────────────────────────────
type EmployeeRow = {
  id: number;
  company_id: number;
  name: string;
  cpf: string;
  role: string;
  photo: string | null;
  weekly_hours: number;
  active: boolean;
  entry_time: string | null;
  exit_time: string | null;
  break_minutes: number;
  schedule: unknown;
  created_at: string;
  updated_at: string;
};

function mapEmployee(row: EmployeeRow): PontoEmployee {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    cpf: row.cpf,
    role: row.role,
    photo: row.photo,
    weeklyHours: row.weekly_hours,
    active: row.active,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    breakMinutes: row.break_minutes,
    schedule: row.schedule == null ? null : typeof row.schedule === "string" ? row.schedule : JSON.stringify(row.schedule),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type RecordRow = {
  id: number;
  employee_id: number;
  company_id: number;
  employee_name: string | null;
  employee_photo: string | null;
  role: string | null;
  type: string;
  punched_at: string;
  date: string;
  created_at: string;
};

function mapRecord(row: RecordRow): PontoRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    companyId: row.company_id,
    employeeName: row.employee_name,
    employeePhoto: row.employee_photo,
    role: row.role,
    type: row.type,
    punchedAt: row.punched_at,
    date: row.date,
    createdAt: row.created_at,
  };
}

// ── Admin RPCs ──────────────────────────────────────────────────────────────
export async function listEmployees(): Promise<PontoEmployee[]> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_employees", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data as EmployeeRow[] | null) ?? []).map(mapEmployee);
}

export async function getEmployee(id: number): Promise<PontoEmployee | null> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_employee", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  const row = data as EmployeeRow | null;
  if (!row?.id) return null;
  return mapEmployee(row);
}

export type UpsertEmployeeInput = {
  id?: number | null;
  name?: string;
  cpf?: string;
  role?: string;
  photo?: string | null;
  weeklyHours?: number;
  active?: boolean;
  entryTime?: string | null;
  exitTime?: string | null;
  breakMinutes?: number;
  schedule?: string | null;
};

export async function upsertEmployee(input: UpsertEmployeeInput): Promise<PontoEmployee> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("upsert_employee", {
    p_slug: slug,
    p_password: password,
    p_id: input.id ?? null,
    p_name: input.name ?? null,
    p_cpf: input.cpf ?? null,
    p_role: input.role ?? null,
    p_photo: input.photo ?? null,
    p_weekly_hours: input.weeklyHours ?? null,
    p_active: input.active ?? null,
    p_entry_time: input.entryTime ?? null,
    p_exit_time: input.exitTime ?? null,
    p_break_minutes: input.breakMinutes ?? null,
    p_schedule: input.schedule ? JSON.parse(input.schedule) : null,
  });
  if (error) throw error;
  return mapEmployee(data as EmployeeRow);
}

export async function deleteEmployee(id: number): Promise<void> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("delete_employee", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

export async function listRecords(params: { employeeId?: number; date?: string } = {}): Promise<PontoRecord[]> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_records", {
    p_slug: slug,
    p_password: password,
    p_employee_id: params.employeeId ?? null,
    p_date: params.date ?? null,
  });
  if (error) throw error;
  return ((data as RecordRow[] | null) ?? []).map(mapRecord);
}

export async function recordsSummary(params: { date: string; employeeId?: number }): Promise<PontoDaySummary[]> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("records_summary", {
    p_slug: slug,
    p_password: password,
    p_date: params.date,
    p_employee_id: params.employeeId ?? null,
  });
  if (error) throw error;
  // RPC returns JSONB array already in camelCase
  return (data as PontoDaySummary[] | null) ?? [];
}

// ── Kiosk RPCs (no password required) ───────────────────────────────────────
export async function getEmployeeByCpf(cpf: string, slugOverride?: string): Promise<PontoKioskEmployee | null> {
  const slug = slugOverride ?? requireCompanySlug();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_employee_by_cpf", {
    p_slug: slug,
    p_cpf: cpf,
  });
  if (error) throw error;
  const row = data as { id: number | null; company_id: number | null; name: string | null; photo: string | null; role: string | null } | null;
  if (!row?.id) return null;
  return { id: row.id, companyId: row.company_id!, name: row.name!, photo: row.photo, role: row.role ?? "" };
}

export async function registerPunch(employeeId: number, slugOverride?: string): Promise<PontoPunchResult> {
  const slug = slugOverride ?? requireCompanySlug();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("register_punch", {
    p_slug: slug,
    p_employee_id: employeeId,
  });
  if (error) throw error;
  const row = data as {
    id: number;
    employee_id: number;
    company_id: number;
    type: string;
    punched_at: string;
    date: string;
    created_at: string;
    employee_name: string;
    employee_photo: string | null;
    punch_index: number;
    punch_type_label: string;
  };
  return {
    id: row.id,
    employeeId: row.employee_id,
    companyId: row.company_id,
    type: row.type,
    punchedAt: row.punched_at,
    date: row.date,
    createdAt: row.created_at,
    employeeName: row.employee_name,
    employeePhoto: row.employee_photo,
    punchIndex: row.punch_index,
    punchTypeLabel: row.punch_type_label,
  };
}

// ── Company lookup (public, for kiosk resolving slug → {id, name, modules}) ─
export type PontoCompanyLookup = {
  id: number;
  name: string;
  modulePonto: boolean;
  moduleTriagem: boolean;
  moduleArcoIris: boolean;
};

export async function getCompanyBySlug(slug: string): Promise<PontoCompanyLookup | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("lookup_company", { p_slug: slug });
  if (error) throw error;
  const row = data as {
    id: number | null; name: string | null;
    module_ponto: boolean | null; module_triagem: boolean | null; module_arco_iris: boolean | null;
  } | null;
  if (!row?.id) return null;
  return {
    id: row.id, name: row.name!,
    modulePonto: !!row.module_ponto,
    moduleTriagem: !!row.module_triagem,
    moduleArcoIris: !!row.module_arco_iris,
  };
}

// ── Company settings (admin) ────────────────────────────────────────────────
export type PontoCompanySettings = {
  id: number;
  name: string;
  slug: string;
  toleranceMinutes: number;
  overtimeBlockEnabled: boolean;
  defaultBreakMinutes: number;
  logoUrl: string | null;
  active: boolean;
  modulePonto: boolean;
  moduleTriagem: boolean;
  moduleArcoIris: boolean;
};

type SettingsRow = {
  id: number; name: string; slug: string;
  tolerance_minutes: number; overtime_block_enabled: boolean; default_break_minutes: number;
  module_ponto: boolean; module_triagem: boolean; module_arco_iris: boolean;
  active: boolean; logo_url: string | null;
};

function mapSettings(row: SettingsRow): PontoCompanySettings {
  return {
    id: row.id, name: row.name, slug: row.slug,
    toleranceMinutes: row.tolerance_minutes,
    overtimeBlockEnabled: row.overtime_block_enabled,
    defaultBreakMinutes: row.default_break_minutes,
    modulePonto: row.module_ponto,
    moduleTriagem: row.module_triagem,
    moduleArcoIris: row.module_arco_iris,
    active: row.active,
    logoUrl: row.logo_url,
  };
}

export async function getCompanySettings(): Promise<PontoCompanySettings | null> {
  const s = readSession();
  if (s?.type !== "company" || !s.companySlug) return null;
  // authenticate_company returns the full safe row — reuse that instead of a
  // dedicated "get settings" RPC.
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("authenticate_company", {
    p_slug: s.companySlug,
    p_password: s.adminToken,
  });
  if (error) throw error;
  const row = data as SettingsRow | null;
  if (!row?.id) return null;
  return mapSettings(row);
}

export type CompanySettingsInput = {
  name?: string;
  toleranceMinutes?: number;
  overtimeBlockEnabled?: boolean;
  defaultBreakMinutes?: number;
  logoUrl?: string | null;
  newAdminPassword?: string;
};

export async function updateCompanySettings(input: CompanySettingsInput): Promise<PontoCompanySettings> {
  const { slug, password } = requireCompanyCredentials();
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("update_company_settings", {
    p_slug: slug,
    p_password: password,
    p_name: input.name ?? null,
    p_tolerance_minutes: input.toleranceMinutes ?? null,
    p_overtime_block_enabled: input.overtimeBlockEnabled ?? null,
    p_default_break_minutes: input.defaultBreakMinutes ?? null,
    p_logo_url: input.logoUrl ?? null,
    p_new_admin_password: input.newAdminPassword ?? null,
  });
  if (error) throw error;
  return mapSettings(data as SettingsRow);
}

// ── Master RPCs (master password required) ─────────────────────────────────
export type PontoMasterCompany = PontoCompanySettings & {
  employeeCount: number;
  createdAt: string;
};

type MasterCompanyRow = SettingsRow & { employee_count: number; created_at: string };

function mapMasterCompany(row: MasterCompanyRow): PontoMasterCompany {
  return {
    ...mapSettings(row),
    employeeCount: Number(row.employee_count ?? 0),
    createdAt: row.created_at,
  };
}

function requireMasterPassword(): string {
  const s = readSession();
  if (s?.type !== "master" || !s.masterToken) {
    throw new Error("Sessão master expirada. Faça login novamente.");
  }
  return s.masterToken;
}

export async function masterListCompanies(): Promise<PontoMasterCompany[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("master_list_companies", {
    p_master_password: requireMasterPassword(),
  });
  if (error) throw error;
  return ((data as MasterCompanyRow[] | null) ?? []).map(mapMasterCompany);
}

export type MasterCompanyInput = {
  id?: number;
  slug?: string;
  name?: string;
  adminPassword?: string;
  toleranceMinutes?: number;
  overtimeBlockEnabled?: boolean;
  defaultBreakMinutes?: number;
  modulePonto?: boolean;
  moduleTriagem?: boolean;
  moduleArcoIris?: boolean;
  logoUrl?: string | null;
  active?: boolean;
};

export async function masterUpsertCompany(input: MasterCompanyInput): Promise<PontoCompanySettings> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("master_upsert_company", {
    p_master_password: requireMasterPassword(),
    p_id: input.id ?? null,
    p_slug: input.slug ?? null,
    p_name: input.name ?? null,
    p_admin_password: input.adminPassword ?? null,
    p_tolerance_minutes: input.toleranceMinutes ?? null,
    p_overtime_block_enabled: input.overtimeBlockEnabled ?? null,
    p_default_break_minutes: input.defaultBreakMinutes ?? null,
    p_module_ponto: input.modulePonto ?? null,
    p_module_triagem: input.moduleTriagem ?? null,
    p_module_arco_iris: input.moduleArcoIris ?? null,
    p_logo_url: input.logoUrl ?? null,
    p_active: input.active ?? null,
  });
  if (error) throw error;
  return mapSettings(data as SettingsRow);
}

export async function masterDeleteCompany(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("master_delete_company", {
    p_master_password: requireMasterPassword(),
    p_id: id,
  });
  if (error) throw error;
}

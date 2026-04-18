import { requireSupabase } from "./supabase";

/**
 * Arco-iris RPC wrappers (Fase 4A - cadastros).
 *
 * The migration 0006 exposes SECURITY DEFINER RPCs for professionals,
 * contractors and colaboradores. All of them take the company slug +
 * admin password (bcrypt-verified server-side) and do the work.
 *
 * Frontend snake_case -> camelCase mapping is centralised here so pages
 * consume camelCase objects identical to what the old REST API returned.
 */

const SESSION_KEY = "nfs_ponto_session";

type Session = {
  type: "company" | "master";
  companyId: number;
  companyName: string;
  companySlug: string;
  adminToken: string;
};

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function requireCompanyCredentials(): { slug: string; password: string } {
  const s = readSession();
  if (!s || s.type !== "company" || !s.companySlug || !s.adminToken) {
    throw new Error("Sessão de empresa expirada. Faça login novamente.");
  }
  return { slug: s.companySlug, password: s.adminToken };
}

// ── Types exposed to pages (camelCase) ──────────────────────────────────────

export type Professional = {
  id: number;
  companyId: number;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  pin: string | null;
  cargaHoraria: string;
  tipoContrato: string;
  salario: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Contractor = {
  id: number;
  companyId: number;
  name: string;
  valorPorAtendimento: number;
  createdAt: string;
  updatedAt: string;
};

export type Colaborador = {
  id: number;
  companyId: number;
  name: string;
  cargo: string;
  salario: number;
  createdAt: string;
  updatedAt: string;
};

// ── Row mappers ─────────────────────────────────────────────────────────────

type ProfessionalRow = {
  id: number | string;
  company_id: number | string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  pin: string | null;
  carga_horaria: string;
  tipo_contrato: string;
  salario: string | number | null;
  created_at: string;
  updated_at: string;
};

function mapProfessional(r: ProfessionalRow): Professional {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    name: r.name,
    specialty: r.specialty,
    email: r.email,
    phone: r.phone,
    pin: r.pin,
    cargaHoraria: r.carga_horaria,
    tipoContrato: r.tipo_contrato,
    salario: r.salario == null ? null : Number(r.salario),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type ContractorRow = {
  id: number | string;
  company_id: number | string;
  name: string;
  valor_por_atendimento: string | number;
  created_at: string;
  updated_at: string;
};

function mapContractor(r: ContractorRow): Contractor {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    name: r.name,
    valorPorAtendimento: Number(r.valor_por_atendimento),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type ColaboradorRow = {
  id: number | string;
  company_id: number | string;
  name: string;
  cargo: string;
  salario: string | number;
  created_at: string;
  updated_at: string;
};

function mapColaborador(r: ColaboradorRow): Colaborador {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    name: r.name,
    cargo: r.cargo,
    salario: Number(r.salario),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Professionals ───────────────────────────────────────────────────────────

export async function listProfessionals(): Promise<Professional[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_professionals", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  const rows = (data ?? []) as ProfessionalRow[];
  return rows.map(mapProfessional);
}

export async function getProfessional(id: number): Promise<Professional | null> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_professional", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id == null) return null;
  return mapProfessional(row as ProfessionalRow);
}

export type ProfessionalPayload = {
  name: string;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
  pin?: string | null;
  cargaHoraria?: string | null;
  tipoContrato?: string | null;
  salario?: number | null;
};

export async function upsertProfessional(
  id: number | null,
  payload: ProfessionalPayload
): Promise<Professional> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_professional", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar profissional.");
  return mapProfessional(row as ProfessionalRow);
}

export async function deleteProfessional(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_professional", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

/**
 * PIN verification does not require the admin password - the agenda wing
 * uses it as a lightweight lock for each professional. The migration
 * restricts PIN lookup to (slug, professional_id, pin) so a wrong PIN
 * returns null.
 */
export async function verifyProfessionalPin(
  professionalId: number,
  pin: string
): Promise<Professional | null> {
  const supabase = requireSupabase();
  const s = readSession();
  const slug = s?.companySlug;
  if (!slug) throw new Error("Sessão de empresa expirada. Faça login novamente.");
  const { data, error } = await supabase.rpc("verify_professional_pin", {
    p_slug: slug,
    p_professional_id: professionalId,
    p_pin: pin,
  });
  if (error) throw error;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id == null) return null;
  return mapProfessional(row as ProfessionalRow);
}

// ── Contractors ─────────────────────────────────────────────────────────────

export async function listContractors(): Promise<Contractor[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_contractors", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as ContractorRow[]).map(mapContractor);
}

export type ContractorPayload = {
  name: string;
  valorPorAtendimento?: number | null;
};

export async function upsertContractor(
  id: number | null,
  payload: ContractorPayload
): Promise<Contractor> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_contractor", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar contratante.");
  return mapContractor(row as ContractorRow);
}

export async function deleteContractor(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_contractor", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

// ── Colaboradores ───────────────────────────────────────────────────────────

export async function listColaboradores(): Promise<Colaborador[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_colaboradores", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as ColaboradorRow[]).map(mapColaborador);
}

export type ColaboradorPayload = {
  name: string;
  cargo?: string | null;
  salario?: number | null;
};

export async function upsertColaborador(
  id: number | null,
  payload: ColaboradorPayload
): Promise<Colaborador> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_colaborador", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar colaborador.");
  return mapColaborador(row as ColaboradorRow);
}

export async function deleteColaborador(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_colaborador", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

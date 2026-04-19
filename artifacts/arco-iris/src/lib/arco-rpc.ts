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

// ── Patients ────────────────────────────────────────────────────────────────

export type Patient = {
  id: number;
  companyId: number;
  prontuario: string | null;
  name: string;
  dateOfBirth: string | null;
  cpf: string | null;
  cns: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  motherName: string | null;
  diagnosis: string | null;
  notes: string | null;
  professionalId: number | null;
  status: string;
  entryDate: string | null;
  absenceCount: number;
  consecutiveUnjustifiedAbsences: number;
  triagemScore: number | null;
  scorePsicologia: number | null;
  scorePsicomotricidade: number | null;
  scoreFisioterapia: number | null;
  scorePsicopedagogia: number | null;
  scoreEdFisica: number | null;
  scoreFonoaudiologia: number | null;
  scoreTO: number | null;
  scoreNutricionista: number | null;
  escolaPublica: boolean | null;
  trabalhoNaRoca: boolean | null;
  tipoRegistro: string | null;
  localAtendimento: string | null;
  createdAt: string;
  updatedAt: string;
};

type PatientRow = {
  id: number | string;
  company_id: number | string;
  prontuario: string | null;
  name: string;
  date_of_birth: string | null;
  cpf: string | null;
  cns: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  mother_name: string | null;
  diagnosis: string | null;
  notes: string | null;
  professional_id: number | string | null;
  status: string;
  entry_date: string | null;
  absence_count: number | string;
  consecutive_unjustified_absences: number | string;
  triagem_score: number | string | null;
  score_psicologia: number | string | null;
  score_psicomotricidade: number | string | null;
  score_fisioterapia: number | string | null;
  score_psicopedagogia: number | string | null;
  score_ed_fisica: number | string | null;
  score_fonoaudiologia: number | string | null;
  score_to: number | string | null;
  score_nutricionista: number | string | null;
  escola_publica: boolean | null;
  trabalho_na_roca: boolean | null;
  tipo_registro: string | null;
  local_atendimento: string | null;
  created_at: string;
  updated_at: string;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPatient(r: PatientRow): Patient {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    prontuario: r.prontuario,
    name: r.name,
    dateOfBirth: r.date_of_birth,
    cpf: r.cpf,
    cns: r.cns,
    phone: r.phone,
    email: r.email,
    address: r.address,
    guardianName: r.guardian_name,
    guardianPhone: r.guardian_phone,
    motherName: r.mother_name,
    diagnosis: r.diagnosis,
    notes: r.notes,
    professionalId: num(r.professional_id),
    status: r.status,
    entryDate: r.entry_date,
    absenceCount: Number(r.absence_count ?? 0),
    consecutiveUnjustifiedAbsences: Number(r.consecutive_unjustified_absences ?? 0),
    triagemScore: num(r.triagem_score),
    scorePsicologia: num(r.score_psicologia),
    scorePsicomotricidade: num(r.score_psicomotricidade),
    scoreFisioterapia: num(r.score_fisioterapia),
    scorePsicopedagogia: num(r.score_psicopedagogia),
    scoreEdFisica: num(r.score_ed_fisica),
    scoreFonoaudiologia: num(r.score_fonoaudiologia),
    scoreTO: num(r.score_to),
    scoreNutricionista: num(r.score_nutricionista),
    escolaPublica: r.escola_publica,
    trabalhoNaRoca: r.trabalho_na_roca,
    tipoRegistro: r.tipo_registro,
    localAtendimento: r.local_atendimento,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type PatientPayload = Partial<Omit<Patient, "id" | "companyId" | "createdAt" | "updatedAt">>;

export async function listPatients(opts?: {
  status?: string | null;
  professionalId?: number | null;
}): Promise<Patient[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_patients", {
    p_slug: slug,
    p_password: password,
    p_status: opts?.status ?? null,
    p_professional_id: opts?.professionalId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as PatientRow[]).map(mapPatient);
}

export async function getPatient(id: number): Promise<Patient | null> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_patient", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id == null) return null;
  return mapPatient(row as PatientRow);
}

export async function upsertPatient(
  id: number | null,
  payload: PatientPayload
): Promise<Patient> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_patient", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar paciente.");
  return mapPatient(row as PatientRow);
}

export async function deletePatient(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_patient", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

export type NextProntuarioInfo = {
  nextProntuario: string;
  ultimo: string | null;
};

export async function nextProntuario(): Promise<NextProntuarioInfo> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("next_prontuario", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return data as NextProntuarioInfo;
}

export type CheckProntuarioInfo = {
  existe: boolean;
  paciente?: { id: number; name: string };
};

export async function checkProntuario(prontuario: string): Promise<CheckProntuarioInfo> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("check_prontuario", {
    p_slug: slug,
    p_password: password,
    p_prontuario: prontuario,
  });
  if (error) throw error;
  return data as CheckProntuarioInfo;
}

export type AddToFilaResult = {
  id: number;
  companyId: number;
  patientId: number;
  professionalId: number | null;
  specialty: string | null;
  priority: string;
  notes: string | null;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  patientName: string;
  calculatedFrom: {
    triagemScore: number;
    escolaPublica: boolean | null;
    trabalhoNaRoca: boolean | null;
  };
};

export async function addPatientToFila(
  patientId: number,
  specialty: string | null,
  notes?: string | null
): Promise<AddToFilaResult> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("add_patient_to_waiting_list", {
    p_slug: slug,
    p_password: password,
    p_patient_id: patientId,
    p_specialty: specialty,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as AddToFilaResult;
}

export type PatientAbsencesInfo = {
  patientId: number;
  patientName: string;
  absenceCount: number;
  hasWarning: boolean;
  absences: unknown[];
};

export async function getPatientAbsences(id: number): Promise<PatientAbsencesInfo> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_patient_absences", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  return data as PatientAbsencesInfo;
}

export type PatientPdfData = {
  patient: Patient;
  professional: Professional | null;
  absenceCount: number;
  totalAppointments: number;
  lastAppointmentDate: string | null;
};

export async function getPatientPdf(id: number): Promise<PatientPdfData> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_patient_pdf", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  const raw = data as {
    patient: PatientRow;
    professional: ProfessionalRow | null;
    absenceCount: number;
    totalAppointments: number;
    lastAppointmentDate: string | null;
  };
  return {
    patient: mapPatient(raw.patient),
    professional: raw.professional ? mapProfessional(raw.professional) : null,
    absenceCount: raw.absenceCount,
    totalAppointments: raw.totalAppointments,
    lastAppointmentDate: raw.lastAppointmentDate,
  };
}

// ── Waiting list ────────────────────────────────────────────────────────────

export type WaitingListEntry = {
  id: number;
  companyId: number;
  patientId: number;
  patientName: string;
  patientPhone: string | null;
  patientProntuario: string | null;
  professionalId: number | null;
  professionalName: string | null;
  professionalSpecialty: string | null;
  specialty: string | null;
  priority: string;
  notes: string | null;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
};

export async function listWaitingList(opts?: {
  professionalId?: number | null;
}): Promise<WaitingListEntry[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_waiting_list", {
    p_slug: slug,
    p_password: password,
    p_professional_id: opts?.professionalId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as WaitingListEntry[];
}

export type WaitingListPayload = {
  patientId?: number;
  professionalId?: number | null;
  specialty?: string | null;
  priority?: string | null;
  notes?: string | null;
  entryDate?: string | null;
};

export async function upsertWaitingListEntry(
  id: number | null,
  payload: WaitingListPayload
): Promise<WaitingListEntry> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_waiting_list", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  return data as WaitingListEntry;
}

export async function deleteWaitingListEntry(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_waiting_list", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

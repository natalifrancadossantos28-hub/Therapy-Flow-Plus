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

// Fase 6: lista publica por slug (sem senha), usada pelo Portal unificado.
export async function listProfessionalsPublic(
  slug: string
): Promise<Array<{ id: number; name: string; specialty: string | null }>> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_professionals_public", {
    p_slug: slug.trim().toLowerCase(),
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: number; name: string; specialty: string | null }>).map(
    (r) => ({ id: Number(r.id), name: r.name, specialty: r.specialty })
  );
}

// Fase 6: verifica PIN passando slug explicito (sem depender de sessao de empresa).
export async function verifyProfessionalPinWithSlug(
  slug: string,
  professionalId: number,
  pin: string
): Promise<{ id: number; name: string; specialty: string | null } | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("verify_professional_pin", {
    p_slug: slug.trim().toLowerCase(),
    p_professional_id: professionalId,
    p_pin: pin,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { id: Number(row.id), name: row.name, specialty: row.specialty };
}

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
  /** Score clinico escalado para 0..100 (Fase 5C). */
  scoreClinico?: number | null;
  /** Score social (0..4): +2 escola municipal/estadual, +2 trabalho informal/roca. Desempate apenas. */
  scoreSocial?: number | null;
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

// ── Appointments (Fase 4C) ──────────────────────────────────────────────────

export type AppointmentStatus =
  | "agendado"
  | "atendimento"
  | "ausente"
  | "falta_justificada"
  | "falta_nao_justificada"
  | "cancelado"
  | "alta";

export type AppointmentFrequency = "semanal" | "quinzenal" | "mensal";

export type AppointmentToday = {
  id: number;
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  status: AppointmentStatus | string;
  notes: string | null;
  rescheduledTo: string | null;
  recurrenceGroupId: string | null;
  frequency: AppointmentFrequency | string;
  patientName: string;
  patientPhone: string | null;
  patientAbsenceCount: number;
  professionalName: string;
  professionalSpecialty: string;
  ciclo: "A" | "B" | "M" | null;
  createdAt: string;
  updatedAt: string;
};

type AppointmentTodayRow = {
  id: number | string;
  patient_id: number | string;
  professional_id: number | string;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  rescheduled_to: string | null;
  recurrence_group_id: string | null;
  frequency: string;
  patient_name: string;
  patient_phone: string | null;
  patient_absence_count: number | string;
  professional_name: string;
  professional_specialty: string;
  ciclo: string | null;
  created_at: string;
  updated_at: string;
};

function mapAppointmentToday(r: AppointmentTodayRow): AppointmentToday {
  return {
    id: Number(r.id),
    patientId: Number(r.patient_id),
    professionalId: Number(r.professional_id),
    date: r.date,
    time: r.time,
    status: r.status,
    notes: r.notes,
    rescheduledTo: r.rescheduled_to,
    recurrenceGroupId: r.recurrence_group_id,
    frequency: r.frequency,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    patientAbsenceCount: Number(r.patient_absence_count ?? 0),
    professionalName: r.professional_name,
    professionalSpecialty: r.professional_specialty,
    ciclo: (r.ciclo as "A" | "B" | "M" | null) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAppointmentsToday(opts?: {
  professionalId?: number | null;
}): Promise<AppointmentToday[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_appointments_today", {
    p_slug: slug,
    p_password: password,
    p_professional_id: opts?.professionalId ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as AppointmentTodayRow[];
  return rows.map(mapAppointmentToday);
}

export type AppointmentListItem = {
  id: number;
  companyId: number;
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  status: AppointmentStatus | string;
  notes: string | null;
  rescheduledTo: string | null;
  recurrenceGroupId: string | null;
  frequency: AppointmentFrequency | string;
  patientName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  professionalName: string;
  escolaPublica: boolean;
  trabalhoNaRoca: boolean;
  consecutiveUnjustifiedAbsences: number;
  createdAt: string;
  updatedAt: string;
};

type AppointmentListRow = {
  id: number | string;
  company_id: number | string;
  patient_id: number | string;
  professional_id: number | string;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  rescheduled_to: string | null;
  recurrence_group_id: string | null;
  frequency: string;
  patient_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  professional_name: string;
  escola_publica: boolean | null;
  trabalho_na_roca: boolean | null;
  consecutive_unjustified_absences: number | string | null;
  created_at: string;
  updated_at: string;
};

function mapAppointmentListItem(r: AppointmentListRow): AppointmentListItem {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    patientId: Number(r.patient_id),
    professionalId: Number(r.professional_id),
    date: r.date,
    time: r.time,
    status: r.status,
    notes: r.notes,
    rescheduledTo: r.rescheduled_to,
    recurrenceGroupId: r.recurrence_group_id,
    frequency: r.frequency,
    patientName: r.patient_name,
    guardianName: r.guardian_name,
    guardianPhone: r.guardian_phone,
    professionalName: r.professional_name,
    escolaPublica: !!r.escola_publica,
    trabalhoNaRoca: !!r.trabalho_na_roca,
    consecutiveUnjustifiedAbsences: Number(r.consecutive_unjustified_absences ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAppointments(opts?: {
  date?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  professionalId?: number | null;
  patientId?: number | null;
}): Promise<AppointmentListItem[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_appointments", {
    p_slug: slug,
    p_password: password,
    p_date: opts?.date ?? null,
    p_date_from: opts?.dateFrom ?? null,
    p_date_to: opts?.dateTo ?? null,
    p_professional_id: opts?.professionalId ?? null,
    p_patient_id: opts?.patientId ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as AppointmentListRow[];
  return rows.map(mapAppointmentListItem);
}

export type NextAppointment = {
  id: number;
  date: string;
  time: string;
  frequency: string;
  patientId: number;
  professionalId: number;
  patientName: string;
  professionalName: string;
  ciclo: "A" | "B" | null;
};

export async function getNextAppointment(opts?: {
  patientId?: number | null;
  professionalId?: number | null;
}): Promise<NextAppointment | null> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_next_appointment", {
    p_slug: slug,
    p_password: password,
    p_patient_id: opts?.patientId ?? null,
    p_professional_id: opts?.professionalId ?? null,
  });
  if (error) throw error;
  return (data as NextAppointment | null) ?? null;
}

export type AppointmentsStats = {
  semanal: number;
  mensal: number;
  trimestral: number;
  semestral: number;
  anual: number;
};

export async function getAppointmentsStats(): Promise<AppointmentsStats> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_appointments_stats", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return data as AppointmentsStats;
}

export type CreateAppointmentsPayload = {
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  notes?: string | null;
  frequency?: AppointmentFrequency;
  noRecurrence?: boolean;
  fromWaitingList?: boolean;
};

export type CreateAppointmentsResult = {
  id: number;
  companyId: number;
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  recurrenceGroupId: string | null;
  frequency: string;
  totalCreated: number;
};

export async function createAppointments(
  payload: CreateAppointmentsPayload
): Promise<CreateAppointmentsResult> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("create_appointments", {
    p_slug: slug,
    p_password: password,
    p_patient_id: payload.patientId,
    p_professional_id: payload.professionalId,
    p_date: payload.date,
    p_time: payload.time,
    p_notes: payload.notes ?? null,
    p_frequency: payload.frequency ?? "semanal",
    p_no_recurrence: !!payload.noRecurrence,
    p_from_waiting_list: !!payload.fromWaitingList,
  });
  if (error) throw error;
  return data as CreateAppointmentsResult;
}

export type UpdateAppointmentPayload = {
  status?: AppointmentStatus | string;
  rescheduledTo?: string | null;
  notes?: string | null;
  date?: string;
  time?: string;
};

export type UpdateAppointmentResult = {
  id: number;
  companyId: number;
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  rescheduledTo: string | null;
  recurrenceGroupId: string | null;
  frequency: string;
  consecutiveUnjustifiedAbsences: number;
  escolaPublica: boolean;
  trabalhoNaRoca: boolean;
};

export async function updateAppointment(
  id: number,
  payload: UpdateAppointmentPayload
): Promise<UpdateAppointmentResult> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("update_appointment", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_status: payload.status ?? null,
    p_rescheduled_to: payload.rescheduledTo ?? null,
    p_notes: payload.notes ?? null,
    p_date: payload.date ?? null,
    p_time: payload.time ?? null,
  });
  if (error) throw error;
  return data as UpdateAppointmentResult;
}

export async function deleteAppointmentAlta(
  id: number
): Promise<{ ok: true; deletedCount: number }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("delete_appointment_alta", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
  return data as { ok: true; deletedCount: number };
}

export async function deleteAppointment(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_appointment", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

// ── Notificacoes recepcao (Fase 4C) ─────────────────────────────────────────

export type NotificacaoRecepcao = {
  id: number;
  companyId: number;
  appointmentId: number | null;
  patientName: string;
  professionalName: string;
  acao: string;
  dataConsulta: string;
  horaConsulta: string;
  lido: boolean;
  createdAt: string;
};

type NotificacaoRow = {
  id: number | string;
  company_id: number | string;
  appointment_id: number | string | null;
  patient_name: string;
  professional_name: string;
  acao: string;
  data_consulta: string;
  hora_consulta: string;
  lido: boolean;
  created_at: string;
};

function mapNotificacao(r: NotificacaoRow): NotificacaoRecepcao {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    appointmentId: r.appointment_id == null ? null : Number(r.appointment_id),
    patientName: r.patient_name,
    professionalName: r.professional_name,
    acao: r.acao,
    dataConsulta: r.data_consulta,
    horaConsulta: r.hora_consulta,
    lido: !!r.lido,
    createdAt: r.created_at,
  };
}

export async function listNotificacoes(): Promise<NotificacaoRecepcao[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_notificacoes", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  const rows = (data ?? []) as NotificacaoRow[];
  return rows.map(mapNotificacao);
}

export type NotificacaoPayload = {
  appointmentId?: number | null;
  patientName: string;
  professionalName?: string | null;
  acao: string;
  dataConsulta?: string;
  horaConsulta?: string;
};

export async function createNotificacao(
  payload: NotificacaoPayload
): Promise<NotificacaoRecepcao> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("create_notificacao", {
    p_slug: slug,
    p_password: password,
    p_appointment_id: payload.appointmentId ?? null,
    p_patient_name: payload.patientName,
    p_professional_name: payload.professionalName ?? null,
    p_acao: payload.acao,
    p_data_consulta: payload.dataConsulta ?? "",
    p_hora_consulta: payload.horaConsulta ?? "",
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapNotificacao(row as NotificacaoRow);
}

export async function markNotificacaoLido(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("mark_notificacao_lido", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

export async function markAllNotificacoesLido(): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("mark_all_notificacoes_lido", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
}

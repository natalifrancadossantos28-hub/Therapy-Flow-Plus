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
  if (!row || row.id == null) return null;
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

export type ProfessionalCapacity = {
  id: number;
  name: string;
  specialty: string | null;
  cargaHoraria: string;
  maxPatients: number;
  currentPatients: number;
};

export async function listProfessionalsCapacity(): Promise<ProfessionalCapacity[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_professionals_capacity", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: number | string;
    name: string;
    specialty: string | null;
    cargaHoraria: string;
    maxPatients: number;
    currentPatients: number;
  }>;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    specialty: r.specialty,
    cargaHoraria: r.cargaHoraria || "30h",
    maxPatients: Number(r.maxPatients) || 35,
    currentPatients: Number(r.currentPatients) || 0,
  }));
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
 * Transfere (reatribui) os agendamentos de um profissional para outro, mantendo
 * data/hora/paciente/recorrência. Usado quando um profissional sai e outro
 * assume os pacientes — evita ter que excluir o antigo (que apagaria a agenda em
 * cascata) e remontar a grade.
 *
 * onlyFuture=true move só de hoje em diante (preserva o histórico no nome antigo).
 */
export async function transferAppointments(params: {
  fromProfessionalId: number;
  toProfessionalId: number;
  onlyFuture?: boolean;
}): Promise<{ movedCount: number }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("transfer_appointments", {
    p_slug: slug,
    p_password: password,
    p_from_professional_id: params.fromProfessionalId,
    p_to_professional_id: params.toProfessionalId,
    p_only_future: !!params.onlyFuture,
  });
  if (error) throw error;
  return { movedCount: Number((data as { movedCount?: number })?.movedCount ?? 0) };
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
  abrigoCasaCrianca: boolean | null;
  tipoRegistro: string | null;
  localAtendimento: string | null;
  photoUrl: string | null;
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
  abrigo_casa_crianca: boolean | null;
  tipo_registro: string | null;
  local_atendimento: string | null;
  photo_url: string | null;
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
    abrigoCasaCrianca: r.abrigo_casa_crianca,
    tipoRegistro: r.tipo_registro,
    localAtendimento: r.local_atendimento,
    photoUrl: r.photo_url,
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

const PATIENT_PHOTO_BUCKET = "patient-photos";

// Sobe a foto (ja comprimida) do paciente para o Storage e devolve a URL
// publica. Path inclui companyId + patientId (ou "novo") para evitar colisao.
export async function uploadPatientPhoto(
  blob: Blob,
  patientId: number | null
): Promise<string> {
  const supabase = requireSupabase();
  const s = readSession();
  if (!s?.companyId) throw new Error("Sessão de empresa expirada. Faça login novamente.");
  const key = patientId != null ? String(patientId) : "novo";
  const path = `${s.companyId}/${key}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(PATIENT_PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(PATIENT_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
  notes?: string | null,
  skipTriagemCheck?: boolean
): Promise<AddToFilaResult> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("add_patient_to_waiting_list", {
    p_slug: slug,
    p_password: password,
    p_patient_id: patientId,
    p_specialty: specialty,
    p_notes: notes ?? null,
    p_skip_triagem: skipTriagemCheck ?? false,
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
  /** Score bruto da triagem (0..360), origem do calculo. */
  triagemScore?: number | null;
  /** Flag de vulnerabilidade: escola municipal/estadual (+2 no score /150). */
  escolaPublica?: boolean | null;
  /** Flag de vulnerabilidade: trabalho informal/roca (+2 no score /150). */
  trabalhoNaRoca?: boolean | null;
  /** Flag de vulnerabilidade: reside em abrigo / casa da criança (Prioridade Máxima). */
  abrigoCasaCrianca?: boolean | null;
  /** True quando o paciente atende a algum criterio de Prioridade Maxima (idade<5 ou abrigo). */
  prioridadeMaxima?: boolean | null;
  /** 'idade' | 'abrigo' | 'idade_e_abrigo' — razao da Prioridade Maxima. */
  prioridadeMaximaRazao?: string | null;
  /** Score exibido em escala /150 (espelho do Perfil Multidisciplinar). */
  scoreTotal150?: number | null;
  /** Score 0..72 da especialidade desta entrada (fonte da cor da fila). */
  scoreEspecialidade?: number | null;
  /** Maximo da escala por especialidade (sempre 72). */
  scoreEspecialidadeMax?: number | null;
  /** Bonus de desempate (0..2): +1 Escola Publica, +1 Trabalho na Roca. */
  scoreSocialDesempate?: number | null;
  /** Score efetivo usado pra ordenar dentro da cor (0..74). */
  scoreEspecialidadeTotal?: number | null;
  /** Bônus de idade: <4 anos = +50, 4-6 anos = +20, >6 = 0. */
  ageBonus?: number | null;
  /** Data de nascimento do paciente (ISO). */
  dateOfBirth?: string | null;
  /** Busca ativa: paciente congelado, fora da disputa por vaga prioritária. */
  paused?: boolean | null;
  /** Quando foi congelado (ISO). */
  pausedAt?: string | null;
  /** Motivo do congelamento (ex.: "busca ativa"). */
  pausedReason?: string | null;
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

/**
 * Congela (busca ativa) ou descongela uma entrada da fila. Entradas congeladas
 * saem da disputa por vaga prioritária mas continuam na fila com o histórico.
 */
export async function setWaitingListPaused(
  id: number,
  paused: boolean,
  reason?: string | null
): Promise<{ id: number; paused: boolean; pausedAt: string | null; pausedReason: string | null }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("set_waiting_list_paused", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_paused: paused,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as { id: number; paused: boolean; pausedAt: string | null; pausedReason: string | null };
}

export async function syncWaitingListWithAgenda(): Promise<{
  ok: boolean;
  duplicatesRemoved: number;
  syncedRemoved: number;
  statusFixed: number;
}> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("sync_waiting_list_with_agenda", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return data as { ok: boolean; duplicatesRemoved: number; syncedRemoved: number; statusFixed: number };
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
  patientStatus: string;
  patientPhone: string | null;
  patientAbsenceCount: number;
  professionalName: string;
  professionalSpecialty: string;
  ciclo: "A" | "B" | "M" | null;
  prontuario: string | null;
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
  patient_status: string | null;
  patient_phone: string | null;
  patient_absence_count: number | string;
  professional_name: string;
  professional_specialty: string;
  ciclo: string | null;
  prontuario: string | null;
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
    patientStatus: r.patient_status ?? "",
    patientPhone: r.patient_phone,
    patientAbsenceCount: Number(r.patient_absence_count ?? 0),
    professionalName: r.professional_name,
    professionalSpecialty: r.professional_specialty,
    ciclo: (r.ciclo as "A" | "B" | "M" | null) ?? null,
    prontuario: r.prontuario ?? null,
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
  patientStatus: string;
  guardianName: string | null;
  guardianPhone: string | null;
  professionalName: string;
  escolaPublica: boolean;
  trabalhoNaRoca: boolean;
  consecutiveUnjustifiedAbsences: number;
  prontuario: string | null;
  paused: boolean;
  pausedAt: string | null;
  pausedReason: string | null;
  pausedReturnDate: string | null;
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
  patient_status: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  professional_name: string;
  escola_publica: boolean | null;
  trabalho_na_roca: boolean | null;
  consecutive_unjustified_absences: number | string | null;
  prontuario: string | null;
  paused: boolean | null;
  paused_at: string | null;
  paused_reason: string | null;
  paused_return_date: string | null;
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
    patientStatus: r.patient_status ?? "",
    guardianName: r.guardian_name,
    guardianPhone: r.guardian_phone,
    professionalName: r.professional_name,
    escolaPublica: !!r.escola_publica,
    trabalhoNaRoca: !!r.trabalho_na_roca,
    consecutiveUnjustifiedAbsences: Number(r.consecutive_unjustified_absences ?? 0),
    prontuario: r.prontuario ?? null,
    paused: !!r.paused,
    pausedAt: r.paused_at ?? null,
    pausedReason: r.paused_reason ?? null,
    pausedReturnDate: r.paused_return_date ?? null,
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

export type LongAttendancePatient = {
  id: number;
  name: string;
  status: string;
  professionalId: number | null;
  professionalName: string | null;
  professionalSpecialty: string | null;
  firstAttendanceDate: string;
  monthsInAttendance: number;
  yearsLabel: string;
};

type LongAttendanceRow = {
  id: number;
  name: string;
  status: string;
  professional_id: number | null;
  professional_name: string | null;
  professional_specialty: string | null;
  first_attendance_date: string;
  months_in_attendance: number;
  years_label: string;
};

export async function listLongAttendancePatients(
  minMonths: number = 12
): Promise<LongAttendancePatient[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_long_attendance_patients", {
    p_slug: slug,
    p_password: password,
    p_min_months: minMonths,
  });
  if (error) throw error;
  const rows = (data ?? []) as LongAttendanceRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    professionalId: r.professional_id,
    professionalName: r.professional_name,
    professionalSpecialty: r.professional_specialty,
    firstAttendanceDate: r.first_attendance_date,
    monthsInAttendance: r.months_in_attendance,
    yearsLabel: r.years_label,
  }));
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
  frequency?: AppointmentFrequency;
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
  /** Faltas CONSECUTIVAS por (paciente, profissional). */
  consecutiveUnjustifiedAbsences: number;
  /** Total de faltas (qualquer tipo) por (paciente, profissional). */
  absenceCountByProf?: number;
  /** Nome do profissional do appointment (para compor o texto de aviso). */
  professionalName?: string;
  /** Especialidade do profissional do appointment. */
  professionalSpecialty?: string;
  /** Contador global do paciente (mantido por compatibilidade). */
  patientAbsenceCountTotal?: number;
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
    p_frequency: payload.frequency ?? null,
  });
  if (error) throw error;
  return data as UpdateAppointmentResult;
}

/**
 * Remaneja (move DEFINITIVAMENTE) as ocorrências FUTURAS de uma recorrência para o
 * novo dia-da-semana + horário, a partir da ocorrência clicada (exclusive).
 *
 * A ocorrência clicada em si é atualizada à parte (status 'remanejado'); aqui só
 * deslocamos as ocorrências seguintes. Diferença para "remarcar" (pontual): remarcar
 * NÃO chama esta função, então só muda 1 ocorrência.
 *
 * Mantém ocorrências passadas e exceções pontuais (remarcado/desmarcado/cancelado/
 * terminais). Só altera date/time (sem status) → NÃO dispara a trava JA_REMANEJADO_HOJE.
 */
export async function remanejarRecurrenceForward(params: {
  recurrenceGroupId: string;
  patientId: number;
  fromDate: string;
  newDate: string;
  newTime: string;
  excludeId: number;
}): Promise<{ moved: Array<{ id: number; date: string; time: string }> }> {
  const INACTIVE = ["alta", "desistência", "desistencia", "óbito", "obito", "desmarcado", "cancelado", "remanejado", "remarcado"];
  const dow = (d: string) => new Date(d + "T12:00:00").getDay();
  const delta = dow(params.newDate) - dow(params.fromDate);
  const all = await listAppointments({ patientId: params.patientId });
  const future = all.filter(a =>
    a.id !== params.excludeId &&
    a.recurrenceGroupId === params.recurrenceGroupId &&
    a.date > params.fromDate &&
    !INACTIVE.includes((a.status || "").toLowerCase())
  );
  const moved: Array<{ id: number; date: string; time: string }> = [];
  for (const a of future) {
    const d = new Date(a.date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    const nd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await updateAppointment(a.id, { date: nd, time: params.newTime });
    moved.push({ id: a.id, date: nd, time: params.newTime });
  }
  return { moved };
}

export async function updateRecurrenceFrequency(
  recurrenceGroupId: string,
  frequency: AppointmentFrequency
): Promise<{ ok: boolean; updatedCount: number; frequency: string }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("update_recurrence_frequency", {
    p_slug: slug,
    p_password: password,
    p_recurrence_group_id: recurrenceGroupId,
    p_frequency: frequency,
  });
  if (error) throw error;
  return data as { ok: boolean; updatedCount: number; frequency: string };
}

export async function materializeVirtualAppointment(payload: {
  patientId: number;
  professionalId: number;
  date: string;
  time: string;
  recurrenceGroupId?: string | null;
  frequency?: AppointmentFrequency;
  notes?: string | null;
}): Promise<{ id: number; alreadyExisted: boolean }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("materialize_virtual_appointment", {
    p_slug: slug,
    p_password: password,
    p_patient_id: payload.patientId,
    p_professional_id: payload.professionalId,
    p_date: payload.date,
    p_time: payload.time,
    p_recurrence_group_id: payload.recurrenceGroupId ?? null,
    p_frequency: payload.frequency ?? "semanal",
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as { id: number; alreadyExisted: boolean };
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

// ── Faltas por especialidade (Recepção) ──────────────────────────────────────

export type AbsenceBySpecialty = {
  patient_id: number;
  specialty: string;
  absence_count: number;
};

export async function countAbsencesBySpecialty(): Promise<AbsenceBySpecialty[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("count_absences_by_specialty", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return (data ?? []) as AbsenceBySpecialty[];
}

export async function deleteRecurrenceForward(
  recurrenceGroupId: string,
  fromDate: string,
  patientId?: number,
): Promise<{ ok: true; deletedCount: number }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("delete_recurrence_forward", {
    p_slug: slug,
    p_password: password,
    p_recurrence_group_id: recurrenceGroupId,
    p_from_date: fromDate,
    p_patient_id: patientId ?? null,
  });
  if (error) throw error;
  return data as { ok: true; deletedCount: number };
}

/**
 * Desfaz um "Atendimento Multi" removendo APENAS o profissional convidado e
 * mantendo o atendimento do profissional que fica (o do card clicado) intacto.
 *
 * Por que não usar delete_recurrence_forward: aquela função, por design, também
 * apaga o parceiro do Multi (derrubaria os dois). Aqui usamos delete_appointment
 * (linha a linha, sem cascata) só nas ocorrências do convidado, e limpamos a
 * etiqueta "Atendimento Multi com ..." das ocorrências do profissional que fica.
 *
 * Preserva o histórico: só remove ocorrências de hoje (ou da data clicada, se
 * for passada) em diante.
 */
export async function undoMultiAppointment(params: {
  patientId: number;
  date: string;
  time: string;
  keepProfessionalId: number;
}): Promise<{ removedNames: string[]; deletedCount: number }> {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const cutoff = params.date < todayStr ? params.date : todayStr;
  const all = await listAppointments({ patientId: params.patientId });

  const MULTI = "Atendimento Multi com ";
  // Parceiro(s) no MESMO horário da ocorrência clicada (mesma data+hora, outro
  // profissional, com a etiqueta de Multi).
  const slotPartners = all.filter(a =>
    a.date === params.date &&
    a.time === params.time &&
    a.professionalId !== params.keepProfessionalId &&
    (a.notes || "").startsWith(MULTI)
  );
  const partnerGroups = new Set(
    slotPartners.map(a => a.recurrenceGroupId).filter((g): g is string => !!g && g.trim() !== "")
  );
  const partnerProfIds = new Set(slotPartners.map(a => a.professionalId));
  const removedNames = new Set<string>();
  slotPartners.forEach(a => { if (a.professionalName) removedNames.add(a.professionalName); });

  // Todas as ocorrências FUTURAS do convidado (pela recorrência dele, ou, sem
  // recorrência, pelo mesmo horário/profissional com etiqueta Multi).
  const toDelete = all.filter(a => {
    if (a.id <= 0) return false;          // ignora projeções virtuais
    if (a.date < cutoff) return false;    // preserva histórico
    const byGroup = !!a.recurrenceGroupId && partnerGroups.has(a.recurrenceGroupId);
    const bySlot = partnerProfIds.has(a.professionalId) && a.time === params.time && (a.notes || "").startsWith(MULTI);
    return byGroup || bySlot;
  });
  await Promise.all(toDelete.map(a => deleteAppointment(a.id)));

  // Remove a etiqueta "Multi" das ocorrências futuras do profissional que fica.
  const keepToClear = all.filter(a =>
    a.id > 0 &&
    a.date >= cutoff &&
    a.professionalId === params.keepProfessionalId &&
    a.time === params.time &&
    (a.notes || "").startsWith(MULTI)
  );
  await Promise.all(keepToClear.map(a => updateAppointment(a.id, { notes: "" })));

  return { removedNames: [...removedNames], deletedCount: toDelete.length };
}

// ── Notificacoes recepcao (Fase 4C) ─────────────────────────────────────────

export type NotificacaoRecepcao = {
  id: number;
  companyId: number;
  appointmentId: number | null;
  patientName: string;
  patientPhone: string | null;
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
  patient_phone: string | null;
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
    patientPhone: r.patient_phone ?? null,
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
  patientPhone?: string | null;
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
    p_patient_phone: payload.patientPhone ?? null,
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

/**
 * Marca como lidos os avisos pendentes (não-lidos) vinculados a um agendamento.
 * Usado quando o agendamento é excluído/remanejado/desmarcado, para a Central
 * de Avisos refletir só o estado atual. Best-effort — não lança.
 */
export async function markNotificacoesLidoByAppointment(appointmentId: number): Promise<void> {
  if (!appointmentId || appointmentId <= 0) return;
  try {
    const all = await listNotificacoes();
    const pendentes = all.filter((n) => !n.lido && n.appointmentId === appointmentId);
    await Promise.all(pendentes.map((n) => markNotificacaoLido(n.id)));
  } catch {
    /* silencioso — limpeza não deve bloquear a ação principal */
  }
}

// ── AI Brain API calls ─────────────────────────────────────────────────────

export type AIAnalysis = {
  success: boolean;
  analysis: Record<string, unknown>;
  [key: string]: unknown;
};

async function fetchAI(endpoint: string): Promise<AIAnalysis> {
  const session = readSession();
  if (!session || session.type !== "company" || !session.companyId) {
    throw new Error("Sessão de empresa expirada. Faça login novamente.");
  }
  const resp = await fetch(`/api/ai/${endpoint}`, {
    headers: {
      "x-company-id": String(session.companyId),
      "x-company-auth": session.adminToken ?? "",
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error ?? `Erro ${resp.status}`);
  }
  return resp.json() as Promise<AIAnalysis>;
}

export function getAIFullAnalysis(): Promise<AIAnalysis> {
  return fetchAI("full-analysis");
}

export function getAIWaitingListOptimization(): Promise<AIAnalysis> {
  return fetchAI("waiting-list-optimization");
}

export function getAIChurnAlerts(): Promise<AIAnalysis> {
  return fetchAI("churn-alerts");
}

export function getAIAgeLimitReport(): Promise<AIAnalysis> {
  return fetchAI("age-limit-report");
}

export function getAISystemHealth(): Promise<AIAnalysis> {
  return fetchAI("system-health");
}

// ── Pausa Temporária (Agenda) ────────────────────────────────────────────────────────

export async function setAppointmentPaused(
  id: number,
  paused: boolean,
  reason?: string | null,
  returnDate?: string | null
): Promise<{ id: number; paused: boolean; pausedAt: string | null; pausedReason: string | null; pausedReturnDate: string | null }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("set_appointment_paused", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_paused: paused,
    p_reason: reason ?? null,
    p_return_date: returnDate ?? null,
  });
  if (error) throw error;
  return data as { id: number; paused: boolean; pausedAt: string | null; pausedReason: string | null; pausedReturnDate: string | null };
}

export type PausedOverviewItem = {
  source: 'fila' | 'agenda';
  id: number;
  patientId: number;
  patientName: string;
  specialty: string;
  professionalName: string;
  pausedReason: string;
  pausedAt: string | null;
  pausedReturnDate: string | null;
  returnOverdue: boolean;
};

export async function listPausedOverview(): Promise<{ fila: PausedOverviewItem[]; agenda: PausedOverviewItem[] }> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_paused_overview", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  const result = data as { fila: PausedOverviewItem[]; agenda: PausedOverviewItem[] };
  return result;
}

// ── Salas (Gestão Inteligente de Salas) ─────────────────────────────────────

export type Sala = {
  id: number;
  companyId: number;
  numero: string;
  professionalId: number | null;
  diasSemana: number[] | null;
  horaInicio: string | null;
  horaFim: string | null;
  createdAt: string;
  updatedAt: string;
};

type SalaRow = {
  id: number | string;
  company_id: number | string;
  numero: string;
  professional_id: number | string | null;
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  created_at: string;
  updated_at: string;
};

/** "07:00:00" → "07:00" (aceita null). */
function shortTime(t: string | null): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

function mapSala(r: SalaRow): Sala {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    numero: r.numero,
    professionalId: r.professional_id == null ? null : Number(r.professional_id),
    diasSemana: r.dias_semana == null ? null : r.dias_semana.map(Number),
    horaInicio: shortTime(r.hora_inicio),
    horaFim: shortTime(r.hora_fim),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listSalas(): Promise<Sala[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_salas", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as SalaRow[]).map(mapSala);
}

export async function upsertSala(
  id: number | null,
  numero: string,
  professionalId: number | null,
  diasSemana: number[] | null = null,
  horaInicio: string | null = null,
  horaFim: string | null = null
): Promise<Sala> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("upsert_sala", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_numero: numero,
    p_professional_id: professionalId,
    p_dias: diasSemana && diasSemana.length > 0 ? diasSemana : null,
    p_hora_inicio: horaInicio || null,
    p_hora_fim: horaFim || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar sala.");
  return mapSala(row as SalaRow);
}

export async function deleteSala(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_sala", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

export type SalaStatus = "Vermelho" | "Amarelo" | "Verde";

export type StatusSala = {
  salaId: number;
  numeroDaSala: string;
  statusAtual: SalaStatus;
  detalheStatus: string;
  profissionais: string | null;
  totalProfissionais: number;
  profissionalEmAtendimento: string | null;
  pacienteAtual: string | null;
  horarioAtual: string | null;
  horarioProximoAgendamento: string | null;
};

type StatusSalaRow = {
  sala_id: number | string;
  numero_da_sala: string;
  status_atual: string;
  detalhe_status: string;
  profissionais: string | null;
  total_profissionais: number | string | null;
  profissional_em_atendimento: string | null;
  paciente_atual: string | null;
  horario_atual: string | null;
  horario_proximo_agendamento: string | null;
};

export async function getStatusSalas(): Promise<StatusSala[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("get_status_salas", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as StatusSalaRow[]).map((r) => ({
    salaId: Number(r.sala_id),
    numeroDaSala: r.numero_da_sala,
    statusAtual: (r.status_atual as SalaStatus) ?? "Verde",
    detalheStatus: r.detalhe_status,
    profissionais: r.profissionais,
    totalProfissionais: r.total_profissionais == null ? 0 : Number(r.total_profissionais),
    profissionalEmAtendimento: r.profissional_em_atendimento,
    pacienteAtual: r.paciente_atual,
    horarioAtual: r.horario_atual,
    horarioProximoAgendamento: r.horario_proximo_agendamento,
  }));
}

// ── Feriados + Ausências de profissional ───────────────────────────────────────

export type Feriado = {
  id: number;
  companyId: number;
  data: string;
  descricao: string;
};

type FeriadoRow = {
  id: number | string;
  company_id: number | string;
  data: string;
  descricao: string | null;
  created_at: string;
};

function mapFeriado(r: FeriadoRow): Feriado {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    data: r.data,
    descricao: r.descricao ?? "",
  };
}

export async function listFeriados(): Promise<Feriado[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_feriados", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as FeriadoRow[]).map(mapFeriado);
}

export async function upsertFeriado(data: string, descricao: string): Promise<Feriado> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data: row, error } = await supabase.rpc("upsert_feriado", {
    p_slug: slug,
    p_password: password,
    p_data: data,
    p_descricao: descricao,
  });
  if (error) throw error;
  const r = Array.isArray(row) ? row[0] : row;
  if (!r) throw new Error("Falha ao salvar feriado.");
  return mapFeriado(r as FeriadoRow);
}

export async function deleteFeriado(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_feriado", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

export type Ausencia = {
  id: number;
  companyId: number;
  professionalId: number;
  dataInicio: string;
  dataFim: string;
  motivo: string;
};

type AusenciaRow = {
  id: number | string;
  company_id: number | string;
  professional_id: number | string;
  data_inicio: string;
  data_fim: string;
  motivo: string | null;
  created_at: string;
};

function mapAusencia(r: AusenciaRow): Ausencia {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    professionalId: Number(r.professional_id),
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    motivo: r.motivo ?? "",
  };
}

export async function listAusencias(): Promise<Ausencia[]> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("list_ausencias", {
    p_slug: slug,
    p_password: password,
  });
  if (error) throw error;
  return ((data ?? []) as AusenciaRow[]).map(mapAusencia);
}

export async function addAusencia(
  professionalId: number,
  dataInicio: string,
  dataFim: string,
  motivo: string
): Promise<Ausencia> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { data, error } = await supabase.rpc("add_ausencia", {
    p_slug: slug,
    p_password: password,
    p_professional_id: professionalId,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_motivo: motivo,
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error("Falha ao salvar ausência.");
  return mapAusencia(r as AusenciaRow);
}

export async function deleteAusencia(id: number): Promise<void> {
  const supabase = requireSupabase();
  const { slug, password } = requireCompanyCredentials();
  const { error } = await supabase.rpc("delete_ausencia", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) throw error;
}

import { requireSupabase } from "./supabase";

/**
 * Triagem RPC wrappers. The migration 0003 exposes four SECURITY DEFINER
 * RPCs that take the company slug + admin password (verified with bcrypt)
 * and do the work server-side. All payloads travel as JSON.
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

export type TriagemRow = {
  id: number;
  companyId: number;
  nome: string;
  dataNascimento: string | null;
  idade: string | null;
  responsavel: string | null;
  telefone: string | null;
  endereco: string | null;
  naturalidade: string | null;
  rg: string | null;
  cpf: string | null;
  sus: string | null;
  nomeMae: string | null;
  escolaridadeMae: string | null;
  profissaoMae: string | null;
  nomePai: string | null;
  escolaridadePai: string | null;
  profissaoPai: string | null;
  numIrmaos: string | null;
  tipoImovel: string | null;
  bolsaFamilia: boolean | null;
  bpc: boolean | null;
  pensao: boolean | null;
  auxilioDoenca: boolean | null;
  outrosAuxilios: string | null;
  rendaFamiliar: string | null;
  diagnostico: string | null;
  cid: string | null;
  cid11: string | null;
  medico: string | null;
  dataUltimaCons: string | null;
  cadeiraDeRodas: boolean | null;
  ortesesProteses: boolean | null;
  aparelhoAuditivo: boolean | null;
  medicacaoContinua: string | null;
  alergias: string | null;
  problemasSaude: string | null;
  tipoEscola: string | null;
  trabalhoPais: string | null;
  outroAtendimento: boolean | null;
  localAtendimento: string | null;
  tipoRegistro: string | null;
  profissional: string | null;
  especialidade: string | null;
  data: string | null;
  resultado: string | null;
  respostas: string | null;
  createdAt: string;
};

type TriagemRowDb = {
  id: number | string;
  company_id: number | string;
  nome: string;
  data_nascimento: string | null;
  idade: string | null;
  responsavel: string | null;
  telefone: string | null;
  endereco: string | null;
  naturalidade: string | null;
  rg: string | null;
  cpf: string | null;
  sus: string | null;
  nome_mae: string | null;
  escolaridade_mae: string | null;
  profissao_mae: string | null;
  nome_pai: string | null;
  escolaridade_pai: string | null;
  profissao_pai: string | null;
  num_irmaos: string | null;
  tipo_imovel: string | null;
  bolsa_familia: boolean | null;
  bpc: boolean | null;
  pensao: boolean | null;
  auxilio_doenca: boolean | null;
  outros_auxilios: string | null;
  renda_familiar: string | null;
  diagnostico: string | null;
  cid: string | null;
  cid_11: string | null;
  medico: string | null;
  data_ultima_cons: string | null;
  cadeira_de_rodas: boolean | null;
  orteses_proteses: boolean | null;
  aparelho_auditivo: boolean | null;
  medicacao_continua: string | null;
  alergias: string | null;
  problemas_saude: string | null;
  tipo_escola: string | null;
  trabalho_pais: string | null;
  outro_atendimento: boolean | null;
  local_atendimento: string | null;
  tipo_registro: string | null;
  profissional: string | null;
  especialidade: string | null;
  data: string | null;
  resultado: string | null;
  respostas: string | null;
  created_at: string;
};

function mapRow(r: TriagemRowDb): TriagemRow {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    nome: r.nome,
    dataNascimento: r.data_nascimento,
    idade: r.idade,
    responsavel: r.responsavel,
    telefone: r.telefone,
    endereco: r.endereco,
    naturalidade: r.naturalidade,
    rg: r.rg,
    cpf: r.cpf,
    sus: r.sus,
    nomeMae: r.nome_mae,
    escolaridadeMae: r.escolaridade_mae,
    profissaoMae: r.profissao_mae,
    nomePai: r.nome_pai,
    escolaridadePai: r.escolaridade_pai,
    profissaoPai: r.profissao_pai,
    numIrmaos: r.num_irmaos,
    tipoImovel: r.tipo_imovel,
    bolsaFamilia: r.bolsa_familia,
    bpc: r.bpc,
    pensao: r.pensao,
    auxilioDoenca: r.auxilio_doenca,
    outrosAuxilios: r.outros_auxilios,
    rendaFamiliar: r.renda_familiar,
    diagnostico: r.diagnostico,
    cid: r.cid,
    cid11: r.cid_11,
    medico: r.medico,
    dataUltimaCons: r.data_ultima_cons,
    cadeiraDeRodas: r.cadeira_de_rodas,
    ortesesProteses: r.orteses_proteses,
    aparelhoAuditivo: r.aparelho_auditivo,
    medicacaoContinua: r.medicacao_continua,
    alergias: r.alergias,
    problemasSaude: r.problemas_saude,
    tipoEscola: r.tipo_escola,
    trabalhoPais: r.trabalho_pais,
    outroAtendimento: r.outro_atendimento,
    localAtendimento: r.local_atendimento,
    tipoRegistro: r.tipo_registro,
    profissional: r.profissional,
    especialidade: r.especialidade,
    data: r.data,
    resultado: r.resultado,
    respostas: r.respostas,
    createdAt: r.created_at,
  };
}

export type TriagemInput = {
  nome: string;
  dataNascimento?: string | null;
  idade?: string | null;
  responsavel?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  naturalidade?: string | null;
  rg?: string | null;
  cpf?: string | null;
  sus?: string | null;
  nomeMae?: string | null;
  escolaridadeMae?: string | null;
  profissaoMae?: string | null;
  nomePai?: string | null;
  escolaridadePai?: string | null;
  profissaoPai?: string | null;
  numIrmaos?: string | null;
  tipoImovel?: string | null;
  bolsaFamilia?: boolean | null;
  bpc?: boolean | null;
  pensao?: boolean | null;
  auxilioDoenca?: boolean | null;
  outrosAuxilios?: string | null;
  rendaFamiliar?: string | null;
  diagnostico?: string | null;
  cid?: string | null;
  cid11?: string | null;
  medico?: string | null;
  dataUltimaCons?: string | null;
  cadeiraDeRodas?: boolean | null;
  ortesesProteses?: boolean | null;
  aparelhoAuditivo?: boolean | null;
  medicacaoContinua?: string | null;
  alergias?: string | null;
  problemasSaude?: string | null;
  tipoEscola?: string | null;
  trabalhoPais?: string | null;
  outroAtendimento?: boolean | null;
  localAtendimento?: string | null;
  tipoRegistro?: string | null;
  profissional?: string | null;
  especialidade?: string | null;
  data?: string | null;
  resultado?: string | null;
  respostas?: string | null;
};

function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err ?? "Erro desconhecido");
  throw new Error(msg);
}

export async function listTriagens(): Promise<TriagemRow[]> {
  const { slug, password } = requireCompanyCredentials();
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("list_triagens", {
    p_slug: slug,
    p_password: password,
  });
  if (error) handleError(error);
  const rows = (data ?? []) as TriagemRowDb[];
  return rows.map(mapRow);
}

export async function getTriagem(id: number): Promise<TriagemRow | null> {
  const { slug, password } = requireCompanyCredentials();
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("get_triagem", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) handleError(error);
  if (!data) return null;
  // get_triagem returns a single composite row, which PostgREST serializes
  // as an object (or a single-element array depending on version).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || (row as TriagemRowDb).id == null) return null;
  return mapRow(row as TriagemRowDb);
}

export async function upsertTriagem(
  id: number | null,
  payload: TriagemInput
): Promise<TriagemRow> {
  const { slug, password } = requireCompanyCredentials();
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("upsert_triagem", {
    p_slug: slug,
    p_password: password,
    p_id: id,
    p_payload: payload,
  });
  if (error) handleError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Falha ao salvar triagem.");
  return mapRow(row as TriagemRowDb);
}

export async function deleteTriagem(id: number): Promise<void> {
  const { slug, password } = requireCompanyCredentials();
  const sb = requireSupabase();
  const { error } = await sb.rpc("delete_triagem", {
    p_slug: slug,
    p_password: password,
    p_id: id,
  });
  if (error) handleError(error);
}

export type AutolinkResult = {
  linkedOnly: boolean;
  addedToQueue: boolean;
  reason?: string;
  patientId?: number;
  patientName?: string;
  patientCreated?: boolean;
  triagemScore?: number;
  priority?: string;
  addedSpecialties?: string[];
  existingSpecialties?: string[];
  skippedSpecialties?: string[];
};

/**
 * Auto-links a saved triagem to a patient and adds it to the waiting list
 * (one row per scored specialty). Best-effort: any failure is swallowed so
 * it never blocks the save flow.
 */
export async function autolinkTriagem(triagemId: number): Promise<AutolinkResult | null> {
  try {
    const { slug, password } = requireCompanyCredentials();
    const sb = requireSupabase();
    const { data, error } = await sb.rpc("autolink_triagem", {
      p_slug: slug,
      p_password: password,
      p_triagem_id: triagemId,
    });
    if (error) return null;
    return (data as AutolinkResult) ?? null;
  } catch {
    return null;
  }
}

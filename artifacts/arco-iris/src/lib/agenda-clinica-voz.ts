import { format } from "date-fns";
import { acharData, acharHora } from "@/lib/agenda-exec-voz";

/** Ações do menu do atendimento que podem ser chamadas pela voz. */
export type AcaoVoz =
  | "em_atendimento" | "avaliacao_entrada" | "falta_justificada" | "falta_nao_justificada"
  | "desmarcar" | "remanejar" | "remarcar" | "semanal" | "quinzenal" | "mensal"
  | "pausar" | "busca_ativa" | "alta" | "desistencia" | "obito"
  | "encaminhamento" | "multi" | "transporte" | "excluir"
  | "agendar" | "consultar";

export const NOME_ACAO: Record<AcaoVoz, string> = {
  em_atendimento: "Em Atendimento", avaliacao_entrada: "Avaliação de Entrada",
  falta_justificada: "Falta Justificada", falta_nao_justificada: "Falta Não Justificada",
  desmarcar: "Desmarcar", remanejar: "Remanejar", remarcar: "Remarcar",
  semanal: "Mudar para Semanal", quinzenal: "Mudar para Quinzenal", mensal: "Mudar para Mensal",
  pausar: "Pausar atendimento", busca_ativa: "Encaminhar p/ Busca Ativa",
  alta: "Dar Alta", desistencia: "Desistência", obito: "Óbito",
  encaminhamento: "Encaminhamento Interno", multi: "Atendimento Multi", transporte: "Transporte (Motorista)",
  excluir: "Excluir Agendamento", agendar: "Agendar paciente", consultar: "Ver atendimentos",
};

// Ordem importa: as frases mais específicas primeiro.
const REGRAS: [AcaoVoz, RegExp][] = [
  ["falta_nao_justificada", /\bfalta\s+(?:nao|n)\s+justificad|\bfaltou sem justific|\bfalta sem justific/],
  ["falta_justificada", /\bfalta\s+justificad|\bfaltou com justific|\bjustificar (?:a )?falta|\batestado\b/],
  ["avaliacao_entrada", /\bavaliacao de entrada|\bavaliacao inicial/],
  ["em_atendimento", /\bem atendimento\b|\bpresente\b|\bpresenca\b|\bchegou\b|\batendid[oa]\b/],
  ["busca_ativa", /\bbusca ativa\b/],
  ["encaminhamento", /\bencaminhamento interno|\bencaminhar\b/],
  ["multi", /\b(?:atendimento )?multi\b/],
  ["transporte", /\btransporte\b|\bmotorista\b/],
  ["pausar", /\bpausar\b|\bpausa\b|\bcongelar\b/],
  ["desistencia", /\bdesist/],
  ["obito", /\bobito\b|\bfaleceu\b|\bfalecimento\b/],
  ["alta", /\b(?:dar |de )?alta\b/],
  ["excluir", /\bexcluir\b|\bapagar\b|\bdeletar\b/],
  ["remanejar", /\bremanej|\btrocar (?:de vez|definitiv)|\bmudar (?:de vez|definitiv)/],
  ["remarcar", /\bremarc|\btrocar\b|\bmudar\b|\bpassar\b/],
  ["desmarcar", /\bdesmarc|\bcancelar\b|\bcancela\b/],
  ["quinzenal", /\bquinzenal\b|\ba cada (?:14|quatorze|catorze) dias/],
  ["mensal", /\bmensal\b|\buma vez por mes/],
  ["semanal", /\bsemanal\b|\btoda semana\b/],
  ["agendar", /\bagendar\b|\bagenda\b|\bmarcar\b|\bmarca\b|\bencaixar\b/],
  ["consultar", /\bquais\b|\bquem\b|\bquantos\b|\bo que (?:eu )?tenho\b|\bmeus pacientes\b|\bminha agenda\b/],
];

export const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type PacienteVoz = { patientId: number; patientName: string; prontuario?: string | null };
export type ComandoClinico = {
  acao: AcaoVoz | null;
  paciente: PacienteVoz | null;
  /** Data/hora citadas. Em remanejar/remarcar/agendar, a última data/hora é o destino. */
  data: string | null;
  hora: string | null;
  frase: string;
};

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os"]);

/** Paciente cujo nome (ou prontuário) mais combina com a frase. */
export function acharPaciente(t: string, pacientes: PacienteVoz[]): PacienteVoz | null {
  const pront = t.match(/\bprontuario\s+(\d+)/);
  if (pront) return pacientes.find((p) => String(p.prontuario ?? "") === pront[1]) ?? null;
  const palavras = new Set(t.split(/\s+/));
  let melhor: PacienteVoz | null = null, nota = 0;
  for (const p of pacientes) {
    const partes = semAcento(p.patientName).split(/\s+/).filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w));
    let n = 0;
    partes.forEach((w, i) => { if (palavras.has(w)) n += i === 0 ? 3 : 1; });
    if (n > nota) { nota = n; melhor = p; }
  }
  return nota >= 3 ? melhor : null;
}

export function interpretarComandoClinico(frase: string, pacientes: PacienteVoz[], hoje = new Date()): ComandoClinico {
  const t = semAcento(frase).replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  const acao = REGRAS.find(([, re]) => re.test(t))?.[0] ?? null;
  const d = acharData(t, hoje);
  return {
    acao,
    paciente: acharPaciente(t, pacientes),
    data: d ? format(d, "yyyy-MM-dd") : null,
    hora: acharHora(t),
    frase,
  };
}

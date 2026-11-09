import { useCallback, useEffect, useState } from "react";
import {
  listBuscaAtivaCasos,
  setWaitingListPaused,
  resumePatientAgendaPause,
  type BuscaAtivaCaso,
  type BuscaAtivaStatus,
  type PausedOverviewItem,
} from "@/lib/arco-rpc";
import { getCurrentScope, getProfessionalSession } from "@/lib/portal-session";

export const BUSCA_STATUS_LABEL: Record<BuscaAtivaStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  nao_resolvido: "Não resolvido",
  finalizado: "Finalizada",
};

export const buscaStatusLabel = (s?: string | null) =>
  BUSCA_STATUS_LABEL[(s || "pendente") as BuscaAtivaStatus] ?? s ?? "Pendente";

export const BUSCA_MOTIVOS = [
  "Suspeita de violação de direitos",
  "Negligência / situação de risco",
  "Faltas seguidas sem justificativa",
  "Sem contato com a família",
  "Vulnerabilidade social",
  "Outro",
] as const;

export const casoAberto = (c: BuscaAtivaCaso) => c.status !== "finalizado";

export async function listBuscaAtivaAtual(): Promise<BuscaAtivaCaso[]> {
  return (await listBuscaAtivaCasos()).filter(casoAberto);
}

export function groupBuscaByPatient(items: BuscaAtivaCaso[]): Map<number, BuscaAtivaCaso[]> {
  const m = new Map<number, BuscaAtivaCaso[]>();
  for (const i of items) m.set(i.patientId, [...(m.get(i.patientId) ?? []), i]);
  return m;
}

export function quemEncaminha(): string {
  const prof = getProfessionalSession();
  if (prof) return `${prof.professionalName}${prof.specialty ? ` (${prof.specialty})` : ""}`;
  return getCurrentScope() === "reception" ? "Recepção" : "Administração";
}

// Pausa (não é Busca Ativa): fila volta a disputar vaga; agenda volta para "Agendado".
export async function retornarDaPausa(item: PausedOverviewItem): Promise<void> {
  if (item.source === "fila") {
    await setWaitingListPaused(item.id, false);
    return;
  }
  if (!item.professionalId) throw new Error("Retorne pela agenda do profissional.");
  await resumePatientAgendaPause(item.patientId, item.professionalId);
}

export function useBuscaAtivaPaciente(patientId: number) {
  const [current, setCurrent] = useState<BuscaAtivaCaso[]>([]);
  const [history, setHistory] = useState<BuscaAtivaCaso[]>([]);
  const reload = useCallback(() => {
    if (!patientId) return;
    listBuscaAtivaCasos(patientId)
      .then(l => { setCurrent(l.filter(casoAberto)); setHistory(l.filter(c => !casoAberto(c)).reverse()); })
      .catch(() => { setCurrent([]); setHistory([]); });
  }, [patientId]);
  useEffect(() => { reload(); }, [reload]);
  return { current, history, reload };
}

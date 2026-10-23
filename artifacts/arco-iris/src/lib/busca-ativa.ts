import { useCallback, useEffect, useState } from "react";
import {
  listPausedOverview,
  listBuscaAtivaHistorico,
  setWaitingListPaused,
  resumePatientAgendaPause,
  type BuscaAtivaHistoricoItem,
  type BuscaAtivaStatus,
  type PausedOverviewItem,
} from "@/lib/arco-rpc";

export const BUSCA_STATUS_LABEL: Record<BuscaAtivaStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  nao_resolvido: "Não resolvido",
};

export const buscaStatusLabel = (s?: string | null) =>
  BUSCA_STATUS_LABEL[(s || "pendente") as BuscaAtivaStatus] ?? s ?? "Pendente";

export async function listBuscaAtivaAtual(): Promise<PausedOverviewItem[]> {
  const r = await listPausedOverview();
  return [...r.fila, ...r.agenda];
}

export function groupBuscaByPatient(items: PausedOverviewItem[]): Map<number, PausedOverviewItem[]> {
  const m = new Map<number, PausedOverviewItem[]>();
  for (const i of items) m.set(i.patientId, [...(m.get(i.patientId) ?? []), i]);
  return m;
}

// Fila: volta a disputar vaga na Fila de Espera. Agenda: horários voltam para "Agendado".
export async function retornarDaBuscaAtiva(item: PausedOverviewItem): Promise<void> {
  if (item.source === "fila") {
    await setWaitingListPaused(item.id, false);
    return;
  }
  if (!item.professionalId) throw new Error("Retorne pela agenda do profissional.");
  await resumePatientAgendaPause(item.patientId, item.professionalId);
}

export function useBuscaAtivaPaciente(patientId: number) {
  const [current, setCurrent] = useState<PausedOverviewItem[]>([]);
  const [history, setHistory] = useState<BuscaAtivaHistoricoItem[]>([]);
  const reload = useCallback(() => {
    if (!patientId) return;
    listBuscaAtivaAtual()
      .then(l => setCurrent(l.filter(i => i.patientId === patientId)))
      .catch(() => setCurrent([]));
    listBuscaAtivaHistorico(patientId).then(setHistory).catch(() => setHistory([]));
  }, [patientId]);
  useEffect(() => { reload(); }, [reload]);
  return { current, history, reload };
}

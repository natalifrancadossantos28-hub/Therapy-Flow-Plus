import { useState, useEffect, useCallback, useRef } from "react";
import {
  listAppointmentsToday,
  listProfessionals,
  updateAppointment,
  deletePatient,
  type Professional as ArcoProfessional,
  type AppointmentToday,
} from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { Card, Badge, Button, Select, MotionCard } from "@/components/ui-custom";
import { getStatusColor, getStatusLabel, cn } from "@/lib/utils";
import {
  Check, X, CalendarClock, AlertCircle, UserMinus,
  ChevronRight, Printer, ShieldCheck, CheckCircle,
  UserPlus, PhoneOff, FileCheck, Bell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import NotificationBell from "@/components/NotificationBell";

type Appointment = {
  id: number;
  patientId: number;
  professionalId: number;
  patientName: string;
  patientPhone: string | null;
  patientAbsenceCount: number;
  professionalName: string;
  professionalSpecialty: string;
  time: string;
  status: string;
  date: string;
  notes: string | null;
  rescheduledTo: string | null;
  createdAt: string;
  updatedAt: string;
};

type DischargeAlert = {
  appointment: Appointment;
  newAbsenceCount: number;
};

type VacancyAlert = {
  professionalId: number;
  patientName: string;
  priority: string;
};

type Atestado = {
  guardianPhone: string;
  patientName: string;
  timestamp: string;
  processado: boolean;
};

type AbonarDialog = {
  apt: Appointment;
  atestado: Atestado;
};

type ContatoDesconhecido = {
  telefone: string;
  label: string;
  identificadoEm: string;
  dispensado?: boolean;
};

function DischargeModal({
  alert, onDischarge, onClose, isLoading,
}: { alert: DischargeAlert; onDischarge: () => void; onClose: () => void; isLoading: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <MotionCard className="w-full max-w-md p-8 shadow-2xl" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="flex flex-col items-center text-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Alerta de Faltas</h3>
            <p className="text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{alert.appointment.patientName}</span> acumulou{" "}
              <span className="font-bold text-rose-600">{alert.newAbsenceCount} faltas</span>.
            </p>
          </div>
        </div>
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl mb-6 text-sm text-rose-800 font-medium">
          O protocolo da clínica indica que pacientes com 3 ou mais faltas devem ter alta avaliada. Deseja dar alta para este paciente e liberar a vaga?
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Manter Paciente</Button>
          <Button variant="destructive" className="flex-1 gap-2" onClick={onDischarge} disabled={isLoading}>
            <UserMinus className="w-4 h-4" />
            {isLoading ? "Dando Alta..." : "Dar Alta"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}

function VacancyModal({ alert, onClose }: { alert: VacancyAlert; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <MotionCard className="w-full max-w-md p-8 shadow-2xl border-2 border-emerald-200" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="flex flex-col items-center text-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl">🎉</div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Vaga Liberada!</h3>
            <p className="text-muted-foreground mt-1">Uma nova vaga foi aberta. A lista de espera sugere chamar:</p>
          </div>
        </div>
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl mb-6 flex items-center justify-between">
          <div>
            <p className="font-bold text-lg text-emerald-900">{alert.patientName}</p>
            <p className="text-sm text-emerald-700 mt-0.5">Prioridade: <span className="font-semibold capitalize">{alert.priority}</span></p>
          </div>
          <Link href="/waiting-list" onClick={onClose}>
            <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
              Ver Fila <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <Button variant="ghost" className="w-full" onClick={onClose}>Fechar</Button>
      </MotionCard>
    </div>
  );
}

function AppointmentRow({
  apt, index, atestado, onStatusChange, onDischargeRequest, onAbonarClick, isUpdating,
}: {
  apt: Appointment;
  index: number;
  atestado: Atestado | null;
  onStatusChange: (id: number, status: string) => Promise<number>;
  onDischargeRequest: (apt: Appointment, count: number) => void;
  onAbonarClick: (apt: Appointment, atestado: Atestado) => void;
  isUpdating: boolean;
}) {
  const handleAbsent = async () => {
    const newCount = await onStatusChange(apt.id, "falta_nao_justificada");
    if (newCount >= 3) onDischargeRequest(apt, newCount);
  };

  const handleJustificada = async () => {
    await onStatusChange(apt.id, "falta_justificada");
  };

  const hasWarning = apt.patientAbsenceCount >= 3;

  return (
    <MotionCard
      className={cn(
        "p-4 border transition-colors",
        hasWarning ? "border-rose-300 bg-rose-50/50" : "border-border/50 hover:border-primary/30"
      )}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
            {apt.time}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg text-foreground">{apt.patientName}</h3>
              {hasWarning && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-700">
                  <AlertCircle className="w-3 h-3" /> {apt.patientAbsenceCount} faltas
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {apt.professionalName} • {apt.professionalSpecialty}
            </p>
            {(() => {
              const s = apt.status?.toLowerCase() ?? "";
              if (s !== "desmarcado" && s !== "remanejado" && s !== "remarcado") return null;
              const label =
                s === "desmarcado" ? "Desmarcado pelo Profissional"
                : s === "remanejado" ? "Remanejado pelo Profissional"
                : "Remarcado pelo Profissional";
              const color =
                s === "desmarcado" ? "#f87171"
                : s === "remanejado" ? "#fb923c"
                : "#facc15";
              return (
                <p className="text-xs font-semibold mt-0.5" style={{ color }}>
                  {label}
                </p>
              );
            })()}
            {apt.patientPhone && (
              <p className="text-xs text-muted-foreground">{apt.patientPhone}</p>
            )}
            {/* ── Atestado badge neon amarelo ── */}
            {atestado && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{
                  background: "rgba(255,220,0,0.10)",
                  border: "1px solid rgba(255,220,0,0.40)",
                  color: "#ffd700",
                  boxShadow: "0 0 10px rgba(255,220,0,0.25), 0 0 20px rgba(255,220,0,0.08)",
                  textShadow: "0 0 6px rgba(255,220,0,0.7)",
                }}>
                ⚠️ Atestado recebido via WhatsApp
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={getStatusColor(apt.status)}>{getStatusLabel(apt.status)}</Badge>

          <div className="flex gap-2 ml-4 pl-4 border-l border-border">
            {/* ✓ Presente */}
            <button
              className="h-9 w-9 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors disabled:opacity-40"
              onClick={() => onStatusChange(apt.id, "presente")}
              disabled={isUpdating}
              title="Presente"
            >
              <Check className="w-4 h-4" />
            </button>

            {/* 📄 Falta Justificada */}
            <button
              className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
              style={{
                background: "rgba(6,182,212,0.06)",
                border: "1px solid rgba(6,182,212,0.35)",
                color: "#22d3ee",
              }}
              onClick={handleJustificada}
              disabled={isUpdating}
              title="Falta Justificada"
            >
              <FileCheck className="w-4 h-4" />
            </button>

            {/* ✗ Ausente */}
            <button
              className="h-9 w-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors disabled:opacity-40"
              onClick={handleAbsent}
              disabled={isUpdating}
              title="Ausente (sem justificativa)"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Abonar (só aparece quando há atestado) */}
            {atestado && (
              <button
                className="h-9 px-3 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={{
                  background: "rgba(255,220,0,0.10)",
                  border: "1px solid rgba(255,220,0,0.40)",
                  color: "#ffd700",
                  boxShadow: "0 0 8px rgba(255,220,0,0.20)",
                }}
                onClick={() => onAbonarClick(apt, atestado)}
                disabled={isUpdating}
                title="Abonar falta com atestado"
              >
                <ShieldCheck className="w-4 h-4 inline mr-1" />
                Abonar
              </button>
            )}
          </div>
        </div>
      </div>
    </MotionCard>
  );
}

export default function Reception() {
  const [profIdFilter, setProfIdFilter] = useState<string>("");
  const [professionals, setProfessionals] = useState<ArcoProfessional[]>([]);
  const [appointments, setAppointments] = useState<AppointmentToday[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const { toast } = useToast();

  const reloadAppointments = useCallback(() => {
    const opts = profIdFilter ? { professionalId: parseInt(profIdFilter) } : undefined;
    return listAppointmentsToday(opts)
      .then((data) => { setAppointments(data); setIsLoading(false); })
      .catch((e) => { console.error(e); setIsLoading(false); });
  }, [profIdFilter]);

  useEffect(() => {
    listProfessionals().then(setProfessionals).catch(console.error);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    reloadAppointments();
    const id = setInterval(reloadAppointments, 20_000);
    return () => clearInterval(id);
  }, [reloadAppointments]);

  // Fase 5D: Realtime — recebe INSERTs em notificacoes_recepcao (remanejar/desmarcar/falta)
  // e dispara um alerta visual pulsante + refetch da agenda.
  const [realtimeAlert, setRealtimeAlert] = useState<{
    patientName: string;
    professionalName: string;
    acao: string;
    at: number;
  } | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("recepcao-notificacoes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes_recepcao" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new ?? {};
          setRealtimeAlert({
            patientName:      String(row.patient_name      ?? "Paciente"),
            professionalName: String(row.professional_name ?? "—"),
            acao:             String(row.acao              ?? "Ação"),
            at:               Date.now(),
          });
          if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
          alertTimerRef.current = setTimeout(() => setRealtimeAlert(null), 12_000);
          void reloadAppointments();
        }
      )
      .subscribe();
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [reloadAppointments]);

  const [, navigate] = useLocation();
  const [dischargeAlert, setDischargeAlert] = useState<DischargeAlert | null>(null);
  const [vacancyAlert, setVacancyAlert] = useState<VacancyAlert | null>(null);
  const [vacancyProfId, setVacancyProfId] = useState<number>(0);
  const [atestados, setAtestados] = useState<Atestado[]>([]);
  const [desconhecidos, setDesconhecidos] = useState<ContatoDesconhecido[]>([]);
  const [abonarDialog, setAbonarDialog] = useState<AbonarDialog | null>(null);
  const [abonarSending, setAbonarSending] = useState(false);
  const [abonarDone, setAbonarDone] = useState(false);

  const checkVacancy = async () => {
    if (!vacancyProfId) return { data: null as null | { hasVacancy: boolean; nextWaitingPatient: { patientName: string; priority: string } | null } };
    try {
      const res = await fetch(`/api/professionals/${vacancyProfId}/vacancy-alert`);
      if (!res.ok) return { data: null };
      return { data: await res.json() };
    } catch { return { data: null }; }
  };

  // Poll atestados e contatos desconhecidos
  useEffect(() => {
    const fetchData = () => {
      fetch("/api/whatsapp/atestados")
        .then(r => r.json())
        .then(setAtestados)
        .catch(() => {});

      fetch("/api/whatsapp/contatos")
        .then(r => r.json())
        .then((lista: any[]) =>
          setDesconhecidos(lista.filter(c => !c.paciente && !c.dispensado))
        )
        .catch(() => {});
    };
    fetchData();
    const interval = setInterval(fetchData, 20_000);
    return () => clearInterval(interval);
  }, []);

  const dispensarContato = async (telefone: string) => {
    setDesconhecidos(prev => prev.filter(c => c.telefone !== telefone));
    await fetch("/api/whatsapp/dispensar-contato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefone }),
    }).catch(() => {});
  };

  // Match atestado by normalized phone
  const findAtestado = (apt: Appointment): Atestado | null => {
    if (!apt.patientPhone) return null;
    const aptPhone = apt.patientPhone.replace(/\D/g, "");
    return atestados.find(a => {
      const aPhone = (a.guardianPhone || "").replace(/\D/g, "");
      return aPhone && (aPhone === aptPhone || aPhone.endsWith(aptPhone) || aptPhone.endsWith(aPhone));
    }) ?? null;
  };

  const handlePrintPDF = () => {
    const todayStr = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const list = [...(appointments || [])].sort((a, b) => a.time.localeCompare(b.time));
    const morningSlots = ["08:00","08:50","09:40","10:30","11:20"];
    const afternoonSlots = ["13:10","14:00","14:50","15:40"];

    const aptMap: Record<string, typeof list[0][]> = {};
    for (const a of list) {
      if (!aptMap[a.time]) aptMap[a.time] = [];
      aptMap[a.time].push(a);
    }

    const w = window.open("", "_blank");
    if (!w) return;

    const rowHtml = (time: string, isLunch = false) => {
      if (isLunch) return `<tr><td colspan="4" style="background:#f8fafc;color:#94a3b8;font-style:italic;padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;">🍽 12:10 — Intervalo de Almoço</td></tr>`;
      const apts = aptMap[time] || [];
      if (apts.length === 0)
        return `<tr><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#059669;font-weight:700;">${time}</td><td colspan="3" style="padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#cbd5e1;font-style:italic;">Livre</td></tr>`;
      return apts.map(a => `<tr><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#059669;font-weight:700;">${time}</td><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;">${a.patientName}</td><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">${a.professionalName}</td><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">${a.status}</td></tr>`).join("");
    };

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agenda do Dia</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;}h1{font-size:20px;margin-bottom:4px;}
    .sub{color:#64748b;font-size:13px;margin-bottom:24px;text-transform:capitalize;}
    table{width:100%;border-collapse:collapse;font-size:13px;}
    th{text-align:left;padding:10px 14px;background:#f0fdf4;color:#059669;border-bottom:2px solid #059669;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
    .section{background:#fefce8;color:#92400e;font-size:11px;font-weight:700;padding:8px 14px;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em;}
    @media print{button{display:none}}</style></head><body>
    <div style="display:flex;gap:12px;margin-bottom:20px;align-items:center;">
      <button onclick="window.close()" style="padding:8px 20px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar ao Sistema</button>
      <button onclick="window.print()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">🖨 Imprimir</button>
    </div>
    <h1>Atendimentos Terapêuticos – Hoje</h1>
    <p class="sub">${todayStr}</p>
    <table>
      <thead><tr><th>Horário</th><th>Paciente</th><th>Profissional</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td colspan="4" class="section">Período da Manhã</td></tr>
        ${morningSlots.map(t => rowHtml(t)).join("")}
        ${rowHtml("12:10", true)}
        <tr><td colspan="4" class="section">Período da Tarde</td></tr>
        ${afternoonSlots.map(t => rowHtml(t)).join("")}
      </tbody>
    </table>
    <p style="margin-top:24px;font-size:11px;color:#94a3b8;">Encerramento: 16:30 | NFS – Gestão Terapêutica</p>
    </body></html>`);
    w.document.close();
  };

  const handleStatusChange = async (id: number, status: string): Promise<number> => {
    const apt = appointments?.find((a) => a.id === id);
    let newAbsenceCount = apt?.patientAbsenceCount ?? 0;
    const isAusente = status === "ausente" || status === "falta_nao_justificada";
    const wasAusente = apt?.status === "ausente" || apt?.status === "falta_nao_justificada";
    setIsMutating(true);
    try {
      await updateAppointment(id, { status });
      await reloadAppointments();

      if (isAusente && !wasAusente) {
        newAbsenceCount = (apt?.patientAbsenceCount ?? 0) + 1;
      } else if (!isAusente && wasAusente) {
        newAbsenceCount = Math.max(0, (apt?.patientAbsenceCount ?? 1) - 1);
      }

      const label = getStatusLabel(status);
      const toastTitle = status === "presente" || status === "atendimento"
        ? "✅ Presente"
        : status === "falta_justificada"
        ? "📄 Falta Justificada"
        : "🔴 Ausente";
      toast({ title: toastTitle, description: `${apt?.patientName} — ${label}.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
    } finally {
      setIsMutating(false);
    }
    return newAbsenceCount;
  };

  const handleDischargeRequest = (apt: Appointment, count: number) => {
    setVacancyProfId(apt.professionalId);
    setDischargeAlert({ appointment: apt, newAbsenceCount: count });
  };

  const handleConfirmDischarge = async () => {
    if (!dischargeAlert) return;
    const { appointment } = dischargeAlert;
    setIsMutating(true);
    try {
      await deletePatient(appointment.patientId);
      await reloadAppointments();
      setDischargeAlert(null);
      toast({ title: "Alta Realizada", description: `${appointment.patientName} recebeu alta.` });

      const { data: alertData } = await checkVacancy();
      if (alertData?.hasVacancy && alertData?.nextWaitingPatient) {
        setVacancyAlert({
          professionalId: appointment.professionalId,
          patientName: alertData.nextWaitingPatient.patientName,
          priority: alertData.nextWaitingPatient.priority,
        });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível dar alta.", variant: "destructive" });
    } finally {
      setIsMutating(false);
    }
  };

  const handleAbonarClick = (apt: Appointment, atestado: Atestado) => {
    setAbonarDone(false);
    setAbonarDialog({ apt, atestado });
  };

  const confirmAbonar = async () => {
    if (!abonarDialog) return;
    setAbonarSending(true);
    const { apt } = abonarDialog;
    try {
      // 1. Marcar como abonado
      await updateAppointment(apt.id, { status: "abonado" });
      await reloadAppointments();

      // 2. Carla notifica profissional
      await fetch("/api/whatsapp/abonar-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientName: apt.patientName, professionalName: apt.professionalName }),
      });

      // 3. Remove do estado local
      setAtestados(prev => prev.filter(a => a.guardianPhone !== abonarDialog.atestado.guardianPhone));

      setAbonarDone(true);
      toast({ title: "Falta Abonada!", description: `Carla avisou ${apt.professionalName} sobre o atestado de ${apt.patientName}.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível abonar a falta.", variant: "destructive" });
    } finally {
      setAbonarSending(false);
    }
  };

  const atestadoCount = atestados.length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Recepção</h1>
          <p className="text-muted-foreground mt-1">
            Gestão diária de presenças e faltas.
            {atestadoCount > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: "rgba(255,220,0,0.12)", border: "1px solid rgba(255,220,0,0.35)", color: "#ffd700" }}>
                ⚠️ {atestadoCount} atestado{atestadoCount > 1 ? "s" : ""} pendente{atestadoCount > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* Fase 5D: alerta em tempo real quando um profissional remaneja/desmarca/falta */}
      {realtimeAlert && (
        <div
          key={realtimeAlert.at}
          className="flex items-start gap-3 rounded-2xl p-4 border animate-pulse"
          style={{
            background: "linear-gradient(135deg, rgba(249,115,22,0.10), rgba(6,182,212,0.06))",
            borderColor: "rgba(249,115,22,0.45)",
            boxShadow: "0 0 24px rgba(249,115,22,0.25)",
          }}
          role="alert"
        >
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: "rgba(249,115,22,0.18)", color: "#f97316" }}
          >
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">
              Ação em tempo real: <span className="text-orange-600">{realtimeAlert.acao}</span>
            </p>
            <p className="text-sm text-foreground mt-0.5">
              <span className="font-semibold">{realtimeAlert.patientName}</span>
              <span className="text-muted-foreground"> — </span>
              <span className="text-muted-foreground">{realtimeAlert.professionalName}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Recebido agora. A agenda foi atualizada automaticamente.
            </p>
          </div>
          <button
            onClick={() => setRealtimeAlert(null)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Alertas Carla: Números Desconhecidos ── */}
      {desconhecidos.length > 0 && (
        <div className="space-y-3">
          {desconhecidos.map((c) => (
            <div key={c.telefone}
              className="flex items-start gap-4 rounded-2xl p-4 border"
              style={{
                background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(6,182,212,0.04))",
                borderColor: "rgba(124,58,237,0.2)",
                boxShadow: "0 0 20px rgba(124,58,237,0.08)",
              }}>
              {/* Avatar Carla */}
              <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-bold text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #06b6d4)" }}>
                C
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Carla <span className="font-normal text-muted-foreground text-xs">· Assistente NFs</span>
                </p>
                <p className="text-sm text-foreground mt-0.5">
                  Nati, recebi uma mensagem de um número desconhecido{" "}
                  <span className="font-bold text-violet-700">+{c.telefone}</span>.
                  Esse número não está cadastrado em nenhum paciente.
                  Deseja cadastrá-lo como um novo responsável?
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(c.identificadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-2">
                <Link href={`/patients?guardianPhone=${encodeURIComponent(c.telefone)}`}>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 12px rgba(124,58,237,0.35)" }}
                    onClick={() => dispensarContato(c.telefone)}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Cadastrar
                  </button>
                </Link>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors border border-border"
                  onClick={() => dispensarContato(c.telefone)}
                  title="Dispensar alerta"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  Dispensar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-border pb-6">
          <h2 className="text-xl font-bold">Atendimentos Terapêuticos – Hoje</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-muted-foreground">Filtrar:</span>
            <Select className="w-48" value={profIdFilter} onChange={(e) => setProfIdFilter(e.target.value)}>
              <option value="">Todos os Profissionais</option>
              {professionals?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button variant="outline" className="gap-2" onClick={handlePrintPDF}>
              <Printer className="w-4 h-4" /> Imprimir PDF
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 animate-pulse text-muted-foreground">Carregando agenda do dia...</div>
          ) : appointments?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarClock className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground">Agenda Vazia</p>
              <p className="text-muted-foreground">Nenhuma consulta encontrada para os filtros selecionados.</p>
            </div>
          ) : (
            appointments?.map((apt, i) => (
              <AppointmentRow
                key={apt.id}
                apt={apt as Appointment}
                index={i}
                atestado={findAtestado(apt as Appointment)}
                onStatusChange={handleStatusChange}
                onDischargeRequest={handleDischargeRequest}
                onAbonarClick={handleAbonarClick}
                isUpdating={isMutating}
              />
            ))
          )}
        </div>
      </Card>

      <AnimatePresence>
        {dischargeAlert && (
          <DischargeModal alert={dischargeAlert} onDischarge={handleConfirmDischarge} onClose={() => setDischargeAlert(null)} isLoading={isMutating} />
        )}
        {vacancyAlert && (
          <VacancyModal alert={vacancyAlert} onClose={() => setVacancyAlert(null)} />
        )}
      </AnimatePresence>

      {/* ── Carla: Abonar Dialog ── */}
      {abonarDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header Carla */}
            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-amber-500 to-yellow-500">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">C</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">Carla — NFs Gestão</p>
                <p className="text-white/70 text-xs">Atestado Recebido</p>
              </div>
              <button onClick={() => setAbonarDialog(null)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5">
              {abonarDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-10 h-10 text-yellow-500" />
                  <p className="font-semibold text-foreground">Falta abonada com sucesso!</p>
                  <p className="text-sm text-muted-foreground">
                    Carla avisou <strong>{abonarDialog.apt.professionalName}</strong> sobre o atestado de <strong>{abonarDialog.apt.patientName}</strong>.
                  </p>
                  <Button onClick={() => setAbonarDialog(null)} className="mt-2 w-full">Fechar</Button>
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl rounded-tl-none px-4 py-3 mb-5">
                    <p className="text-sm text-foreground leading-relaxed">
                      Recebi um atestado de <strong>{abonarDialog.apt.patientName}</strong> via WhatsApp. Deseja abonar a falta na agenda de <strong>{abonarDialog.apt.professionalName}</strong>?
                    </p>
                    <p className="text-xs text-amber-700 mt-2">
                      A sessão não precisa ser cobrada nem a falta será contabilizada.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                      onClick={confirmAbonar}
                      disabled={abonarSending}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {abonarSending ? "Abonando..." : "Abonar e Avisar Profissional"}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setAbonarDialog(null)} disabled={abonarSending}>
                      Agora não
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Bell, X, Check, MessageCircle } from "lucide-react";
import {
  listNotificacoes,
  markNotificacaoLido,
  markAllNotificacoesLido,
  listProfessionals,
  type NotificacaoRecepcao,
  type Professional,
} from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { specialtyTone, specialtyShortLabel } from "@/lib/specialty-colors";

/**
 * Central de Notificações da Recepção.
 *
 * Sininho com contador de não-lidas + painel lateral mostrando avisos gerados
 * pelas ações dos profissionais (Desmarcar, Remanejar, Em Atendimento, etc).
 *
 * Dois botões de ação por item:
 *  - "Ciente"             → marca como lido E remove da lista na hora.
 *  - "Avisar responsáveis" → abre WhatsApp com texto pronto pra Recepção
 *                            só conferir e enviar; também remove da lista.
 */
export default function NotificationBell() {
  const { toast } = useToast();
  const [notifs, setNotifs] = useState<NotificacaoRecepcao[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Mapa nome→especialidade pra colorir cada notificação pela aura do
  // profissional. Carrega 1x e reaproveita.
  const specialtyByProfName = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of professionals) {
      m.set(p.name.trim().toLowerCase(), p.specialty ?? null);
    }
    return m;
  }, [professionals]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listProfessionals();
        if (!cancelled) setProfessionals(rows);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNotificacoes();
      // Mostra apenas as não-lidas e exclui encaminhamentos (entram na fila
      // silenciosamente, sem gerar alerta visual).
      setNotifs(rows.filter((r) => !r.lido && !(r.acao || "").toLowerCase().includes("encaminhamento")));
    } catch {
      /* silencioso — infra pode não estar pronta */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("recepcao-notificacoes-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes_recepcao" },
        () => void reload()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notificacoes_recepcao" },
        () => void reload()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unreadCount = notifs.length;

  const handleCiente = async (n: NotificacaoRecepcao) => {
    // Otimista: tira da lista imediatamente. Se a RPC falhar, recoloca.
    setNotifs((prev) => prev.filter((x) => x.id !== n.id));
    try {
      await markNotificacaoLido(n.id);
    } catch {
      setNotifs((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
      toast({
        title: "Erro ao marcar como ciente",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleAvisarResponsaveis = async (n: NotificacaoRecepcao) => {
    const phone = sanitizePhone(n.patientPhone);
    const msg = buildWhatsAppMessage(n);
    // Sem telefone cadastrado → abre WhatsApp Web genérico já com o texto pronto.
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if (!phone) {
      toast({
        title: "Sem telefone do responsável",
        description: `${n.patientName} não tem telefone salvo. Abrimos o WhatsApp com o texto pronto pra você escolher o contato.`,
      });
    }
    await handleCiente(n);
  };

  const handleMarkAllRead = async () => {
    const snapshot = notifs;
    setNotifs([]);
    try {
      await markAllNotificacoesLido();
    } catch {
      setNotifs(snapshot);
      toast({
        title: "Erro ao marcar todas",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações da Recepção"
        className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: unreadCount > 0 ? "rgba(249,115,22,0.18)" : "rgba(148,163,184,0.12)",
          border: `1px solid ${unreadCount > 0 ? "rgba(249,115,22,0.55)" : "rgba(148,163,184,0.25)"}`,
          color: unreadCount > 0 ? "#f97316" : "#94a3b8",
          boxShadow: unreadCount > 0 ? "0 0 12px rgba(249,115,22,0.35)" : "none",
        }}
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? "animate-pulse" : ""}`} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
            style={{
              background: "#f97316",
              color: "#fff",
              boxShadow: "0 0 8px rgba(249,115,22,0.6)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-[420px] max-h-[78vh] overflow-hidden rounded-2xl shadow-2xl z-50 flex flex-col"
          style={{
            background: "rgba(5,8,16,0.98)",
            border: "1px solid rgba(249,115,22,0.35)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 24px rgba(249,115,22,0.15)",
          }}
          role="dialog"
          aria-label="Central de notificações"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "rgba(249,115,22,0.2)" }}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-400" />
              <span className="text-base font-bold text-white">Avisos dos Profissionais</span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40">
                  {unreadCount} nova{unreadCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
                  title="Marcar todas como lidas"
                >
                  Ciente todas
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && notifs.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">Carregando…</div>
            ) : notifs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                Tudo em dia. Quando um profissional desmarcar, remanejar ou registrar atendimento, vai aparecer aqui.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifs.map((n) => (
                  <NotifItem
                    key={n.id}
                    n={n}
                    specialty={specialtyByProfName.get((n.professionalName || "").trim().toLowerCase()) ?? null}
                    onCiente={() => handleCiente(n)}
                    onAvisarResponsaveis={() => handleAvisarResponsaveis(n)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({
  n,
  specialty,
  onCiente,
  onAvisarResponsaveis,
}: {
  n: NotificacaoRecepcao;
  specialty: string | null;
  onCiente: () => void;
  onAvisarResponsaveis: () => void;
}) {
  const colors = getAcaoColor(n.acao);
  const acaoLabel = formatAcaoLabel(n.acao);
  const initials = patientInitials(n.patientName);
  const tone = specialtyTone(specialty);
  const espLabel = specialty ? specialtyShortLabel(specialty) : null;
  return (
    <li
      className="p-4 transition-colors"
      style={{
        background: colors.row,
        borderLeft: `3px solid ${colors.fg}`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar com iniciais (paciente nao tem foto cadastrada). */}
        <div
          className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
          style={{
            background: colors.bg,
            color: colors.fg,
            border: `1.5px solid ${colors.border}`,
            boxShadow: `0 0 10px ${colors.glow}`,
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{
                background: colors.bg,
                color: colors.fg,
                border: `1px solid ${colors.border}`,
                boxShadow: `0 0 6px ${colors.glow}`,
              }}
            >
              {acaoLabel}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">{formatRelative(n.createdAt)}</span>
          </div>
          <p className="text-base font-semibold text-white mt-1.5 truncate">{n.patientName}</p>
          <p className="text-sm text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400">com</span>
            <span className="text-slate-100 font-medium">{n.professionalName}</span>
            {espLabel && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded leading-none"
                style={{
                  background: tone.bg,
                  color: tone.fg,
                  border: `1px solid ${tone.border}`,
                  boxShadow: `0 0 6px ${tone.glow}`,
                }}
              >
                {espLabel}
              </span>
            )}
            {(n.dataConsulta || n.horaConsulta) && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-slate-100">
                  {[n.dataConsulta ? formatDate(n.dataConsulta) : null, n.horaConsulta || null]
                    .filter(Boolean)
                    .join(" às ")}
                </span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onCiente}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(74,222,128,0.55)",
                color: "#86efac",
                boxShadow: "0 0 8px rgba(74,222,128,0.18)",
              }}
            >
              <Check className="w-4 h-4" /> Ciente
            </button>
            <button
              type="button"
              onClick={onAvisarResponsaveis}
              title="Abrir WhatsApp com mensagem pronta"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
              style={{
                background: "rgba(34,211,238,0.14)",
                border: "1px solid rgba(34,211,238,0.55)",
                color: "#67e8f9",
                boxShadow: "0 0 8px rgba(34,211,238,0.18)",
              }}
            >
              <MessageCircle className="w-4 h-4" /> Avisar responsáveis
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

type AcaoColor = {
  bg: string;
  fg: string;
  border: string;
  row: string;
  glow: string;
};

/**
 * Cores neon-suaves por categoria:
 *  - Verde   → novo agendamento / em atendimento / alta (positivo)
 *  - Laranja → remanejado / remarcado (mudança de horário)
 *  - Vermelho→ desmarcado / cancelado / falta (atenção)
 *  - Cinza   → fallback
 */
function getAcaoColor(acao: string): AcaoColor {
  const a = (acao || "").toLowerCase();
  if (a.includes("desmarc") || a.includes("cancel") || a.includes("falta")) {
    return {
      bg: "rgba(248,113,113,0.14)",
      fg: "#fca5a5",
      border: "rgba(248,113,113,0.55)",
      row: "rgba(248,113,113,0.06)",
      glow: "rgba(248,113,113,0.35)",
    };
  }
  if (a.includes("remanej") || a.includes("remarc")) {
    return {
      bg: "rgba(251,146,60,0.14)",
      fg: "#fdba74",
      border: "rgba(251,146,60,0.55)",
      row: "rgba(251,146,60,0.06)",
      glow: "rgba(251,146,60,0.35)",
    };
  }
  if (a.includes("agend") || a.includes("atendim") || a.includes("alta") || a.includes("conclu")) {
    return {
      bg: "rgba(74,222,128,0.14)",
      fg: "#86efac",
      border: "rgba(74,222,128,0.55)",
      row: "rgba(74,222,128,0.06)",
      glow: "rgba(74,222,128,0.35)",
    };
  }
  return {
    bg: "rgba(148,163,184,0.14)",
    fg: "#cbd5e1",
    border: "rgba(148,163,184,0.4)",
    row: "transparent",
    glow: "rgba(148,163,184,0.2)",
  };
}

function formatAcaoLabel(acao: string): string {
  const a = (acao || "").toLowerCase();
  if (a.includes("desmarc")) return "Desmarcado";
  if (a.includes("remanej")) return "Remanejado";
  if (a.includes("remarc")) return "Remarcado";
  if (a.includes("agend")) return "Novo agendamento";
  if (a.includes("atendim")) return "Em atendimento";
  if (a.includes("falta")) {
    const m = a.match(/falta\s+(\d+)/);
    return m ? `Falta ${m[1]}` : "Falta";
  }
  if (a.includes("alta")) return "Alta";
  if (a.includes("conclu")) return "Concluído";
  return acao || "Aviso";
}

function patientInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/**
 * Templates de WhatsApp por tipo de ação — tom profissional.
 * Variáveis preenchidas automaticamente: nome do paciente, profissional,
 * data e hora.
 */
function buildWhatsAppMessage(n: NotificacaoRecepcao): string {
  const acao = (n.acao || "").toLowerCase();
  const hora = (n.horaConsulta || "").trim();
  const data = n.dataConsulta ? formatDate(n.dataConsulta) : "";

  // 1. Novo Agendamento
  if (acao.includes("agend")) {
    return `Olá, tudo bem? Informamos que o agendamento para o(a) ${n.patientName} foi realizado com o(a) profissional ${n.professionalName}.\n🗓 Data: ${data || "—"}\n🕒 Horário: ${hora || "—"}\nSolicitamos, por gentileza, a chegada com 10 minutos de antecedência.\nAtenciosamente, Recepção.`;
  }

  // 2. Em Atendimento
  if (acao.includes("atendim") || acao.includes("conclu")) {
    return `Olá, informamos que o(a) ${n.patientName} iniciou o atendimento com o(a) profissional ${n.professionalName} no dia ${data || "hoje"} às ${hora || "—"}.\nSolicitamos, por gentileza, a chegada com 10 minutos de antecedência.\nAtenciosamente, Recepção.`;
  }

  // 3/4/5. Faltas
  if (acao.includes("falta")) {
    // 5. Excedente de Faltas (3ª falta — retorno para fila)
    const faltaMatch = acao.match(/falta\s+(\d+)/);
    const faltaNum = faltaMatch ? parseInt(faltaMatch[1]) : 0;
    if (faltaNum >= 3) {
      return `Olá, estamos entrando em contato para avisar que excederam as três faltas do(a) paciente ${n.patientName} com o(a) profissional ${n.professionalName}. Devido ao limite de ausências, o(a) paciente estará retornando para a fila de espera.\nAtenciosamente, Recepção.`;
    }
    // 3. Falta Justificada
    if (acao.includes("justificada") && !acao.includes("não") && !acao.includes("nao")) {
      return `Olá, tudo bem? Registramos a falta justificada do(a) ${n.patientName} no atendimento de hoje com o(a) profissional ${n.professionalName}.\nAtenciosamente, Recepção.`;
    }
    // 4. Falta Não Justificada (2ª falta)
    return `Olá, informamos que registramos a${faltaNum >= 2 ? " segunda" : ""} falta não justificada do(a) ${n.patientName} no atendimento com o(a) profissional ${n.professionalName}. Lembramos que o aviso antecipado é fundamental para a organização da agenda.\nAtenciosamente, Recepção.`;
  }

  // 6. Desmarcar Atendimento
  if (acao.includes("desmarc") || acao.includes("cancel")) {
    return `Olá, informamos que o agendamento do(a) ${n.patientName} programado para o dia ${data || "hoje"} com o(a) profissional ${n.professionalName} precisou ser desmarcado. Entraremos em contato em breve para o reagendamento.\nAtenciosamente, Recepção.`;
  }

  // 7. Remanejar (novo dia e horário automáticos)
  if (acao.includes("remanej") || acao.includes("remarc")) {
    return `Olá, tudo bem? Informamos que o atendimento do(a) ${n.patientName} com o(a) profissional ${n.professionalName} foi remanejado para o dia ${data || "—"} às ${hora || "—"}.\nAtenciosamente, Recepção.`;
  }

  // Fallback genérico
  const verbo = formatAcaoLabel(acao).toLowerCase();
  return `Olá, informamos que o atendimento de ${n.patientName} com ${n.professionalName} foi ${verbo}${
    data || hora ? ` (${[data, hora].filter(Boolean).join(" às ")})` : ""
  }.\nAtenciosamente, Recepção.`;
}



function formatDate(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

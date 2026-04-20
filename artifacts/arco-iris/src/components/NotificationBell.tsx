import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, X, Check, MessageCircle, CalendarClock } from "lucide-react";
import {
  listNotificacoes,
  markNotificacaoLido,
  markAllNotificacoesLido,
  type NotificacaoRecepcao,
} from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

/**
 * Fase 6 — Central de Notificações da Recepção
 *
 * Sininho com contador de não-lidas + painel lateral deslizante que mostra
 * o histórico das últimas ~100 notificações geradas pelas ações dos
 * profissionais (Desmarcar, Remanejar, Dar Alta, Em Atendimento, etc).
 *
 * Dois botões de ação por item:
 *  - "Ciente"      → marca a notificação como lida (sai da contagem).
 *  - "Avisar Pais" → abre WhatsApp Web/App com mensagem pré-preenchida
 *                    para o responsável do paciente e marca como lida.
 *
 * Usa Realtime (canal "recepcao-notificacoes-bell") pra recarregar a lista
 * em tempo real — independente do banner pulsante da Recepção.
 */
export default function NotificationBell() {
  const { toast } = useToast();
  const [notifs, setNotifs] = useState<NotificacaoRecepcao[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNotificacoes();
      setNotifs(rows);
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

  const unreadCount = notifs.filter((n) => !n.lido).length;

  const handleCiente = async (n: NotificacaoRecepcao) => {
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lido: true } : x)));
    try {
      await markNotificacaoLido(n.id);
    } catch {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lido: false } : x)));
      toast({
        title: "Erro ao marcar como ciente",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleAvisarPais = async (n: NotificacaoRecepcao) => {
    const phone = sanitizePhone(n.patientPhone);
    if (!phone) {
      toast({
        title: "Sem telefone cadastrado",
        description: `${n.patientName} não tem telefone do responsável registrado.`,
        variant: "destructive",
      });
      return;
    }
    const msg = buildWhatsAppMessage(n);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    await handleCiente(n);
  };

  const handleMarkAllRead = async () => {
    setNotifs((prev) => prev.map((x) => ({ ...x, lido: true })));
    try {
      await markAllNotificacoesLido();
    } catch {
      void reload();
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
          className="absolute right-0 mt-2 w-[360px] max-h-[70vh] overflow-hidden rounded-2xl shadow-2xl z-50 flex flex-col"
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
              <Bell className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-white">Avisos dos Profissionais</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40">
                  {unreadCount} nova{unreadCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
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
              <div className="p-6 text-center text-sm text-slate-400">
                Nenhuma notificação ainda. Quando um profissional desmarcar, remanejar ou dar alta, vai aparecer aqui.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifs.map((n) => (
                  <NotifItem
                    key={n.id}
                    n={n}
                    onCiente={() => handleCiente(n)}
                    onAvisarPais={() => handleAvisarPais(n)}
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
  onCiente,
  onAvisarPais,
}: {
  n: NotificacaoRecepcao;
  onCiente: () => void;
  onAvisarPais: () => void;
}) {
  const colors = getAcaoColor(n.acao);
  const hasPhone = !!sanitizePhone(n.patientPhone);
  return (
    <li
      className="p-3 transition-colors"
      style={{
        background: n.lido ? "transparent" : "rgba(249,115,22,0.04)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
          style={{ background: colors.bg, color: colors.fg }}
        >
          <CalendarClock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}
            >
              {n.acao}
            </span>
            {!n.lido && (
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" aria-label="Não lida" />
            )}
            <span className="ml-auto text-[10px] text-slate-500">{formatRelative(n.createdAt)}</span>
          </div>
          <p className="text-sm font-semibold text-white mt-1 truncate">{n.patientName}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Profissional <span className="text-slate-200">{n.professionalName}</span>
            {n.horaConsulta && (
              <>
                {" "}· <span className="text-slate-200">{n.horaConsulta}</span>
              </>
            )}
            {n.dataConsulta && (
              <>
                {" "}· <span className="text-slate-500">{formatDate(n.dataConsulta)}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onCiente}
              disabled={n.lido}
              className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.45)",
                color: "#4ade80",
              }}
            >
              <Check className="w-3 h-3" /> {n.lido ? "Ciente" : "Ciente"}
            </button>
            <button
              type="button"
              onClick={onAvisarPais}
              disabled={!hasPhone}
              title={hasPhone ? "Abrir WhatsApp com mensagem pré-preenchida" : "Sem telefone do responsável"}
              className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "rgba(34,211,238,0.12)",
                border: "1px solid rgba(34,211,238,0.45)",
                color: "#22d3ee",
              }}
            >
              <MessageCircle className="w-3 h-3" /> Avisar Pais
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getAcaoColor(acao: string): { bg: string; fg: string; border: string } {
  const a = acao.toLowerCase();
  if (a.includes("desmarc"))   return { bg: "rgba(239,68,68,0.15)",  fg: "#f87171", border: "rgba(239,68,68,0.45)" };
  if (a.includes("remanej"))   return { bg: "rgba(249,115,22,0.15)", fg: "#fb923c", border: "rgba(249,115,22,0.45)" };
  if (a.includes("alta"))      return { bg: "rgba(168,85,247,0.15)", fg: "#c084fc", border: "rgba(168,85,247,0.45)" };
  if (a.includes("atendim"))   return { bg: "rgba(34,197,94,0.15)",  fg: "#4ade80", border: "rgba(34,197,94,0.45)" };
  if (a.includes("falta"))     return { bg: "rgba(234,179,8,0.15)",  fg: "#facc15", border: "rgba(234,179,8,0.45)" };
  if (a.includes("concluir"))  return { bg: "rgba(34,197,94,0.15)",  fg: "#4ade80", border: "rgba(34,197,94,0.45)" };
  return { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", border: "rgba(148,163,184,0.4)" };
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8) return null;
  // se já vier com DDI 55, mantém; senão prefixa Brasil
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function buildWhatsAppMessage(n: NotificacaoRecepcao): string {
  const acao = (n.acao || "").toLowerCase();
  const hora = n.horaConsulta || "";
  const data = n.dataConsulta ? formatDate(n.dataConsulta) : "";
  const quando = [data, hora].filter(Boolean).join(" às ");

  if (acao.includes("desmarc")) {
    return `Olá! Aqui é da clínica. Informamos que a consulta de ${n.patientName}${quando ? ` em ${quando}` : ""} foi desmarcada pelo profissional ${n.professionalName}. Entre em contato para reagendar. Obrigada!`;
  }
  if (acao.includes("remanej")) {
    return `Olá! Aqui é da clínica. A consulta de ${n.patientName} foi remanejada pelo profissional ${n.professionalName}${quando ? ` para ${quando}` : ""}. Qualquer dúvida, estamos à disposição!`;
  }
  if (acao.includes("alta")) {
    return `Olá! Aqui é da clínica. Temos uma boa notícia: ${n.patientName} recebeu alta do profissional ${n.professionalName}. Parabéns pela jornada!`;
  }
  if (acao.includes("falta")) {
    return `Olá! Aqui é da clínica. Registramos falta de ${n.patientName}${quando ? ` em ${quando}` : ""}. Podemos reagendar?`;
  }
  return `Olá! Aqui é da clínica. Temos uma atualização sobre a consulta de ${n.patientName}${quando ? ` (${quando})` : ""}: ${n.acao}. Qualquer dúvida, estamos à disposição!`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  // Suporta "YYYY-MM-DD" e ISO completo
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
  if (d < 7) return `há ${d}d`;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : iso;
}

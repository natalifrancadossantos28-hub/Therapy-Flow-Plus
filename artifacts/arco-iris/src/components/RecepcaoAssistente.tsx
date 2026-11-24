import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  CalendarClock, MessageSquare, Search, Bus, Copy, Check, X, Send, TrendingUp, ChevronDown, ChevronUp, Pencil, RotateCcw, ClipboardList, Megaphone,
} from "lucide-react";
import {
  listAppointments,
  listWaitingList,
  listBuscaAtivaCasos,
  listFirstEvaluationDone,
  type AppointmentListItem,
  type AppointmentToday,
  type Ausencia,
  type Feriado,
  type Patient,
  type Professional,
  type WaitingListEntry,
  type BuscaAtivaCaso,
} from "@/lib/arco-rpc";
import { casoAberto } from "@/lib/busca-ativa";
import { isBlocked, holidayOn } from "@/lib/blocked-dates";
import { isHiddenByPatientStatus, worksThroughLunch } from "@/lib/schedule";
import { isTransportSpecialty, specialtyKey } from "@/lib/specialty-colors";
import { MotionCard } from "@/components/ui-custom";
import { cn, todayBR, displayApptStatus, firstEvalKey } from "@/lib/utils";
import { abrirWhatsApp, lerModoWhatsApp, gravarModoWhatsApp, type WhatsAppModo } from "@/lib/whatsapp";
import { MODELOS, type ModeloId, lerModelos, gravarModelos, preencher, exemploDe } from "@/lib/mensagens-modelo";

const UNIDADE = "Núcleo de Atendimento Novo Arco-íris 🌈";

const TIME_SLOTS = [
  "07:10", "08:00", "08:50", "09:40", "10:30", "11:20",
  "12:10",
  "13:10", "14:00", "14:50", "15:40", "16:30",
];

/** Status em que o horário não está ocupado (vaga liberada). */
// "remanejado"/"remarcado" ficam gravados no NOVO horário, que está ocupado.
const LIVRE_STATUSES = ["desmarcado", "cancelado"];
// Atendimentos que já têm presença/falta marcada não pedem mais confirmação.
const JA_MARCADO = ["presente", "ausente", "falta_nao_justificada", "falta_justificada", "justificado", "abonado"];

export function waPhone(p: string | null | undefined): string {
  const digits = (p ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

export function openWhatsApp(phone: string | null | undefined, msg: string) {
  abrirWhatsApp(waPhone(phone), msg);
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

/** Próximo dia útil (pula sábado, domingo e feriado). */
export function nextWorkingDay(from: string, feriados: Feriado[]): string {
  let d = addDaysISO(from, 1);
  for (let i = 0; i < 14; i++) {
    const wd = new Date(`${d}T12:00:00`).getDay();
    if (wd !== 0 && wd !== 6 && !holidayOn(d, feriados)) return d;
    d = addDaysISO(d, 1);
  }
  return d;
}

/** "amanhã, terça-feira (24/11)" ou "na segunda-feira (30/11)". */
function diaTexto(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00`);
  const wd = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (date === today) return `hoje, ${wd} (${dm})`;
  return date === addDaysISO(today, 1) ? `amanhã, ${wd} (${dm})` : `${wd} (${dm})`;
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Envio em massa ─────────────────────────────────────────────────────────

export type Envio = { key: string; name: string; sub?: string; phone: string | null; message: string };

function sentStorageKey(listId: string) {
  return `nfs_envios_${listId}_${todayBR()}`;
}

function useSentSet(listId: string) {
  const [sent, setSent] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(sentStorageKey(listId)) || "[]")); } catch { return new Set(); }
  });
  const mark = (key: string) => setSent(prev => {
    const n = new Set(prev); n.add(key);
    try { localStorage.setItem(sentStorageKey(listId), JSON.stringify([...n])); } catch { /* sem storage */ }
    return n;
  });
  const unmark = (key: string) => setSent(prev => {
    const n = new Set(prev); n.delete(key);
    try { localStorage.setItem(sentStorageKey(listId), JSON.stringify([...n])); } catch { /* sem storage */ }
    return n;
  });
  return { sent, mark, unmark };
}

function editadosKey(listId: string) {
  return `nfs_msg_editada_${listId}`;
}

/** Mensagens editadas uma a uma (ficam guardadas neste computador). */
function useEditados(listId: string) {
  // Guarda também a mensagem que foi editada: se a agenda mudar (outro horário, outra falta), a edição antiga não vale mais.
  const [editados, setEditados] = useState<Record<string, { base: string; texto: string }>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(editadosKey(listId)) || "{}") ?? {};
      return Object.fromEntries(Object.entries(raw).filter(([, v]) => v && typeof v === "object")) as Record<string, { base: string; texto: string }>;
    } catch { return {}; }
  });
  const editar = (key: string, base: string, texto: string | null) => setEditados(prev => {
    const n = { ...prev };
    if (texto == null) delete n[key]; else n[key] = { base, texto };
    try { localStorage.setItem(editadosKey(listId), JSON.stringify(n)); } catch { /* sem storage */ }
    return n;
  });
  return { editados, editar };
}

export function EnvioEmMassaModal({
  listId, titulo, descricao, envios, onClose, onEditarModelo,
}: { listId: string; titulo: string; descricao?: string; envios: Envio[]; onClose: () => void; onEditarModelo?: () => void }) {
  const { sent, mark, unmark } = useSentSet(listId);
  const { editados, editar } = useEditados(listId);
  const [aberto, setAberto] = useState<string | null>(envios.length === 1 ? envios[0].key : null);
  const [editando, setEditando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const edicao = (e: Envio) => (editados[e.key]?.base === e.message ? editados[e.key].texto : undefined);
  const msg = (e: Envio) => edicao(e) ?? e.message;
  const comTelefone = envios.filter(e => waPhone(e.phone));
  const pendentes = comTelefone.filter(e => !sent.has(e.key));
  const enviar = (e: Envio) => { openWhatsApp(e.phone, msg(e)); mark(e.key); };
  const [emSequencia, setEmSequencia] = useState(false);
  const [ultimo, setUltimo] = useState<Envio | null>(null);
  const proximaRef = useRef<HTMLButtonElement>(null);
  const proxima = pendentes[0];
  const enviarProxima = () => {
    if (!proxima) return;
    setUltimo(proxima);
    enviar(proxima);
  };
  const modoApp = lerModoWhatsApp() === "app";

  useEffect(() => { if (emSequencia) proximaRef.current?.focus(); }, [emSequencia, proxima?.key]);

  // Ao voltar para a Recepção, Enter já abre a próxima família.
  useEffect(() => {
    if (!emSequencia) return;
    if (!proxima) return;
    const foco = () => proximaRef.current?.focus();
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      // Enter em botão/campo faz a ação dele; o atalho vale só fora deles (ex.: ao voltar do WhatsApp).
      if (ev.key !== "Enter" || ev.repeat || alvo?.closest("button, a, input, textarea, select, [contenteditable]")) return;
      ev.preventDefault();
      enviarProxima();
    };
    window.addEventListener("focus", foco);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("focus", foco); window.removeEventListener("keydown", tecla); };
  });
  const copiar = (e: Envio) => {
    navigator.clipboard.writeText(msg(e)).catch(() => {});
    setCopiado(e.key);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <MotionCard
        className="w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(ev: React.MouseEvent) => ev.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">{titulo}</h2>
            {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {comTelefone.length - pendentes.length} de {comTelefone.length} enviados hoje
              {envios.length > comTelefone.length && ` · ${envios.length - comTelefone.length} sem telefone`}
            </p>
          </div>
          {onEditarModelo && <BotaoEditar onClick={onEditarModelo} label="Mensagem padrão" />}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        {envios.length > 1 && (
          <div className="p-4 border-b border-border">
            {!emSequencia ? (
              <>
                <button
                  disabled={pendentes.length === 0}
                  onClick={() => { setEmSequencia(true); enviarProxima(); }}
                  className="w-full h-11 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 hover:opacity-95 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  {pendentes.length === 0 ? "Todos enviados" : `Enviar para todos — ${pendentes.length} famílias`}
                </button>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Abre uma família depois da outra: você só aperta Enter. Dá para enviar uma por uma pelo botão de cada família e mudar o texto de uma só pelo lápis. Se não chegou a enviar, clique em "Enviado" para voltar para a lista.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <button
                  ref={proximaRef}
                  disabled={!proxima}
                  onClick={enviarProxima}
                  className="w-full h-12 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 hover:opacity-95 disabled:opacity-40 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-background"
                >
                  <Send className="w-4 h-4" />
                  {proxima ? `Enter = abrir a próxima: ${proxima.name} (${pendentes.length} faltando)` : "Todos enviados"}
                </button>
                <ol className="text-[11px] text-muted-foreground grid sm:grid-cols-3 gap-1.5">
                  <li className="rounded-lg bg-secondary/40 px-2 py-1.5"><b className="text-foreground">1.</b> No WhatsApp, aperte <b className="text-foreground">Enter</b> para enviar</li>
                  <li className="rounded-lg bg-secondary/40 px-2 py-1.5">
                    <b className="text-foreground">2.</b> Volte para cá com <b className="text-foreground">{modoApp ? "Alt+Tab" : "Ctrl+W"}</b>
                    {modoApp ? "" : " (fecha a aba do WhatsApp)"}
                  </li>
                  <li className="rounded-lg bg-secondary/40 px-2 py-1.5"><b className="text-foreground">3.</b> Aperte <b className="text-foreground">Enter</b> e abre a próxima família</li>
                </ol>
                <div className="flex items-center gap-3 text-[11px]">
                  {ultimo && sent.has(ultimo.key) && (
                    <button onClick={() => unmark(ultimo.key)} className="font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Não enviei a de {firstName(ultimo.name)}
                    </button>
                  )}
                  <button onClick={() => setEmSequencia(false)} className="ml-auto font-semibold text-muted-foreground hover:text-foreground">Parar</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto p-3 space-y-2">
          {envios.map(e => {
            const ok = sent.has(e.key);
            const temTel = !!waPhone(e.phone);
            const editada = edicao(e) !== undefined;
            return (
              <div key={e.key} className={cn("rounded-xl border p-3", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60")}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">
                      {e.name}
                      {editada && <span className="ml-2 text-[10px] font-semibold text-amber-500 align-middle">editada</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.sub ? `${e.sub} · ` : ""}{e.phone || "sem telefone no cadastro"}
                    </p>
                  </div>
                  <button onClick={() => { setEditando(null); setAberto(aberto === e.key ? null : e.key); }} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                    Ver {aberto === e.key && editando !== e.key ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => { setEditando(editando === e.key ? null : e.key); setAberto(e.key); }}
                    className={cn("h-8 w-8 rounded-lg border flex items-center justify-center hover:text-foreground", editando === e.key ? "border-amber-500/60 text-amber-500" : "border-border text-muted-foreground")}
                    title="Editar só esta mensagem"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => copiar(e)} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" title="Copiar mensagem">
                    {copiado === e.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    disabled={!temTel}
                    onClick={() => (ok ? unmark(e.key) : enviar(e))}
                    title={ok ? "Não enviou? Clique para voltar para a lista" : "Abrir WhatsApp com a mensagem"}
                    className={cn(
                      "h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40",
                      ok ? "border border-emerald-500/40 text-emerald-400" : "bg-green-600 text-white hover:bg-green-700",
                    )}
                  >
                    {ok ? <><Check className="w-3.5 h-3.5" /> Enviado</> : <><MessageSquare className="w-3.5 h-3.5" /> Enviar</>}
                  </button>
                </div>
                {editando === e.key ? (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      autoFocus
                      value={msg(e)}
                      onChange={ev => editar(e.key, e.message, ev.target.value)}
                      rows={Math.min(14, msg(e).split("\n").length + 2)}
                      className="w-full text-xs leading-relaxed p-2.5 rounded-lg bg-background border border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                    />
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-muted-foreground">Muda só a mensagem de {firstName(e.name)}. Fica salva neste computador.</span>
                      {editada && (
                        <button onClick={() => editar(e.key, e.message, null)} className="ml-auto font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> Desfazer edição
                        </button>
                      )}
                    </div>
                  </div>
                ) : aberto === e.key && (
                  <p className="text-xs leading-relaxed whitespace-pre-line mt-2 p-2.5 rounded-lg bg-background/60 border border-border/40">{msg(e)}</p>
                )}
              </div>
            );
          })}
          {envios.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Ninguém na lista.</p>}
        </div>
      </MotionCard>
    </div>
  );
}

function ModeloEditorModal({
  id, atual, onSalvar, onClose,
}: { id: ModeloId; atual: string; onSalvar: (texto: string) => void; onClose: () => void }) {
  const m = MODELOS[id];
  const [texto, setTexto] = useState(atual);
  const ref = useRef<HTMLTextAreaElement>(null);
  const inserir = (tag: string) => {
    const ins = `{${tag}}`;
    const el = ref.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + ins + texto.slice(fim));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + ins.length, ini + ins.length); });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <MotionCard
        className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(ev: React.MouseEvent) => ev.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">Editar mensagem — {m.titulo}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Escreva do seu jeito. O que está entre chaves, como {"{nome}"}, é trocado sozinho pelos dados da agenda. Fica salvo neste computador.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-5 grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <textarea
              ref={ref}
              value={texto}
              onChange={ev => setTexto(ev.target.value)}
              rows={14}
              className="w-full text-sm leading-relaxed p-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-1 focus:ring-amber-500/60"
            />
            <p className="text-[11px] font-semibold text-muted-foreground">Clique para colocar no texto:</p>
            <div className="flex flex-wrap gap-1.5">
              {m.campos.map(c => (
                <button
                  key={c.tag}
                  onClick={() => inserir(c.tag)}
                  title={c.desc}
                  className="px-2 py-1 rounded-lg border border-border bg-secondary/40 hover:bg-secondary text-[11px]"
                >
                  <span className="font-bold">{`{${c.tag}}`}</span> <span className="text-muted-foreground">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Como vai ficar (exemplo):</p>
            <p className="text-xs leading-relaxed whitespace-pre-line p-3 rounded-xl bg-green-500/5 border border-green-500/25">
              {preencher(texto, exemploDe(id))}
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-border flex items-center gap-2">
          <button onClick={() => setTexto(m.padrao)} className="h-9 px-3 rounded-xl text-xs font-semibold border border-border hover:bg-secondary flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Voltar ao texto original
          </button>
          <button onClick={onClose} className="ml-auto h-9 px-4 rounded-xl text-xs font-semibold border border-border hover:bg-secondary">Cancelar</button>
          <button
            disabled={!texto.trim()}
            onClick={() => { onSalvar(texto); onClose(); }}
            className="h-9 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 disabled:opacity-40"
          >
            Salvar mensagem
          </button>
        </div>
      </MotionCard>
    </div>
  );
}

function BotaoEditar({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title="Editar mensagem"
      className="h-7 min-w-7 px-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center gap-1 text-[11px] font-semibold shrink-0"
    >
      <Pencil className="w-3.5 h-3.5" />{label}
    </button>
  );
}

function SeletorDia({ value, min, onChange }: { value: string; min: string; onChange: (d: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
      Dia:
      <input
        type="date"
        value={value}
        min={min}
        onChange={ev => ev.target.value && ev.target.value >= min && onChange(ev.target.value)}
        className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
      />
    </label>
  );
}

const ROTULOS: Record<string, string> = {
  nome: "[paciente]", paciente: "[paciente]", responsavel: "[responsável]", horarios: "[horário — especialidade com profissional]",
  aviso_van: "", motorista: "[motorista]", hora_van: "[horário]", hora: "[horário]",
  especialidade: "[especialidade]", profissional: "[profissional]", unidade: UNIDADE,
  periodo: "[dias]", atendimentos: "[dias e horários do paciente]", recado: "[recado]", solicitante: "[quem pediu]",
};

function Previa({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-3 text-xs leading-relaxed whitespace-pre-line line-clamp-5">
      {texto}
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────

function AssistCard({
  icon, cor, titulo, sub, children, className, acoes,
}: { icon: React.ReactNode; cor: string; titulo: string; sub?: React.ReactNode; children: React.ReactNode; className?: string; acoes?: React.ReactNode }) {
  return (
    <div
      className={cn("rounded-2xl border p-4 flex flex-col gap-3 bg-card/70 backdrop-blur", className)}
      style={{ borderColor: `${cor}55`, boxShadow: `0 0 24px ${cor}14` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${cor}26`, color: cor }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[15px] leading-tight">{titulo}</h3>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {acoes && <div className="flex items-center gap-1 shrink-0">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

const btnVerde = "w-full h-10 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-md shadow-green-500/20 hover:opacity-95 disabled:opacity-40 flex items-center justify-center gap-2";
const btnContorno = "w-full h-9 rounded-xl font-semibold text-xs border border-border hover:bg-secondary disabled:opacity-40 flex items-center justify-center gap-2";
const btnEnviarMini = "h-8 px-3 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 shrink-0";

type Props = {
  dayAppointments: AppointmentToday[];
  transportByPatient: Map<number, string[]>;
  professionals: Professional[];
  patients: Patient[];
  feriados: Feriado[];
  ausencias: Ausencia[];
  ready: boolean;
};

type Fonte = Exclude<ModeloId, "encaixe" | "buscaFalta">;
type Modal = { listId: string; titulo: string; descricao?: string; fonte: Fonte; so?: string };
type Lembretes = { envios: Envio[]; van: Envio[] };

type AvisoTipo = "avisoFerias" | "avisoDesmarcar" | "avisoGeral";
const AVISO_TIPOS: { id: AvisoTipo; rotulo: string }[] = [
  { id: "avisoFerias", rotulo: "Férias" },
  { id: "avisoDesmarcar", rotulo: "Desmarcar" },
  { id: "avisoGeral", rotulo: "Recado" },
];

function diaCurto(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${d.toLocaleDateString("pt-BR", { weekday: "long" })} (${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })})`;
}

/** Agenda de um período, opcionalmente de um profissional (null enquanto carrega). */
function useAgendaPeriodo(de: string, ate: string, professionalId: number | null, ativo: boolean): AppointmentListItem[] | null {
  const chave = `${de}|${ate}|${professionalId ?? ""}`;
  const [data, setData] = useState<{ chave: string; items: AppointmentListItem[] } | null>(null);
  useEffect(() => {
    if (!ativo || !de || !ate || ate < de) return;
    let vivo = true;
    listAppointments({ dateFrom: de, dateTo: ate, professionalId })
      .then(items => { if (vivo) setData({ chave, items }); })
      .catch(() => { if (vivo) setData({ chave, items: [] }); });
    return () => { vivo = false; };
  }, [chave, ativo]); // eslint-disable-line react-hooks/exhaustive-deps
  return data?.chave === chave ? data.items : null;
}

/** Agenda de um dia escolhido (null enquanto carrega). */
function useAgendaDia(date: string, ready: boolean): AppointmentListItem[] | null {
  const [data, setData] = useState<{ date: string; items: AppointmentListItem[] } | null>(null);
  useEffect(() => {
    if (!ready || !date) return;
    let vivo = true;
    listAppointments({ date })
      .then(items => { if (vivo) setData({ date, items }); })
      .catch(() => { if (vivo) setData({ date, items: [] }); });
    return () => { vivo = false; };
  }, [date, ready]);
  return data?.date === date ? data.items : null;
}

export function RecepcaoAssistente({ dayAppointments, transportByPatient, professionals, patients, feriados, ausencias, ready }: Props) {
  const today = todayBR();
  const [modal, setModal] = useState<Modal | null>(null);
  const [fila, setFila] = useState<WaitingListEntry[]>([]);
  const [casos, setCasos] = useState<BuscaAtivaCaso[]>([]);
  const [semana, setSemana] = useState<AppointmentListItem[] | null>(null);
  const [avaliados, setAvaliados] = useState<Set<string> | "erro" | null>(null);
  const [verTodosEncaixes, setVerTodosEncaixes] = useState(false);
  const [modelos, setModelos] = useState(lerModelos);
  const [editandoModelo, setEditandoModelo] = useState<ModeloId | null>(null);
  const [modoWa, setModoWa] = useState<WhatsAppModo>(lerModoWhatsApp);

  const proximoDia = useMemo(() => nextWorkingDay(today, feriados), [today, feriados]);
  const [diaLembrete, setDiaLembrete] = useState<string | null>(null);
  const [diaAval, setDiaAval] = useState<string | null>(null);
  const dataLembrete = diaLembrete ?? proximoDia;
  const dataAval = diaAval ?? proximoDia;
  const agendaLembrete = useAgendaDia(dataLembrete, ready);
  const agendaAval = useAgendaDia(dataAval, ready);

  const [avisoTipo, setAvisoTipo] = useState<AvisoTipo>("avisoFerias");
  const [avisoProf, setAvisoProf] = useState<number | null>(null);
  const [avisoDe, setAvisoDe] = useState<string | null>(null);
  const [avisoAte, setAvisoAte] = useState<string | null>(null);
  const [recado, setRecado] = useState("");
  const [avisoSolic, setAvisoSolic] = useState<number | null>(null);
  const avisoInicio = avisoDe ?? proximoDia;
  const avisoFim = avisoAte && avisoAte >= avisoInicio ? avisoAte : avisoInicio;
  // "Todos" só faz sentido para recado; férias e desmarcar são sempre de um profissional.
  const avisoProfId = avisoProf ?? null;
  const avisoPronto = (avisoProfId !== null || avisoTipo === "avisoGeral") && (avisoTipo !== "avisoGeral" || recado.trim() !== "");
  const agendaAviso = useAgendaPeriodo(avisoInicio, avisoFim, avisoProfId, ready && (avisoProfId !== null || avisoTipo === "avisoGeral"));

  useEffect(() => {
    listWaitingList().then(setFila).catch(console.error);
    listBuscaAtivaCasos().then(setCasos).catch(console.error);
    listFirstEvaluationDone().then(setAvaliados).catch(() => setAvaliados("erro"));
    const wd = new Date(`${today}T12:00:00`).getDay();
    const monday = addDaysISO(today, -((wd + 6) % 7));
    listAppointments({ dateFrom: monday, dateTo: today }).then(setSemana).catch(() => setSemana([]));
  }, [today]);

  const tpl = (id: ModeloId) => modelos[id] ?? MODELOS[id].padrao;
  const salvarModelo = (id: ModeloId, texto: string) => setModelos(prev => {
    const n = { ...prev };
    if (texto.trim() === MODELOS[id].padrao.trim()) delete n[id]; else n[id] = texto;
    gravarModelos(n);
    return n;
  });

  const patientById = useMemo(() => new Map(patients.map(p => [p.id, p])), [patients]);
  const profById = useMemo(() => new Map(professionals.map(p => [p.id, p])), [professionals]);
  const phoneOf = (patientId: number, fallback?: string | null) => {
    const p = patientById.get(patientId);
    return p?.guardianPhone || p?.phone || fallback || null;
  };
  const responsavelDe = (patientId: number, nome?: string | null) =>
    firstName(nome || patientById.get(patientId)?.guardianName || "");

  // ── Encaixe: horários vagos de hoje + 1º da fila da especialidade ─────
  const encaixes = useMemo(() => {
    const agora = nowHHMM();
    const porProf = new Map<number, AppointmentToday[]>();
    for (const a of dayAppointments) {
      if (isTransportSpecialty(a.professionalSpecialty)) continue;
      porProf.set(a.professionalId, [...(porProf.get(a.professionalId) ?? []), a]);
    }
    const filaAtiva = fila.filter(f => !(f as { paused?: boolean }).paused && !f.semLaudo);
    const ocupadoHoje = new Set(dayAppointments.map(a => `${a.patientId}|${a.time}`));
    const usados = new Set<number>();
    const out: { time: string; prof: string; specialty: string; sugerido: WaitingListEntry }[] = [];
    for (const [profId, apts] of porProf) {
      const prof = profById.get(profId);
      const spec = prof?.specialty || apts[0].professionalSpecialty;
      const key = specialtyKey(spec);
      const manha = apts.some(a => a.time < "12:10");
      const tarde = apts.some(a => a.time > "12:10");
      const ocupados = new Set(
        apts.filter(a => !LIVRE_STATUSES.includes((a.status ?? "").toLowerCase())).map(a => a.time),
      );
      for (const t of TIME_SLOTS) {
        if (t <= agora || ocupados.has(t)) continue;
        if (t === "12:10" && !worksThroughLunch(prof?.name)) continue;
        if ((t < "12:10" && !manha) || (t > "12:10" && !tarde)) continue;
        const sug = filaAtiva.find(f =>
          specialtyKey(f.specialty) === key && !usados.has(f.patientId) && !ocupadoHoje.has(`${f.patientId}|${t}`),
        );
        if (!sug) continue;
        usados.add(sug.patientId);
        out.push({ time: t, prof: apts[0].professionalName, specialty: spec, sugerido: sug });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [dayAppointments, fila, profById]);

  const msgEncaixe = (e: (typeof encaixes)[number]) =>
    preencher(tpl("encaixe"), {
      unidade: UNIDADE, hora: e.time, especialidade: e.specialty, profissional: e.prof,
      paciente: e.sugerido.patientName, nome: firstName(e.sugerido.patientName),
    });

  // ── Lembretes (confirmação / avaliação) de um dia ──────────────────────
  const montarLembretes = (items: AppointmentListItem[] | null, date: string, tipo: "lembrete" | "avaliacao"): Lembretes | null => {
    if (!items || avaliados === null) return null;
    const ativos = items.filter(a =>
      !a.paused &&
      !LIVRE_STATUSES.includes((a.status ?? "").toLowerCase()) &&
      (a.status ?? "").toLowerCase() !== "pausado" &&
      !JA_MARCADO.includes((a.status ?? "").toLowerCase()) &&
      !isHiddenByPatientStatus(a.patientStatus, a.date, today) &&
      !isBlocked(a.date, a.professionalId, feriados, ausencias),
    );
    const isDriver = (id: number) => isTransportSpecialty(profById.get(id)?.specialty);
    // "Avaliação" = agendado e o paciente ainda não passou pela 1ª avaliação naquela especialidade.
    const ehAvaliacao = (a: AppointmentListItem) =>
      avaliados !== "erro" &&
      displayApptStatus(a.status, avaliados.has(firstEvalKey(a.patientId, profById.get(a.professionalId)?.specialty ?? null))) === "agendado";
    const clinicos = new Map<number, AppointmentListItem[]>();
    const vans = new Map<number, string[]>();
    const vanTimes = new Map<number, string[]>();
    for (const a of ativos) {
      if (isDriver(a.professionalId)) {
        vans.set(a.patientId, [...new Set([...(vans.get(a.patientId) ?? []), a.professionalName])]);
        vanTimes.set(a.patientId, [...new Set([...(vanTimes.get(a.patientId) ?? []), a.time])].sort());
      } else {
        clinicos.set(a.patientId, [...(clinicos.get(a.patientId) ?? []), a]);
      }
    }
    const dia = diaTexto(date, today);
    const envios: Envio[] = [];
    const van: Envio[] = [];
    for (const [pid, todos] of clinicos) {
      todos.sort((a, b) => a.time.localeCompare(b.time));
      const apts = todos.filter(a => ehAvaliacao(a) === (tipo === "avaliacao"));
      const nome = todos[0].patientName;
      const motoristas = vans.get(pid);
      const horaVan = (vanTimes.get(pid) ?? [todos[0].time]).join(" e ");
      const phone = todos[0].guardianPhone || phoneOf(pid);
      const base = {
        unidade: UNIDADE, dia, nome: firstName(nome), paciente: nome,
        responsavel: responsavelDe(pid, todos[0].guardianName),
      };
      if (apts.length > 0) {
        const linhas = apts.map(a => `• ${a.time} — ${profById.get(a.professionalId)?.specialty ?? "Atendimento"} com ${a.professionalName}`).join("\n");
        envios.push({
          key: `${tipo}-${pid}`,
          name: nome,
          sub: apts.map(a => `${a.time} ${a.professionalName}`).join(", ") + (motoristas ? " · Van" : ""),
          phone,
          message: preencher(tpl(tipo), {
            ...base,
            horarios: linhas,
            aviso_van: motoristas ? `🚐 A van vai buscar ${firstName(nome)} para o horário das ${horaVan} (motorista ${motoristas.join(" / ")}).` : "",
          }),
        });
      }
      if (motoristas && tipo === "lembrete") {
        van.push({
          key: `van-${pid}`,
          name: nome,
          sub: `${horaVan} · motorista ${motoristas.join(" / ")}`,
          phone,
          message: preencher(tpl("van"), { ...base, motorista: motoristas.join(" / "), hora_van: horaVan }),
        });
      }
    }
    envios.sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? ""));
    van.sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? ""));
    return { envios, van };
  };

  const lembretes = useMemo(
    () => montarLembretes(agendaLembrete, dataLembrete, "lembrete"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaLembrete, dataLembrete, avaliados, today, feriados, ausencias, profById, patientById, modelos],
  );
  const avaliacoes = useMemo(
    () => montarLembretes(agendaAval, dataAval, "avaliacao"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAval, dataAval, avaliados, today, feriados, ausencias, profById, patientById, modelos],
  );

  // ── Busca Ativa ────────────────────────────────────────────────────────
  // Caso aberto por faltas: encaminhamento "Faltas seguidas…" ou pausa cujo motivo fala de faltas/não comparecer.
  const ehCasoDeFalta = (c: BuscaAtivaCaso) => {
    const m = c.origem === "encaminhamento" ? (c.motivo ?? "").split(" — ")[0] : (c.motivo ?? "");
    return /falt(?!a de )|aus[eê]nc|comparec|comprec|n[aã]o retorn|pararam de trazer/i.test(m);
  };
  const buscaEnvios = useMemo<Envio[]>(() => {
    const porPaciente = new Map<number, BuscaAtivaCaso>();
    for (const c of casos.filter(casoAberto)) {
      const atual = porPaciente.get(c.patientId);
      if (!atual || (ehCasoDeFalta(c) && !ehCasoDeFalta(atual))) porPaciente.set(c.patientId, c);
    }
    return [...porPaciente.values()].map(c => ({
      key: `busca-${c.id}`,
      name: c.patientName,
      sub: [c.specialty, c.motivo].filter(Boolean).join(" · "),
      phone: c.patientPhone || phoneOf(c.patientId),
      message: preencher(tpl(ehCasoDeFalta(c) ? "buscaFalta" : "buscaAtiva"), {
        unidade: UNIDADE, paciente: c.patientName, nome: firstName(c.patientName),
        responsavel: responsavelDe(c.patientId, c.guardianName),
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casos, patientById, modelos]);

  // ── Van: faltas de hoje sem aviso ──────────────────────────────────────
  const faltasVan = useMemo<Envio[]>(() => {
    // O transporte é agendado no mesmo horário do atendimento que a van atende.
    const vanSlots = new Set<string>();
    for (const a of dayAppointments) {
      const st = (a.status ?? "").toLowerCase();
      if (isTransportSpecialty(a.professionalSpecialty) && st !== "desmarcado" && st !== "cancelado") vanSlots.add(`${a.patientId}|${a.time}`);
    }
    const porPaciente = new Map<number, AppointmentToday[]>();
    for (const a of dayAppointments) {
      if (isTransportSpecialty(a.professionalSpecialty) || !transportByPatient.has(a.patientId)) continue;
      if (!vanSlots.has(`${a.patientId}|${a.time}`)) continue;
      porPaciente.set(a.patientId, [...(porPaciente.get(a.patientId) ?? []), a]);
    }
    const out: Envio[] = [];
    for (const [pid, apts] of porPaciente) {
      const st = apts.map(a => (a.status ?? "").toLowerCase());
      const semAviso = st.some(s => s === "ausente" || s === "falta_nao_justificada");
      const avisou = st.some(s => s === "falta_justificada" || s === "justificado" || s === "abonado" || s === "presente");
      if (!semAviso || avisou) continue;
      apts.sort((a, b) => a.time.localeCompare(b.time));
      const nome = apts[0].patientName;
      const motorista = (transportByPatient.get(pid) ?? []).join(" / ");
      out.push({
        key: `faltavan-${pid}`,
        name: nome,
        sub: `${apts[0].time} · motorista ${motorista}`,
        phone: phoneOf(pid, apts[0].patientPhone),
        message: preencher(tpl("faltaVan"), {
          unidade: UNIDADE, nome: firstName(nome), paciente: nome, responsavel: responsavelDe(pid),
          hora: apts[0].time, motorista,
        }),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAppointments, transportByPatient, patientById, modelos]);

  // ── Resultado da semana ────────────────────────────────────────────────
  const resumoSemana = useMemo(() => {
    if (!semana) return null;
    const dias = ["S", "T", "Q", "Q", "S"];
    const porDia = dias.map(() => ({ p: 0, f: 0 }));
    let p = 0, f = 0;
    for (const a of semana) {
      if (isTransportSpecialty(profById.get(a.professionalId)?.specialty)) continue;
      const wd = new Date(`${a.date}T12:00:00`).getDay();
      if (wd < 1 || wd > 5) continue;
      const s = (a.status ?? "").toLowerCase();
      if (s === "presente") { p++; porDia[wd - 1].p++; }
      else if (s === "ausente" || s === "falta_nao_justificada") { f++; porDia[wd - 1].f++; }
    }
    const pct = p + f > 0 ? Math.round((p / (p + f)) * 100) : null;
    return { pct, p, f, porDia: porDia.map((d, i) => ({ dia: dias[i], pct: d.p + d.f > 0 ? d.p / (d.p + d.f) : null })) };
  }, [semana, profById]);

  // ── Aviso aos pacientes de um profissional (férias, desmarcar, recado) ──
  const profsClinicos = useMemo(
    () => professionals.filter(p => !isTransportSpecialty(p.specialty)).sort((a, b) => a.name.localeCompare(b.name)),
    [professionals],
  );
  const ausenciasDoProf = useMemo(
    () => avisoProfId === null ? [] : ausencias.filter(a => a.professionalId === avisoProfId && a.dataFim >= today),
    [ausencias, avisoProfId, today],
  );
  const solicId = avisoProfId ?? avisoSolic;
  const solicProf = solicId !== null ? profById.get(solicId) : undefined;
  const solicitante = solicProf
    ? `${firstName(solicProf.name)}${solicProf.specialty ? ` (${solicProf.specialty})` : ""}`
    : "A coordenação";
  const periodoTexto = avisoInicio === avisoFim ? diaTexto(avisoInicio, today) : `de ${diaCurto(avisoInicio)} a ${diaCurto(avisoFim)}`;
  const avisoEnvios = useMemo<Envio[] | null>(() => {
    if (!agendaAviso) return null;
    // Quem já desmarcou na agenda por causa das férias também precisa do aviso.
    const ignorar = avisoTipo === "avisoGeral" ? LIVRE_STATUSES : ["cancelado"];
    const porPaciente = new Map<number, AppointmentListItem[]>();
    for (const a of agendaAviso) {
      const st = (a.status ?? "").toLowerCase();
      if (a.paused || st === "pausado" || ignorar.includes(st)) continue;
      if (isTransportSpecialty(profById.get(a.professionalId)?.specialty)) continue;
      if (isHiddenByPatientStatus(a.patientStatus, a.date, today)) continue;
      porPaciente.set(a.patientId, [...(porPaciente.get(a.patientId) ?? []), a]);
    }
    const out: Envio[] = [];
    for (const [pid, apts] of porPaciente) {
      apts.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const nomesProf = [...new Set(apts.map(a => a.professionalName))];
      const specs = [...new Set(apts.map(a => profById.get(a.professionalId)?.specialty).filter(Boolean))];
      const varios = nomesProf.length > 1;
      const nome = apts[0].patientName;
      out.push({
        key: `aviso-${pid}`,
        name: nome,
        sub: apts.map(a => `${a.date.slice(8, 10)}/${a.date.slice(5, 7)} ${a.time}`).join(", ") + (varios ? ` · ${nomesProf.join(", ")}` : ""),
        phone: apts[0].guardianPhone || phoneOf(pid),
        message: preencher(tpl(avisoTipo), {
          unidade: UNIDADE, nome: firstName(nome), paciente: nome,
          responsavel: responsavelDe(pid, apts[0].guardianName),
          profissional: nomesProf.map(firstName).join(", "),
          especialidade: specs.join(", ") || "Atendimento",
          periodo: periodoTexto,
          atendimentos: apts.map(a => `• ${diaCurto(a.date)} às ${a.time}${varios ? ` — ${a.professionalName}` : ""}`).join("\n"),
          recado: recado.trim(),
          solicitante,
        }),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAviso, avisoTipo, recado, solicitante, periodoTexto, profById, patientById, modelos, today]);
  const avisoLista = {
    listId: `${avisoTipo}-${avisoProfId ?? "todos"}-${avisoInicio}-${avisoFim}`,
    titulo: `${AVISO_TIPOS.find(t => t.id === avisoTipo)!.rotulo} — ${avisoProfId !== null ? profById.get(avisoProfId)?.name ?? "" : "todos os profissionais"} · ${periodoTexto}`,
    fonte: avisoTipo,
  };

  const enviosDe = (f: Fonte): Envio[] =>
    f === "lembrete" ? lembretes?.envios ?? []
    : f === "avaliacao" ? avaliacoes?.envios ?? []
    : f === "van" ? lembretes?.van ?? []
    : f === "faltaVan" ? faltasVan
    : f === "avisoFerias" || f === "avisoDesmarcar" || f === "avisoGeral" ? avisoEnvios ?? []
    : buscaEnvios;
  const modalEnvios = modal ? enviosDe(modal.fonte).filter(e => !modal.so || e.key === modal.so) : [];
  const previa = (id: ModeloId, dia: string) => preencher(tpl(id), { ...ROTULOS, dia });

  const encaixesVisiveis = verTodosEncaixes ? encaixes : encaixes.slice(0, 3);
  const diaLembreteLabel = diaTexto(dataLembrete, today);
  const diaAvalLabel = diaTexto(dataAval, today);
  const lembreteLista = { listId: `lembrete-${dataLembrete}`, titulo: `Lembrete — atendimentos de ${diaLembreteLabel}`, fonte: "lembrete" as const };
  const avalLista = { listId: `avaliacao-${dataAval}`, titulo: `Lembrete de avaliação — ${diaAvalLabel}`, fonte: "avaliacao" as const };
  const buscaLista = { listId: "busca-ativa", titulo: "Busca Ativa — chamar para conversar", fonte: "buscaAtiva" as const };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-bold">Assistente da recepção</h2>
        <span className="text-xs text-muted-foreground">mensagens prontas a partir da agenda · o lápis edita o texto</span>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground" title="Onde as mensagens abrem. Fica salvo neste computador.">
          Abrir no:
          {([["web", "WhatsApp Web"], ["app", "Aplicativo do WhatsApp"]] as const).map(([m, rotulo]) => (
            <button
              key={m}
              onClick={() => { gravarModoWhatsApp(m); setModoWa(m); }}
              className={cn(
                "h-7 px-2.5 rounded-lg border",
                modoWa === m ? "bg-green-600 text-white border-green-600" : "border-border hover:bg-secondary",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssistCard
          icon={<CalendarClock className="w-5 h-5" />} cor="#8b5cf6"
          titulo="Horários livres para encaixe"
          sub={encaixes.length > 0 ? `${encaixes.length} horário(s) vago(s) hoje com paciente da fila` : "Vagas de hoje x fila de espera"}
          acoes={<BotaoEditar onClick={() => setEditandoModelo("encaixe")} />}
        >
          {encaixesVisiveis.map(e => (
            <div key={`${e.time}-${e.prof}`} className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/40 p-2.5">
              <span className="font-bold text-sm w-12 shrink-0">{e.time}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{e.prof} · {e.specialty}</p>
                <p className="text-[11px] text-muted-foreground truncate">Sugerido: {e.sugerido.patientName}</p>
              </div>
              <button
                onClick={() => openWhatsApp(e.sugerido.patientPhone || phoneOf(e.sugerido.patientId), msgEncaixe(e))}
                className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-95 shrink-0"
                title="Oferecer o horário à família pelo WhatsApp"
              >
                Encaixar
              </button>
            </div>
          ))}
          {encaixes.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum horário vago no resto do dia.</p>
          )}
          {encaixes.length > 3 && (
            <button onClick={() => setVerTodosEncaixes(v => !v)} className="text-xs font-semibold text-violet-400 hover:underline self-start">
              {verTodosEncaixes ? "Mostrar menos" : `Ver todos (${encaixes.length})`}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground mt-auto">"Encaixar" abre o WhatsApp oferecendo o horário. Depois de confirmar, marque na <Link href="/agenda" className="underline">Agenda</Link>.</p>
        </AssistCard>

        <AssistCard
          icon={<MessageSquare className="w-5 h-5" />} cor="#22c55e"
          titulo="Lembrete de confirmação"
          sub={lembretes === null ? "Carregando a agenda..." : `${lembretes.envios.length} paciente(s) com atendimento ${diaLembreteLabel}`}
          acoes={<BotaoEditar onClick={() => setEditandoModelo("lembrete")} />}
        >
          <SeletorDia value={dataLembrete} min={today} onChange={setDiaLembrete} />
          <Previa texto={previa("lembrete", diaLembreteLabel)} />
          <p className="text-[11px] text-muted-foreground">Nome, horários e profissionais saem da agenda. Quem vem de van recebe também o aviso do motorista. Avaliações vão no card de avaliação.</p>
          <button
            className={cn(btnVerde, "mt-auto")}
            disabled={!lembretes || lembretes.envios.length === 0}
            onClick={() => setModal({ ...lembreteLista, descricao: "Uma mensagem por paciente, com todos os horários do dia." })}
          >
            <Send className="w-4 h-4" /> Enviar lembretes ({lembretes?.envios.length ?? 0}) — um a um ou todos
          </button>
        </AssistCard>

        <AssistCard
          icon={<ClipboardList className="w-5 h-5" />} cor="#ec4899"
          titulo="Lembrete de avaliação"
          sub={
            avaliados === "erro" ? "Não foi possível ver quem já passou pela avaliação."
            : avaliacoes === null ? "Carregando a agenda..."
            : `${avaliacoes.envios.length} paciente(s) com avaliação ${diaAvalLabel}`
          }
          acoes={<BotaoEditar onClick={() => setEditandoModelo("avaliacao")} />}
        >
          <SeletorDia value={dataAval} min={today} onChange={setDiaAval} />
          {(avaliacoes?.envios ?? []).slice(0, 3).map(e => (
            <div key={e.key} className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/40 p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{e.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{e.sub}</p>
              </div>
              <button disabled={!waPhone(e.phone)} onClick={() => setModal({ ...avalLista, so: e.key })} className={btnEnviarMini}>
                Enviar
              </button>
            </div>
          ))}
          {avaliacoes && avaliacoes.envios.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma avaliação marcada para esse dia.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Pega sozinho quem os profissionais marcaram para avaliação no dia escolhido.</p>
          <button
            className={cn(btnVerde, "mt-auto")}
            disabled={!avaliacoes || avaliacoes.envios.length === 0}
            onClick={() => setModal({ ...avalLista, descricao: "Pacientes marcados para avaliação, uma mensagem por paciente." })}
          >
            <Send className="w-4 h-4" /> Enviar para todas as avaliações ({avaliacoes?.envios.length ?? 0})
          </button>
        </AssistCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssistCard
          icon={<Search className="w-5 h-5" />} cor="#f59e0b"
          titulo="Busca Ativa"
          sub={`${buscaEnvios.length} caso(s) em aberto`}
        >
          <div className="flex flex-wrap gap-1.5">
            <BotaoEditar onClick={() => setEditandoModelo("buscaFalta")} label="Mensagem de faltas" />
            <BotaoEditar onClick={() => setEditandoModelo("buscaAtiva")} label="Outros casos" />
          </div>
          {buscaEnvios.slice(0, 2).map(e => (
            <div key={e.key} className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/40 p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{e.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{e.sub || "—"}</p>
              </div>
              <button disabled={!waPhone(e.phone)} onClick={() => setModal({ ...buscaLista, so: e.key })} className={btnEnviarMini}>
                Enviar
              </button>
            </div>
          ))}
          <Previa texto={previa("buscaFalta", "")} />
          <div className="mt-auto space-y-2">
            <button
              className={btnVerde}
              disabled={buscaEnvios.length === 0}
              onClick={() => setModal({ ...buscaLista, descricao: "Casos de falta recebem a mensagem de faltas; os outros, o convite para conversar com a administração. Pelo lápis de cada família dá para colocar as faltas e as datas." })}
            >
              <Send className="w-4 h-4" /> Enviar para todos da Busca Ativa ({buscaEnvios.length})
            </button>
            <Link href="/busca-ativa" className={btnContorno}>Abrir Busca Ativa</Link>
          </div>
        </AssistCard>

        <AssistCard
          icon={<Bus className="w-5 h-5" />} cor="#3b82f6"
          titulo="Transporte (van)"
          sub={`Faltas de van sem aviso hoje: ${faltasVan.length} · ${lembretes?.van.length ?? 0} criança(s) de van ${diaLembreteLabel}`}
        >
          <div className="flex flex-wrap gap-1.5">
            <BotaoEditar onClick={() => setEditandoModelo("faltaVan")} label="Mensagem de falta" />
            <BotaoEditar onClick={() => setEditandoModelo("van")} label="Mensagem de confirmação" />
          </div>
          {faltasVan.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma falta de van sem aviso hoje. Quando marcar <strong>Falta</strong> em um paciente com a etiqueta azul <strong>Van</strong>, ele aparece aqui com a mensagem pronta para a família.
            </p>
          ) : (
            <div className="space-y-2">
              {faltasVan.map(e => (
                <div key={e.key} className="flex items-center gap-3 rounded-xl bg-red-500/5 border border-red-400/30 p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{e.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{e.sub}</p>
                  </div>
                  <button
                    disabled={!waPhone(e.phone)}
                    onClick={() => setModal({ listId: `falta-van-${today}`, titulo: "Falta de van sem aviso", fonte: "faltaVan", so: e.key })}
                    className={btnEnviarMini}
                  >
                    Avisar família
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 mt-auto">
            {faltasVan.length > 1 && (
              <button
                className={btnContorno}
                onClick={() => setModal({ listId: `falta-van-${today}`, titulo: "Faltas de van sem aviso — hoje", fonte: "faltaVan" })}
              >
                Avisar todas as faltas de van ({faltasVan.length})
              </button>
            )}
            <button
              className={btnVerde}
              disabled={!lembretes || lembretes.van.length === 0}
              onClick={() => setModal({
                listId: `van-${dataLembrete}`,
                titulo: `Van — confirmar a busca de ${diaLembreteLabel}`,
                descricao: "Só para as famílias que vêm de van: pede para confirmar ou avisar antes do motorista sair. O dia é o mesmo do lembrete de confirmação.",
                fonte: "van",
              })}
            >
              <Send className="w-4 h-4" /> Pedir confirmação a quem vem de van ({lembretes?.van.length ?? 0})
            </button>
          </div>
        </AssistCard>

        <AssistCard icon={<TrendingUp className="w-5 h-5" />} cor="#2dd4bf" titulo="Resultado da semana" sub="presenças x faltas marcadas">
          {resumoSemana?.pct == null ? (
            <p className="text-xs text-muted-foreground">{resumoSemana ? "Ainda sem presenças ou faltas marcadas nesta semana." : "Carregando..."}</p>
          ) : (
            <div className="flex items-end gap-4">
              <div>
                <p className="text-4xl font-extrabold text-teal-300 leading-none">{resumoSemana.pct}%</p>
                <p className="text-[11px] text-muted-foreground mt-1">compareceram · {resumoSemana.p} presenças, {resumoSemana.f} faltas</p>
              </div>
              <div className="flex items-end gap-1.5 ml-auto h-12">
                {resumoSemana.porDia.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-4 h-10 rounded bg-secondary/60 flex items-end overflow-hidden">
                      <div className="w-full rounded bg-gradient-to-t from-teal-500 to-emerald-300" style={{ height: `${Math.round((d.pct ?? 0) * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.dia}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AssistCard>
      </div>

      <AssistCard
        icon={<Megaphone className="w-5 h-5" />} cor="#a855f7"
        titulo="Aviso aos pacientes de um profissional"
        sub="férias, atendimento desmarcado ou recado: vai para todas as famílias com atendimento nos dias escolhidos"
        acoes={<BotaoEditar onClick={() => setEditandoModelo(avisoTipo)} label="Mensagem" />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {AVISO_TIPOS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setAvisoTipo(t.id)}
                  className={cn(
                    "h-8 px-3 rounded-lg text-xs font-bold border",
                    avisoTipo === t.id ? "bg-purple-600 text-white border-purple-600" : "border-border hover:bg-secondary",
                  )}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
              Profissional
              <select
                value={avisoProf ?? ""}
                onChange={ev => setAvisoProf(ev.target.value ? Number(ev.target.value) : null)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="">{avisoTipo === "avisoGeral" ? "Todos os profissionais" : "Escolha o profissional"}</option>
                {profsClinicos.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ""}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                De:
                <input
                  type="date" value={avisoInicio} min={today}
                  onChange={ev => ev.target.value && ev.target.value >= today && setAvisoDe(ev.target.value)}
                  className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                />
              </label>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                Até:
                <input
                  type="date" value={avisoFim} min={avisoInicio}
                  onChange={ev => ev.target.value && ev.target.value >= avisoInicio && setAvisoAte(ev.target.value)}
                  className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                />
              </label>
            </div>
            {ausenciasDoProf.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ausenciasDoProf.map(a => {
                  const de = a.dataInicio < today ? today : a.dataInicio;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        setAvisoDe(de); setAvisoAte(a.dataFim);
                        setAvisoTipo(/f[eé]rias/i.test(a.motivo) ? "avisoFerias" : "avisoDesmarcar");
                      }}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20"
                    >
                      Usar ausência: {a.motivo} · {de.slice(8, 10)}/{de.slice(5, 7)} a {a.dataFim.slice(8, 10)}/{a.dataFim.slice(5, 7)}
                    </button>
                  );
                })}
              </div>
            )}
            {avisoTipo === "avisoGeral" && avisoProfId === null && (
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Quem pediu o aviso
                <select
                  value={avisoSolic ?? ""}
                  onChange={ev => setAvisoSolic(ev.target.value ? Number(ev.target.value) : null)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">Coordenação</option>
                  {profsClinicos.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            {avisoTipo === "avisoGeral" && (
              <textarea
                value={recado}
                onChange={ev => setRecado(ev.target.value)}
                rows={3}
                placeholder="Ex.: Na próxima semana, por favor, não tragam alimentos para a terapia."
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
              />
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Previa texto={preencher(tpl(avisoTipo), {
              ...ROTULOS,
              profissional: avisoProfId !== null ? firstName(profById.get(avisoProfId)?.name ?? "") : "[profissional]",
              especialidade: avisoProfId !== null ? profById.get(avisoProfId)?.specialty ?? "" : "[especialidade]",
              periodo: periodoTexto,
              recado: recado.trim() || "[recado]",
              solicitante,
            })} />
            <p className="text-[11px] text-muted-foreground">
              {!avisoPronto
                ? avisoTipo === "avisoGeral" ? "Escreva o recado para montar a lista." : "Escolha o profissional para montar a lista."
                : avisoEnvios === null ? "Carregando a agenda..."
                : `${avisoEnvios.length} família(s) com atendimento nesses dias. A mensagem só avisa; a agenda não é alterada.`}
            </p>
            <button
              className={cn(btnVerde, "mt-auto")}
              disabled={!avisoPronto || !avisoEnvios || avisoEnvios.length === 0}
              onClick={() => setModal({ ...avisoLista, descricao: "Uma mensagem por paciente, com os dias e horários dele nesse período." })}
            >
              <Send className="w-4 h-4" /> Enviar aviso para as famílias ({avisoPronto ? avisoEnvios?.length ?? 0 : 0})
            </button>
          </div>
        </div>
      </AssistCard>

      {modal && (
        <EnvioEmMassaModal
          key={modal.listId}
          listId={modal.listId} titulo={modal.titulo} descricao={modal.descricao} envios={modalEnvios}
          onClose={() => setModal(null)}
          onEditarModelo={() => setEditandoModelo(modal.fonte)}
        />
      )}
      {editandoModelo && (
        <ModeloEditorModal
          id={editandoModelo}
          atual={tpl(editandoModelo)}
          onSalvar={t => salvarModelo(editandoModelo, t)}
          onClose={() => setEditandoModelo(null)}
        />
      )}
    </section>
  );
}

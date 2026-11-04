import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlarmClock, Bell, CalendarCheck, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Home, ImagePlus, Layers,
  ListChecks, LogOut, MapPin, Mic, Palette, Plus, RotateCcw, Search, Settings, User, X,
} from "lucide-react";
import { AgendaClaudiaAlarme } from "@/components/AgendaClaudiaAlarme";
import * as api from "@/lib/agenda-exec-rpc";
import { CATEGORIAS, categoria, type AgxCompromisso, type AgxInput, type AgxSessao, type Categoria, type Pessoa } from "@/lib/agenda-exec-rpc";
import { interpretarFrase, comandoVoz, intencaoLocal, type Interpretacao } from "@/lib/agenda-exec-voz";
import { entenderVoz, gravar, gravadorSuportado, liberarMicrofone, type Gravacao, type VozIA } from "@/lib/agenda-exec-ia";
import { ativarAvisos, assinaturaAtual, desativarAvisos, ehAndroid, ehIOS, instalado, pushSuportado } from "@/lib/agenda-exec-push";
import { APARENCIA_PADRAO, OPCOES_FUNDO, arquivoParaFoto, estiloFundo, useAparencia, type Aparencia } from "@/lib/agenda-exec-aparencia";
import { getCompanySession } from "@/lib/portal-session";

// Minha Agenda: app executivo próprio (sem o menu do sistema), com menu inferior e papel de parede por pessoa.

const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const horaTxt = (h: string | null) => h ?? "Dia todo";
const dataLonga = (iso: string) => format(parseISO(iso), "EEEE, d 'de' MMMM", { locale: ptBR });
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ANTES: [number | null, string][] = [[null, "Não avisar"], [0, "Na hora"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [120, "2 horas antes"]];
const erroTxt = (e: unknown) => (api.migracaoPendente(e) ? "A agenda ainda não foi ativada no servidor (migração 0133)." : (e as Error)?.message || "Algo deu errado. Tente de novo.");
const inicioMs = (c: { data: string; hora: string | null }) => Date.parse(`${c.data}T${c.hora ?? "23:59"}:00-03:00`);
function rotuloDia(iso: string, hoje: string) {
  if (iso === hoje) return "Hoje";
  if (iso === ISO(addDays(parseISO(hoje), 1))) return "Amanhã";
  if (iso === ISO(addDays(parseISO(hoje), -1))) return "Ontem";
  return cap1(format(parseISO(iso), "EEE, d 'de' MMM", { locale: ptBR }));
}

const glass = "agx-card rounded-3xl border border-white/10 p-4 shadow-[0_10px_30px_rgba(0,0,0,.35)]";
const btnBase = "rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-50";
const campo = "w-full h-12 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400/50";
const btnPrimario = `${btnBase} bg-gradient-to-r from-sky-500 to-violet-600 text-white shadow-lg shadow-violet-900/30`;
const btnSuave = `${btnBase} bg-white/[0.08] border border-white/15 text-white`;

type BeforeInstall = Event & { prompt: () => Promise<void> };
let installEvt: BeforeInstall | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e as BeforeInstall; });
}

function useManifestAgenda(nome: string, falar: boolean) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const icone = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const antes = { href: link?.getAttribute("href"), titulo: meta?.content, doc: document.title, icone: icone?.getAttribute("href") };
    icone?.setAttribute("href", "/icons/agenda-apple-touch.png");
    link?.setAttribute("href", falar ? "/manifest-falar.webmanifest" : "/manifest-agenda.webmanifest");
    if (meta) meta.content = falar ? "Falar" : "Minha Agenda";
    document.title = "Minha Agenda";
    return () => {
      if (link && antes.href) link.setAttribute("href", antes.href);
      if (meta && antes.titulo) meta.content = antes.titulo;
      if (icone && antes.icone) icone.setAttribute("href", antes.icone);
      document.title = antes.doc;
    };
  }, [nome, falar]);
}

const CSS = `
  .agenda-executiva { font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; overflow-wrap: break-word; hyphens: manual; -webkit-tap-highlight-color: transparent; }
  .agenda-executiva .agx-card { background: rgba(13,20,56,var(--agx-op,.55)); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); } .agenda-executiva .agx-card .agx-card { backdrop-filter: none; -webkit-backdrop-filter: none; }
  .agenda-executiva .agx-brilho { box-shadow: 0 0 0 1px rgba(139,92,246,.35), 0 8px 28px rgba(76,29,149,.35); }
  .agenda-executiva input[type=range] { accent-color: #8b5cf6; }
  .agenda-executiva .agx-onda span { width: 3px; border-radius: 3px; background: currentColor; opacity: .75; }
  .agenda-executiva .agx-ouvindo .agx-onda span { animation: agx-onda 1s ease-in-out infinite; }
  @keyframes agx-onda { 0%,100% { transform: scaleY(.45); } 50% { transform: scaleY(1); } }
  @keyframes agx-entrar { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .agenda-executiva .agx-entrar { animation: agx-entrar .25s ease-out; }
  @media (prefers-reduced-motion: reduce) { .agenda-executiva * { animation: none !important; transition: none !important; } }
`;

function Fundo({ children, ap = APARENCIA_PADRAO, foto = null }: { children: React.ReactNode; ap?: Aparencia; foto?: string | null }) {
  const { imagem, veu } = estiloFundo(ap, foto);
  const letra = ap.letra ?? APARENCIA_PADRAO.letra;
  useEffect(() => {
    const html = document.documentElement, antes = html.style.fontSize;
    html.style.fontSize = `${letra}%`;
    return () => { html.style.fontSize = antes; };
  }, [letra]);
  return (
    <div className="agenda-executiva isolate relative min-h-dvh text-white text-base" style={{ ["--agx-op" as string]: String(ap.cartoes / 100) }}>
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#050b24]">
        <div className="absolute inset-0" style={imagem} />
        <div className="absolute inset-0" style={veu} />
      </div>
      <style>{CSS}</style>
      <div className="relative mx-auto w-full max-w-xl md:max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">{children}</div>
    </div>
  );
}

function Titulo({ nome }: { nome: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 agx-brilho shrink-0"><CalendarCheck size={24} /></span>
      <span className="min-w-0">
        <span className="block text-xl font-bold tracking-tight leading-tight">Minha Agenda</span>
        <span className="block text-base text-violet-200/90 leading-tight">{nome}</span>
      </span>
    </div>
  );
}

export default function AgendaClaudia() {
  const [sessao, setSessao] = useState<AgxSessao | null>(() => api.getSessao());
  const falar = window.location.pathname.replace(/\/+$/, "").endsWith("/falar");
  useManifestAgenda(sessao ? primeiroNome(sessao.dona.nome) : "Cláudia", falar);
  const sair = useCallback(() => { void api.sair(); setSessao(null); }, []);
  if (!sessao) return <Fundo><Entrada onEntrou={setSessao} /></Fundo>;
  return <Logada key={sessao.usuario.id} sessao={sessao} falar={falar} onSair={sair} />;
}

type AparenciaCtl = ReturnType<typeof useAparencia>;
function Logada({ sessao, falar, onSair }: { sessao: AgxSessao; falar: boolean; onSair: () => void }) {
  const aparencia = useAparencia(sessao.usuario.id);
  return (
    <Fundo ap={aparencia.ap} foto={aparencia.foto}>
      {falar ? <TelaFalar sessao={sessao} onSair={onSair} /> : <Agenda sessao={sessao} onSair={onSair} aparencia={aparencia} />}
    </Fundo>
  );
}

// ---------------------------------------------------------------- entrada por PIN
function Entrada({ onEntrou }: { onEntrou: (s: AgxSessao) => void }) {
  const slug = api.slugDoAparelho();
  const [pessoas, setPessoas] = useState<(Pessoa & { donaNome: string })[] | null>(null);
  const [erro, setErro] = useState("");
  const [escolhida, setEscolhida] = useState<Pessoa | null>(null);
  const carregar = useCallback(() => {
    api.listarPessoas(slug).then(setPessoas).catch((e) => { setPessoas([]); setErro(erroTxt(e)); });
  }, [slug]);
  useEffect(carregar, [carregar]);

  if (escolhida) return <PinPad pessoa={escolhida} slug={slug} onVoltar={() => setEscolhida(null)} onEntrou={onEntrou} />;
  const nomeDona = pessoas?.find((p) => p.papel === "dona")?.nome ?? "Cláudia";
  return (
    <div className="space-y-5">
      <Titulo nome={primeiroNome(nomeDona)} />
      <div className={glass}>
        {pessoas === null ? <p className="text-base">Carregando…</p>
          : erro ? <p className="text-base text-rose-300">{erro}</p>
          : pessoas.length === 0 ? <PrimeiroAcesso onCriado={carregar} />
          : (
            <>
              <p className="text-lg font-semibold mb-4">Quem está usando?</p>
              <div className="grid gap-3">
                {pessoas.map((p) => (
                  <button key={p.id} onClick={() => setEscolhida(p)} className={`${btnBase} h-14 text-lg ${p.papel === "dona" ? "bg-gradient-to-br from-sky-500 to-violet-600" : "bg-white/10 border border-white/20"}`}>
                    {p.nome}{p.papel === "gestora" && <span className="block text-base font-semibold text-white/70">autorizada por {primeiroNome(p.donaNome)}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
      </div>
      {getCompanySession() && <a href="/" className="block text-center text-white/70 underline text-sm">← Voltar ao NFs</a>}
    </div>
  );
}

function PinPad({ pessoa, slug, onVoltar, onEntrou }: { pessoa: Pessoa; slug: string; onVoltar: () => void; onEntrou: (s: AgxSessao) => void }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const entrar = async () => {
    if (pin.length < 4) { setMsg("Digite seu PIN (4 a 6 números)."); return; }
    setOcupado(true);
    try {
      const r = await api.entrar(slug, pessoa.id, pin);
      if ("erro" in r) {
        setPin("");
        setMsg(r.erro === "bloqueado" ? "Muitas tentativas. Tente de novo daqui a 15 minutos." : "PIN incorreto. Tente de novo.");
      } else onEntrou(r);
    } catch (e) { setMsg(erroTxt(e)); } finally { setOcupado(false); }
  };
  const tecla = (t: string) => { setMsg(""); setPin((p) => (t === "<" ? p.slice(0, -1) : p.length < 6 ? p + t : p)); };
  return (
    <div className="space-y-5 max-w-md mx-auto">
      <Titulo nome={primeiroNome(pessoa.papel === "dona" ? pessoa.nome : "Cláudia")} />
      <div className={`${glass} text-center`}>
        <p className="text-lg font-semibold">Olá, {primeiroNome(pessoa.nome)}!</p>
        <p className="text-sm text-white/70">Digite seu PIN</p>
        <div className="flex justify-center gap-3 my-5" aria-label={`${pin.length} números digitados`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={`w-5 h-5 rounded-full ${i < pin.length ? "bg-sky-300" : "bg-white/20"}`} />)}
        </div>
        {msg && <p className="text-sm text-rose-300 mb-3" role="alert">{msg}</p>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "<", "0"].map((t) => (
            <button key={t} onClick={() => tecla(t)} aria-label={t === "<" ? "Apagar" : t} className={`${btnBase} h-14 text-2xl bg-white/10 border border-white/15`}>{t === "<" ? "⌫" : t}</button>
          ))}
          <button onClick={entrar} disabled={ocupado} className={`${btnBase} h-14 text-lg bg-green-500 text-green-950`}>Entrar</button>
        </div>
        <button onClick={onVoltar} className="mt-5 text-sm text-white/70 underline">Voltar</button>
      </div>
    </div>
  );
}

function PrimeiroAcesso({ onCriado }: { onCriado: () => void }) {
  const [nome, setNome] = useState("Cláudia");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const admin = getCompanySession()?.adminToken;
  const criar = async () => {
    if (!/^\d{4,6}$/.test(pin)) { setMsg("O PIN deve ter de 4 a 6 números."); return; }
    if (pin !== pin2) { setMsg("Os dois PINs não são iguais."); return; }
    try { await api.criarDona(nome.trim(), pin); onCriado(); } catch (e) { setMsg(erroTxt(e)); }
  };
  return (
    <div className="space-y-4">
      <p className="text-lg font-semibold">Primeiro acesso: criar a agenda</p>
      {!admin ? <p className="text-base text-rose-300">A Administração precisa entrar no NFs neste aparelho para criar a agenda.</p> : (
        <>
          <p className="text-sm text-white/70">Só a dona da agenda vai saber este PIN. Depois ela pode autorizar outra pessoa (ex.: a Natali) com outro PIN.</p>
          <label className="block"><span className="text-sm font-bold">Nome da dona da agenda</span><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="block"><span className="text-sm font-bold">PIN (4 a 6 números)</span><input className={campo} inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
          <label className="block"><span className="text-sm font-bold">Repita o PIN</span><input className={campo} inputMode="numeric" type="password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></label>
          {msg && <p className="text-sm text-rose-300">{msg}</p>}
          <button onClick={criar} className={`${btnBase} w-full h-12 text-lg bg-green-500 text-green-950`}>Criar agenda</button>
        </>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- agenda
type Aba = "inicio" | "agenda" | "tarefas" | "alarmes" | "perfil";
type Vista = "dia" | "semana" | "mes";
const conflitos = (c: AgxCompromisso, l: AgxCompromisso[]) =>
  !c.concluido && c.hora != null && l.some((o) => o.id !== c.id && o.data === c.data && !o.concluido && o.hora != null && Math.abs(toMin(o.hora) - toMin(c.hora!)) < 60);

function Agenda({ sessao, onSair, aparencia }: { sessao: AgxSessao; onSair: () => void; aparencia: AparenciaCtl }) {
  const dona = primeiroNome(sessao.dona.nome);
  const souDona = sessao.usuario.papel === "dona";
  const hoje = ISO(new Date());
  const [aba, setAbaSt] = useState<Aba>("inicio");
  const [lista, setLista] = useState<AgxCompromisso[]>([]);
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [diaSel, setDiaSel] = useState(hoje);
  const [vista, setVista] = useState<Vista>("mes");
  const [filtro, setFiltro] = useState<Categoria | null>(null);
  const [busca, setBusca] = useState("");
  const [folha, setFolha] = useState<null | "categorias" | "aparencia">(null);
  const [form, setForm] = useState<AgxInput | null>(null);
  const [aviso, setAviso] = useState("");
  const [erroGeral, setErroGeral] = useState("");
  const [gravando, setGravando] = useState(false);
  const trava = useRef(false);

  const setAba = (a: Aba) => { setAbaSt(a); window.scrollTo({ top: 0 }); };
  const avisar = useCallback((t: string) => { setAviso(t); window.setTimeout(() => setAviso(""), 4000); }, []);
  const falhou = useCallback((e: unknown) => { if (api.sessaoInvalida(e)) onSair(); else avisar(erroTxt(e)); }, [onSair, avisar]);

  const carregar = useCallback(() => {
    const de = [ISO(addDays(startOfMonth(mes), -7)), ISO(addDays(new Date(), -30))].sort()[0];
    const ate = [ISO(addDays(endOfMonth(mes), 40)), ISO(addDays(new Date(), 14))].sort()[1];
    api.listar(de, ate).then((l) => { setLista(l); setErroGeral(""); }).catch((e) => { if (api.sessaoInvalida(e)) onSair(); else setErroGeral(erroTxt(e)); });
  }, [mes, onSair]);
  useEffect(carregar, [carregar]);
  useEffect(() => { const t = window.setInterval(carregar, 60_000); return () => window.clearInterval(t); }, [carregar]);

  const porDia = useMemo(() => {
    const m = new Map<string, AgxCompromisso[]>();
    for (const c of lista) m.set(c.data, [...(m.get(c.data) ?? []), c]);
    return m;
  }, [lista]);
  const doDia = useCallback((d: string) => (porDia.get(d) ?? []).filter((c) => !filtro || c.categoria === filtro), [porDia, filtro]);
  const deHoje = porDia.get(hoje) ?? [];
  const agora = Date.now();
  const restantesHoje = deHoje.filter((c) => !c.concluido && inicioMs(c) >= agora).length;
  const proximo = useMemo(() => lista.filter((c) => !c.concluido && inicioMs(c) >= Date.now()).sort((a, b) => inicioMs(a) - inicioMs(b))[0] ?? null, [lista]);

  const novo = (data = diaSel, extra: Partial<AgxInput> = {}): AgxInput => novoCompromisso(data, extra);
  const salvar = async (c: AgxInput) => {
    if (trava.current) return;
    trava.current = true; setGravando(true); setErroGeral("");
    try {
      await api.salvar(c);
      setForm(null); setDiaSel(c.data); setMes(startOfMonth(parseISO(c.data)));
      avisar("Compromisso salvo"); carregar();
    } catch (e) { falhou(e); } finally { trava.current = false; setGravando(false); }
  };
  const concluir = async (id: number, v: boolean) => {
    try { await api.concluir(id, v); setForm(null); carregar(); avisar(v ? "Marcado como concluído" : "Reaberto"); } catch (e) { falhou(e); }
  };
  const excluir = async (id: number) => {
    try { await api.excluir(id); setForm(null); carregar(); avisar("Compromisso excluído"); } catch (e) { falhou(e); }
  };
  const irFalar = () => { window.location.href = "/agenda-claudia/falar"; };
  const abrirDia = (d: string) => { setDiaSel(d); setVista("dia"); setAba("agenda"); };

  return (
    <div className="space-y-4 agx-entrar" key={aba}>
      {erroGeral && <div className={`${glass} text-sm text-rose-200`} role="alert">{erroGeral}</div>}

      {aba === "inicio" && <Inicio sessao={sessao} dona={dona} hoje={hoje} deHoje={deHoje} restantesHoje={restantesHoje} proximo={proximo}
        mes={mes} setMes={setMes} doDia={doDia} lista={lista}
        onAba={setAba} onNovo={() => setForm(novo(hoje))} onCategorias={() => setFolha("categorias")} onAbrir={setForm} onDia={abrirDia} onFalar={irFalar} letra={aparencia.ap.letra ?? APARENCIA_PADRAO.letra}
        onLetra={() => { const l = aparencia.ap.letra ?? APARENCIA_PADRAO.letra; aparencia.mudar({ letra: l < 112 ? 112 : l < 125 ? 125 : l < 140 ? 140 : 100 }); }} />}

      {aba === "agenda" && (
        <div className="space-y-4">
          <CabecalhoAba titulo="Agenda" acao={<button onClick={() => setForm(novo(diaSel))} className={`${btnPrimario} h-10 px-4 text-sm inline-flex items-center gap-1.5`}><Plus size={16} /> Novo</button>} />
          <div className={`${glass} space-y-3`}>
            <label className="relative block">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
              <input className={`${campo} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, local, data ou horário" aria-label="Buscar compromisso" />
            </label>
            <FiltroCategorias filtro={filtro} setFiltro={setFiltro} />
            {!busca.trim() && <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.06] p-1">
              {(["dia", "semana", "mes"] as const).map((v) => (
                <button key={v} onClick={() => setVista(v)} className={`h-9 rounded-xl text-sm font-semibold transition ${vista === v ? "bg-gradient-to-r from-sky-500 to-violet-600 shadow" : "text-white/75"}`}>{v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}</button>
              ))}
            </div>}
          </div>
          {busca.trim() ? <Resultados lista={lista} busca={busca} filtro={filtro} hoje={hoje} onAbrir={setForm} />
            : vista === "mes" ? (
              <div className={`${glass} space-y-4`}>
                <Mes mes={mes} setMes={setMes} diaSel={diaSel} onDia={setDiaSel} doDia={doDia} hoje={hoje} />
                <ListaDia titulo={rotuloDia(diaSel, hoje) === "Hoje" ? "Hoje" : cap1(dataLonga(diaSel))} itens={doDia(diaSel)} lista={lista} onAbrir={setForm} onNovo={() => setForm(novo(diaSel))} />
              </div>
            ) : vista === "semana" ? (
              <div className={glass}><Semana base={diaSel} setBase={setDiaSel} onDia={(d) => { setDiaSel(d); setVista("dia"); }} doDia={doDia} hoje={hoje} /></div>
            ) : (
              <div className={glass}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button aria-label="Dia anterior" onClick={() => setDiaSel(ISO(addDays(parseISO(diaSel), -1)))} className={`${btnSuave} w-10 h-10 grid place-items-center`}><ChevronLeft size={18} /></button>
                  <p className="font-semibold text-center">{cap1(dataLonga(diaSel))}{diaSel === hoje && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-sky-500/30">Hoje</span>}</p>
                  <button aria-label="Próximo dia" onClick={() => setDiaSel(ISO(addDays(parseISO(diaSel), 1)))} className={`${btnSuave} w-10 h-10 grid place-items-center`}><ChevronRight size={18} /></button>
                </div>
                <ListaDia itens={doDia(diaSel)} lista={lista} onAbrir={setForm} onNovo={() => setForm(novo(diaSel))} />
              </div>
            )}
        </div>
      )}

      {aba === "tarefas" && <Tarefas lista={lista} hoje={hoje} onAbrir={setForm} onConcluir={concluir} onNovo={() => setForm(novo(hoje))} />}

      {aba === "alarmes" && (
        <div className="space-y-4">
          <CabecalhoAba titulo="Alarmes e lembretes" />
          <PainelAvisos sessao={sessao} avisar={avisar} />
          {souDona && <AgendaClaudiaAlarme donaId={sessao.dona.id} compromissos={lista} />}
          <AvisosProgramados lista={lista} hoje={hoje} />
        </div>
      )}

      {aba === "perfil" && (
        <div className="space-y-4">
          <CabecalhoAba titulo="Perfil e configurações" />
          <div className={`${glass} flex items-center gap-4`}>
            <span className="grid place-items-center w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-xl font-bold shrink-0">{primeiroNome(sessao.usuario.nome).charAt(0)}</span>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{sessao.usuario.nome}</p>
              <p className="text-sm text-white/65">{souDona ? "Dona da agenda" : `Autorizada na agenda de ${dona}`}</p>
            </div>
          </div>
          <button onClick={() => setFolha("aparencia")} className={`${glass} w-full flex items-center gap-3 text-left`}>
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-violet-500/25 shrink-0"><Palette size={20} /></span>
            <span className="flex-1 min-w-0"><span className="block font-semibold">Personalizar aparência</span><span className="block text-sm text-white/65">Papel de parede, brilho, desfoque e cartões</span></span>
            <ChevronRight size={18} className="text-white/50" />
          </button>
          {souDona && <PainelAcessos avisar={avisar} falhou={falhou} />}
          <PainelHistorico lista={lista} />
          <div className="grid grid-cols-2 gap-3">
            {getCompanySession() ? <a href="/" className={`${btnSuave} h-12 grid place-items-center text-sm`}>Voltar ao NFs</a> : <span />}
            <button onClick={onSair} className={`${btnSuave} h-12 text-sm inline-flex items-center justify-center gap-2`}><LogOut size={16} /> Sair</button>
          </div>
        </div>
      )}

      <MenuInferior aba={aba} setAba={setAba} />

      {folha === "categorias" && <FolhaCategorias lista={lista} hoje={hoje} onFechar={() => setFolha(null)}
        onEscolher={(c) => { setFiltro(c); setBusca(""); setVista("mes"); setFolha(null); setAba("agenda"); }} />}
      {folha === "aparencia" && <PainelAparencia ctl={aparencia} onFechar={() => setFolha(null)} />}
      {form && <Formulario salvando={gravando} erroSalvar={erroGeral} inicial={form} lista={lista} onFechar={() => setForm(null)} onSalvar={salvar}
        onConcluir={concluir} onExcluir={excluir} />}
      {aviso && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 inline-flex items-center gap-2 rounded-2xl bg-[#111a46]/95 border border-white/15 px-5 py-3 text-sm font-semibold shadow-2xl"><Check size={16} className="text-emerald-300" />{aviso}</div>}
    </div>
  );
}

function CabecalhoAba({ titulo, acao }: { titulo: string; acao?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 pt-1"><h2 className="text-2xl font-bold tracking-tight">{titulo}</h2>{acao}</div>;
}

function Inicio({ sessao, dona, hoje, deHoje, restantesHoje, proximo, mes, setMes, doDia, lista, onAba, onNovo, onCategorias, onAbrir, onDia, onFalar, letra, onLetra }: {
  letra: number; onLetra: () => void;
  sessao: AgxSessao; dona: string; hoje: string; deHoje: AgxCompromisso[]; restantesHoje: number; proximo: AgxCompromisso | null;
  mes: Date; setMes: (d: Date) => void; doDia: (d: string) => AgxCompromisso[]; lista: AgxCompromisso[];
  onAba: (a: Aba) => void; onNovo: () => void; onCategorias: () => void; onAbrir: (c: AgxCompromisso) => void; onDia: (d: string) => void; onFalar: () => void;
}) {
  const h = new Date().getHours();
  const saudacao = `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, ${primeiroNome(sessao.usuario.nome)}!`;
  const d = new Date();
  const pendHoje = deHoje.filter((c) => !c.concluido);
  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <Titulo nome={dona} />
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onLetra} aria-label={`Tamanho das letras: ${letra}%. Toque para mudar`} className="grid place-items-center w-11 h-11 rounded-full agx-card border border-white/15 font-bold leading-none">
            <span><span className="text-sm">A</span><span className="text-lg">A</span></span>
          </button>
          <button onClick={() => onAba("alarmes")} aria-label={`Alarmes${restantesHoje ? `: ${restantesHoje} hoje` : ""}`} className="relative grid place-items-center w-11 h-11 rounded-full agx-card border border-white/15">
            <Bell size={19} />{restantesHoje > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-[0.8rem] font-bold grid place-items-center">{restantesHoje}</span>}
          </button>
          <button onClick={() => onAba("perfil")} aria-label="Configurações" className="grid place-items-center w-11 h-11 rounded-full agx-card border border-white/15"><Settings size={19} /></button>
        </div>
      </header>

      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 border-l-2 border-sky-400/80 pl-3">
          <p className="text-[1.9rem] sm:text-4xl font-bold leading-tight tracking-tight">{saudacao}</p>
          <p className="text-base text-white/80 mt-1">{restantesHoje > 0 ? `Você ainda tem ${restantesHoje} ${restantesHoje === 1 ? "compromisso" : "compromissos"} hoje.` : "Sua agenda está organizada e pronta para o seu dia."}</p>
        </div>
        <div className={`${glass} !p-3 min-w-[6.5rem] text-center agx-brilho whitespace-nowrap`}>
          <p className="text-xs font-semibold tracking-wider uppercase text-white/80">{format(d, "EEEE", { locale: ptBR })}</p>
          <p className="text-4xl font-bold leading-none my-1 tabular-nums">{format(d, "dd")}</p>
          <p className="text-[0.8rem] font-medium uppercase text-violet-200">{format(d, "MMM", { locale: ptBR })} | {format(d, "yyyy")}</p>
        </div>
      </section>

      <button onClick={() => (proximo ? onAbrir(proximo) : onNovo())} className={`${glass} agx-brilho w-full flex items-center gap-3 text-left !bg-gradient-to-r from-violet-600/45 to-sky-600/25`}>
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-white/10 shrink-0"><CalendarCheck size={24} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-white/75">Próximo compromisso</span>
          {proximo ? <>
            <span className="block text-lg font-semibold leading-snug break-words">{proximo.titulo}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
              <span className="inline-flex items-center gap-1"><Clock size={14} />{rotuloDia(proximo.data, hoje)}, {horaTxt(proximo.hora)}</span>
              {proximo.local && <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={14} className="shrink-0" />{proximo.local}</span>}
              {proximo.categoria === "urgente" && <span className="rounded-full px-2 py-0.5 text-xs bg-rose-500/35">Urgente</span>}
            </span>
          </> : <span className="block text-base font-semibold">Nenhum compromisso marcado. Toque para criar.</span>}
        </span>
        <ChevronRight size={20} className="text-white/60 shrink-0" />
      </button>

      <section className="grid grid-cols-1 gap-3">
        <div className={`${glass} !p-3`}><Mes mes={mes} setMes={setMes} diaSel={hoje} onDia={onDia} doDia={doDia} hoje={hoje} /></div>
        <div className={`${glass} !p-3 flex flex-col`}>
          <p className="flex items-center gap-1.5 text-base font-semibold"><CalendarCheck size={16} /> Hoje</p>
          <p className="text-sm text-sky-300 mb-2 whitespace-nowrap">{pendHoje.length} {pendHoje.length === 1 ? "compromisso" : "compromissos"}</p>
          {pendHoje.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-2">
              <span className="grid place-items-center w-12 h-12 rounded-full border border-violet-300/60 agx-brilho"><Check size={22} /></span>
              <p className="text-sm text-white/80 leading-snug">Você está livre hoje! Aproveite seu tempo.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {pendHoje.slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => onAbrir(c)} className="w-full text-left rounded-xl bg-white/[0.06] px-3 py-2 border-l-4 flex items-baseline gap-3" style={{ borderColor: categoria(c.categoria).cor }}>
                  <span className="text-base font-semibold text-sky-200 tabular-nums shrink-0">{horaTxt(c.hora)}</span>
                  <span className="text-base font-semibold leading-snug line-clamp-2">{c.titulo}</span>
                </button>
              ))}
              {pendHoje.length > 4 && <button onClick={() => onDia(hoje)} className="text-xs text-sky-300 underline">+ {pendHoje.length - 4} no dia</button>}
            </div>
          )}
        </div>
      </section>

      <button onClick={onNovo} className={`${glass} w-full !py-3 flex items-center justify-center gap-2 text-lg font-semibold`}><Plus size={22} /> Novo compromisso</button>
      <BarraMicrofone onClick={onFalar} />
      {lista.length === 0 && <p className="text-center text-xs text-white/50">Carregando sua agenda…</p>}
    </>
  );
}

function BarraMicrofone({ onClick }: { onClick: () => void }) {
  const onda = (n: number) => <span className="agx-onda flex items-center gap-[3px] h-8" aria-hidden>{Array.from({ length: n }, (_, i) => <span key={i} style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${i * 0.08}s` }} />)}</span>;
  return (
    <button onClick={onClick} aria-label="Falar para organizar a agenda" className={`${glass} w-full !rounded-[2rem] !py-3 flex flex-col items-center gap-1.5`}>
      <span className="flex items-center justify-center gap-4">
        <span className="text-sky-300 hidden min-[360px]:flex">{onda(9)}</span>
        <span className="grid place-items-center w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-violet-600 shadow-[0_0_0_6px_rgba(99,102,241,.18),0_0_24px_rgba(139,92,246,.55)]"><Mic size={24} /></span>
        <span className="text-violet-300 hidden min-[360px]:flex">{onda(9)}</span>
      </span>
      <span className="text-base text-white/85">Toque e fale para organizar sua agenda</span>
    </button>
  );
}

function MenuInferior({ aba, setAba }: { aba: Aba; setAba: (a: Aba) => void }) {
  const itens: [Aba, string, React.ReactNode][] = [
    ["inicio", "Início", <Home size={20} />], ["agenda", "Agenda", <CalendarCheck size={20} />], ["tarefas", "Tarefas", <ListChecks size={20} />],
    ["alarmes", "Alarmes", <AlarmClock size={20} />], ["perfil", "Perfil", <User size={20} />],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))]" aria-label="Menu">
      <div className="agx-card mx-auto max-w-xl grid grid-cols-5 gap-1 rounded-3xl border border-white/10 p-1.5 shadow-[0_-6px_30px_rgba(0,0,0,.4)]" style={{ background: "rgba(10,16,48,.88)" }}>
        {itens.map(([id, t, ic]) => (
          <button key={id} onClick={() => setAba(id)} aria-current={aba === id ? "page" : undefined}
            className={`h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[0.8rem] font-medium transition ${aba === id ? "bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-lg" : "text-white/70"}`}>
            {ic}{t}
          </button>
        ))}
      </div>
    </nav>
  );
}

function FiltroCategorias({ filtro, setFiltro }: { filtro: Categoria | null; setFiltro: (c: Categoria | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar por categoria">
      <button onClick={() => setFiltro(null)} className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border ${!filtro ? "bg-white text-slate-900 border-white" : "border-white/20 text-white/80"}`}>Todas</button>
      {CATEGORIAS.map((c) => (
        <button key={c.id} onClick={() => setFiltro(filtro === c.id ? null : c.id)} className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 ${filtro === c.id ? "text-white" : "border-white/20 text-white/80"}`}
          style={filtro === c.id ? { background: c.cor, borderColor: c.cor } : undefined}><i className="w-2 h-2 rounded-full" style={{ background: filtro === c.id ? "#fff" : c.cor }} />{c.nome}</button>
      ))}
    </div>
  );
}

function ListaDia({ titulo, itens, lista, onAbrir, onNovo }: { titulo?: string; itens: AgxCompromisso[]; lista: AgxCompromisso[]; onAbrir: (c: AgxCompromisso) => void; onNovo: () => void }) {
  return (
    <div className="space-y-2">
      {titulo && <p className="font-semibold">{titulo}</p>}
      {itens.length === 0 ? <p className="text-sm text-white/60 py-2">Nenhum compromisso neste dia.</p> : itens.map((c) => <Item key={c.id} c={c} conflito={conflitos(c, lista)} onClick={() => onAbrir(c)} />)}
      <button onClick={onNovo} className={`${btnSuave} w-full h-11 text-sm inline-flex items-center justify-center gap-1.5`}><Plus size={16} /> Adicionar neste dia</button>
    </div>
  );
}

function Resultados({ lista, busca, filtro, hoje, onAbrir }: { lista: AgxCompromisso[]; busca: string; filtro: Categoria | null; hoje: string; onAbrir: (c: AgxCompromisso) => void }) {
  const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = sem(busca.trim());
  const achados = lista.filter((c) => (!filtro || c.categoria === filtro) &&
    [c.titulo, c.local ?? "", c.observacao ?? "", format(parseISO(c.data), "dd/MM"), format(parseISO(c.data), "d 'de' MMMM", { locale: ptBR }), c.hora ?? ""].some((v) => sem(v).includes(q)));
  return (
    <div className={`${glass} space-y-2`}>
      <p className="text-sm text-white/70">{achados.length} {achados.length === 1 ? "resultado" : "resultados"}</p>
      {achados.map((c) => <div key={c.id}><p className="text-xs text-white/60 mt-2 mb-1">{rotuloDia(c.data, hoje)} · {format(parseISO(c.data), "dd/MM")}</p><Item c={c} onClick={() => onAbrir(c)} /></div>)}
    </div>
  );
}

function Tarefas({ lista, hoje, onAbrir, onConcluir, onNovo }: { lista: AgxCompromisso[]; hoje: string; onAbrir: (c: AgxCompromisso) => void; onConcluir: (id: number, v: boolean) => void; onNovo: () => void }) {
  const [verFeitos, setVerFeitos] = useState(false);
  const ord = (a: AgxCompromisso, b: AgxCompromisso) => inicioMs(a) - inicioMs(b);
  const pend = lista.filter((c) => !c.concluido).sort(ord);
  const feitos = lista.filter((c) => c.concluido).sort((a, b) => ord(b, a));
  const linha = (c: AgxCompromisso) => (
    <div key={c.id} className="flex items-center gap-2 rounded-2xl bg-white/[0.05] border border-white/10 p-2.5">
      <button onClick={() => onConcluir(c.id, !c.concluido)} aria-label={c.concluido ? "Reabrir" : "Marcar como concluído"} className="grid place-items-center w-10 h-10 shrink-0 text-violet-200">
        {c.concluido ? <CheckCircle2 size={24} className="text-emerald-300" /> : <Circle size={24} />}
      </button>
      <button onClick={() => onAbrir(c)} className="flex-1 min-w-0 text-left">
        <span className={`block font-semibold leading-snug break-words ${c.concluido ? "line-through text-white/50" : ""}`}>{c.titulo}</span>
        <span className="block text-xs text-white/65">
          {c.data < hoje && !c.concluido && <b className="text-rose-300">Atrasado · </b>}{rotuloDia(c.data, hoje)} · {horaTxt(c.hora)}{c.local ? ` · ${c.local}` : ""}
        </span>
      </button>
      <i className="w-2.5 h-2.5 rounded-full shrink-0 mr-1" style={{ background: categoria(c.categoria).cor }} />
    </div>
  );
  return (
    <div className="space-y-4">
      <CabecalhoAba titulo="Tarefas" acao={<button onClick={onNovo} className={`${btnPrimario} h-10 px-4 text-sm inline-flex items-center gap-1.5`}><Plus size={16} /> Nova</button>} />
      <div className={`${glass} space-y-2`}>
        <p className="text-sm text-white/70">{pend.length} pendentes</p>
        {pend.length === 0 ? <p className="text-sm text-white/60 py-2">Tudo em dia.</p> : pend.map(linha)}
      </div>
      {feitos.length > 0 && <div className={`${glass} space-y-2`}>
        <button onClick={() => setVerFeitos(!verFeitos)} className="w-full flex justify-between items-center text-sm font-semibold"><span>Concluídos ({feitos.length})</span><ChevronRight size={16} className={verFeitos ? "rotate-90" : ""} /></button>
        {verFeitos && feitos.slice(0, 50).map(linha)}
      </div>}
    </div>
  );
}

function AvisosProgramados({ lista, hoje }: { lista: AgxCompromisso[]; hoje: string }) {
  const limite = ISO(addDays(parseISO(hoje), 8));
  const agora = Date.now();
  const avisos: { em: number; tipo: string; c: AgxCompromisso }[] = [];
  for (const c of lista) {
    if (c.concluido || c.data < hoje || c.data > limite) continue;
    const base = Date.parse(`${c.data}T00:00:00-03:00`);
    if (c.avisarVespera) avisos.push({ em: base - 6 * 3600_000, tipo: "Véspera, 18:00", c });
    if (c.avisarDia) avisos.push({ em: base + 7 * 3600_000, tipo: "No dia, 07:00", c });
    if (c.hora && c.antecedenciaMin != null) {
      const ini = inicioMs(c);
      if (c.antecedenciaMin > 0) avisos.push({ em: ini - c.antecedenciaMin * 60_000, tipo: c.antecedenciaMin >= 60 ? `${c.antecedenciaMin / 60} h antes` : `${c.antecedenciaMin} min antes`, c });
      avisos.push({ em: ini, tipo: "Na hora", c });
    }
  }
  const prox = avisos.filter((a) => a.em >= agora).sort((a, b) => a.em - b.em).slice(0, 20);
  return (
    <div className={`${glass} space-y-2`}>
      <p className="font-semibold">Próximos avisos programados</p>
      <p className="text-xs text-white/60">Enviados pelo servidor para os celulares com avisos ativos.</p>
      {prox.length === 0 ? <p className="text-sm text-white/60 py-1">Nenhum aviso nos próximos dias.</p> : prox.map((a, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2">
          <span className="text-xs tabular-nums text-sky-200 w-24 shrink-0">{rotuloDia(ISO(new Date(a.em)), hoje)} {format(new Date(a.em), "HH:mm")}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug break-words">{a.c.titulo}</span><span className="block text-[0.8rem] text-white/60">{a.tipo}</span></span>
        </div>
      ))}
    </div>
  );
}

function FolhaCategorias({ lista, hoje, onFechar, onEscolher }: { lista: AgxCompromisso[]; hoje: string; onFechar: () => void; onEscolher: (c: Categoria | null) => void }) {
  return (
    <Folha titulo="Categorias" onFechar={onFechar}>
      <div className="space-y-2">
        {CATEGORIAS.map((c) => {
          const n = lista.filter((x) => x.categoria === c.id && !x.concluido && x.data >= hoje).length;
          return (
            <button key={c.id} onClick={() => onEscolher(c.id)} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.05] border border-white/10 p-3 text-left">
              <i className="w-3.5 h-3.5 rounded-full" style={{ background: c.cor, boxShadow: `0 0 12px ${c.cor}` }} />
              <span className="flex-1 font-medium">{c.nome}</span>
              <span className="text-sm text-white/60">{n} {n === 1 ? "próximo" : "próximos"}</span><ChevronRight size={16} className="text-white/40" />
            </button>
          );
        })}
        <button onClick={() => onEscolher(null)} className={`${btnSuave} w-full h-11 text-sm`}>Ver todas</button>
      </div>
    </Folha>
  );
}

function Deslizar({ rotulo, valor, min, max, onChange, sufixo = "" }: { rotulo: string; valor: number; min: number; max: number; onChange: (v: number) => void; sufixo?: string }) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm"><span>{rotulo}</span><span className="text-white/60 tabular-nums">{valor}{sufixo}</span></span>
      <input type="range" min={min} max={max} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-8" />
    </label>
  );
}

function PainelAparencia({ ctl, onFechar }: { ctl: AparenciaCtl; onFechar: () => void }) {
  const { ap, foto, sync, mudar, definirFoto, restaurar } = ctl;
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const temImagem = ap.fundo === "foto" || ap.fundo.startsWith("img:");
  const grupos = ["Degradês", "Abstratos", "Florais", "Paisagens", "Cores"] as const;
  const escolherFoto = async (f: File | undefined) => {
    if (!f) return;
    setErro(""); setLendo(true);
    try { definirFoto(await arquivoParaFoto(f)); } catch (e) { setErro((e as Error).message); } finally { setLendo(false); }
  };
  const tile = (id: string, nome: string, estilo: React.CSSProperties) => (
    <button key={id} onClick={() => mudar({ fundo: id })} aria-pressed={ap.fundo === id} title={nome}
      className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 ${ap.fundo === id ? "border-sky-300 agx-brilho" : "border-white/10"}`}>
      <span className="absolute inset-0" style={estilo} />
      <span className="absolute inset-x-0 bottom-0 bg-black/45 text-xs leading-tight px-1 py-0.5 truncate">{nome}</span>
      {ap.fundo === id && <Check size={16} className="absolute top-1 right-1 bg-sky-500 rounded-full p-0.5" />}
    </button>
  );
  return (
    <Folha titulo="Personalizar aparência" onFechar={onFechar} leve>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <label className={`${btnPrimario} h-12 text-sm inline-flex items-center justify-center gap-2 cursor-pointer`}>
            <ImagePlus size={18} />{lendo ? "Abrindo…" : "Foto da galeria"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void escolherFoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button onClick={restaurar} className={`${btnSuave} h-12 text-sm inline-flex items-center justify-center gap-2`}><RotateCcw size={16} /> Fundo original</button>
        </div>
        {erro && <p className="text-sm text-rose-300" role="alert">{erro}</p>}
        {foto && <div className="flex items-center gap-3">
          {tile("foto", "Minha foto", { backgroundImage: `url("${foto}")`, backgroundSize: "cover", backgroundPosition: "center" })}
          <button onClick={() => definirFoto(null)} className="text-sm text-white/70 underline">Remover minha foto</button>
        </div>}
        <div>
          <p className="text-sm font-semibold mb-2">Original</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{tile("padrao", "Original", estiloFundo(APARENCIA_PADRAO, null).imagem)}</div>
        </div>
        {grupos.map((g) => (
          <div key={g}>
            <p className="text-sm font-semibold mb-2">{g}</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {OPCOES_FUNDO.filter((o) => o.grupo === g).map((o) => tile(o.id, o.nome, o.css ? { background: o.css } : { backgroundImage: `url("${o.thumb}")`, backgroundSize: "cover", backgroundPosition: "center" }))}
            </div>
          </div>
        ))}
        <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 space-y-2">
          {temImagem && <>
            <Deslizar rotulo="Posição horizontal" valor={ap.posX} min={0} max={100} onChange={(v) => mudar({ posX: v })} sufixo="%" />
            <Deslizar rotulo="Posição vertical" valor={ap.posY} min={0} max={100} onChange={(v) => mudar({ posY: v })} sufixo="%" />
            <Deslizar rotulo="Enquadramento (zoom)" valor={ap.zoom} min={100} max={200} onChange={(v) => mudar({ zoom: v })} sufixo="%" />
          </>}
          <Deslizar rotulo="Brilho" valor={ap.brilho} min={50} max={150} onChange={(v) => mudar({ brilho: v })} sufixo="%" />
          <Deslizar rotulo="Desfoque" valor={ap.desfoque} min={0} max={20} onChange={(v) => mudar({ desfoque: v })} />
          <Deslizar rotulo={ap.veu >= 0 ? "Escurecer" : "Clarear"} valor={ap.veu} min={-60} max={80} onChange={(v) => mudar({ veu: v })} />
          <Deslizar rotulo="Cartões (transparência)" valor={ap.cartoes} min={20} max={95} onChange={(v) => mudar({ cartoes: v })} sufixo="%" />
          <Deslizar rotulo="Tamanho das letras" valor={ap.letra ?? APARENCIA_PADRAO.letra} min={100} max={140} onChange={(v) => mudar({ letra: v })} sufixo="%" />
        </div>
        <p className="text-xs text-white/60">{sync === "salvando" ? "Salvando…" : sync === "ok" ? "Salvo automaticamente nos seus aparelhos." : "Salvo neste aparelho."}</p>
      </div>
    </Folha>
  );
}

function Item({ c, onClick, conflito = false }: { c: AgxCompromisso; onClick: () => void; conflito?: boolean }) {
  const cat = categoria(c.categoria);
  return (
    <button onClick={onClick} className="w-full text-left flex items-stretch gap-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 p-3 transition">
      <span className="w-1 rounded-full shrink-0" style={{ background: cat.cor }} />
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums pt-0.5">{horaTxt(c.hora)}</span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold leading-snug break-words ${c.concluido ? "line-through text-white/50" : ""}`}>{c.titulo}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/65">
          {c.local && <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={12} className="shrink-0" />{c.local}</span>}
          <span className="rounded-full px-2 py-0.5 text-white" style={{ background: `${cat.cor}40` }}>{cat.nome}</span>
          {conflito && <span className="rounded-full px-2 py-0.5 bg-rose-500/25 text-rose-200">Conflito de horário</span>}
          {c.avisoVistoEm && <span className="text-emerald-300">Aviso visto {format(parseISO(c.avisoVistoEm), "HH:mm")}</span>}
          {c.criadoPor && <span>por {primeiroNome(c.criadoPor)}</span>}
        </span>
      </span>
      <ChevronRight size={16} className="self-center text-white/40 shrink-0" />
    </button>
  );
}

function Mes({ mes, setMes, diaSel, onDia, doDia, hoje, compacto = false }: {
  mes: Date; setMes: (d: Date) => void; diaSel: string; onDia: (d: string) => void; doDia: (d: string) => AgxCompromisso[]; hoje: string; compacto?: boolean;
}) {
  const dias: Date[] = [];
  for (let d = startOfWeek(startOfMonth(mes)); d <= endOfWeek(endOfMonth(mes)); d = addDays(d, 1)) dias.push(d);
  const navBtn = `grid place-items-center rounded-full bg-white/10 border border-white/15 ${compacto ? "w-7 h-7" : "w-9 h-9"}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button aria-label="Mês anterior" onClick={() => setMes(subMonths(mes, 1))} className={navBtn}><ChevronLeft size={16} /></button>
        <p className={`${compacto ? "text-base" : "text-lg"} font-semibold`}>{cap1(format(mes, compacto ? "MMM yyyy" : "MMMM 'de' yyyy", { locale: ptBR }))}</p>
        <button aria-label="Próximo mês" onClick={() => setMes(addMonths(mes, 1))} className={navBtn}><ChevronRight size={16} /></button>
      </div>
      <div className={`grid grid-cols-7 ${compacto ? "gap-1" : "gap-1.5"}`}>
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="text-center text-xs font-semibold text-white/60 pb-0.5">{d}</div>)}
        {dias.map((d) => {
          const iso = ISO(d), evs = doDia(iso), noMes = isSameMonth(d, mes);
          if (compacto && !noMes) return <span key={iso} />;
          const sel = iso === diaSel, eHoje = iso === hoje;
          return (
            <button key={iso} onClick={() => onDia(iso)} aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${evs.length} compromissos`} aria-current={eHoje ? "date" : undefined}
              className={`relative ${compacto ? "h-9" : "h-12"} rounded-lg flex flex-col items-center justify-center border transition
                ${sel ? "bg-gradient-to-br from-sky-500/70 to-violet-600/70 border-sky-300 agx-brilho" : eHoje ? "border-sky-300/80 bg-sky-400/10" : "border-white/[0.06] bg-white/[0.06]"} ${noMes ? "" : "opacity-35"}`}>
              <span className={`${compacto ? "text-sm" : "text-base"} font-bold tabular-nums leading-none`}>{format(d, "d")}</span>
              {evs.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{evs.slice(0, 3).map((c) => <i key={c.id} className="w-1 h-1 rounded-full" style={{ background: categoria(c.categoria).cor }} />)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Semana({ base, setBase, onDia, doDia, hoje }: { base: string; setBase: (d: string) => void; onDia: (d: string) => void; doDia: (d: string) => AgxCompromisso[]; hoje: string }) {
  const ini = startOfWeek(parseISO(base));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <button aria-label="Semana anterior" onClick={() => setBase(ISO(addDays(parseISO(base), -7)))} className={`${btnSuave} w-10 h-10 grid place-items-center`}><ChevronLeft size={18} /></button>
        <p className="text-sm font-semibold">{format(ini, "d/MM")} a {format(addDays(ini, 6), "d/MM")}</p>
        <button aria-label="Próxima semana" onClick={() => setBase(ISO(addDays(parseISO(base), 7)))} className={`${btnSuave} w-10 h-10 grid place-items-center`}><ChevronRight size={18} /></button>
      </div>
      {Array.from({ length: 7 }, (_, i) => addDays(ini, i)).map((d) => {
        const iso = ISO(d), evs = doDia(iso);
        return (
          <button key={iso} onClick={() => onDia(iso)} className={`w-full text-left flex gap-3 rounded-2xl p-3 bg-white/[0.05] border ${iso === hoje ? "border-sky-300/70" : "border-white/10"}`}>
            <span className="w-11 shrink-0 text-center"><span className="block text-xs uppercase text-white/60">{format(d, "EEE", { locale: ptBR })}</span><span className="block text-lg font-bold leading-none tabular-nums">{format(d, "d")}</span></span>
            <span className="flex-1 min-w-0 space-y-0.5">
              {evs.length === 0 ? <span className="text-sm text-white/45">Livre</span>
                : evs.map((c) => <span key={c.id} className={`flex items-center gap-2 text-sm ${c.concluido ? "line-through text-white/45" : ""}`}><i className="w-2 h-2 rounded-full shrink-0" style={{ background: categoria(c.categoria).cor }} /><span className="tabular-nums text-white/70 shrink-0">{horaTxt(c.hora)}</span><span className="truncate">{c.titulo}</span></span>)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- formulário
function Folha({ titulo, onFechar, children, leve = false }: { titulo: string; onFechar: () => void; children: React.ReactNode; leve?: boolean }) {
  return (
    <div className={`fixed inset-0 z-40 flex items-end md:items-center justify-center ${leve ? "bg-black/20" : "bg-black/60 backdrop-blur-sm"}`} onClick={onFechar}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        className={`agx-entrar w-full md:max-w-xl ${leve ? "max-h-[68dvh]" : "max-h-[92dvh]"} overflow-y-auto overscroll-contain rounded-t-3xl md:rounded-3xl border border-white/15 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white text-base shadow-2xl`}
        style={{ background: "rgba(12,18,52,.96)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-lg font-semibold">{titulo}</p>
          <button onClick={onFechar} aria-label="Fechar" className="grid place-items-center w-10 h-10 rounded-full bg-white/10"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Formulario({ inicial, lista, onFechar, onSalvar, onConcluir, onExcluir, erroSalvar, salvando = false }: {
  erroSalvar?: string; salvando?: boolean; inicial: AgxInput | AgxCompromisso; lista: AgxCompromisso[]; onFechar: () => void; onSalvar: (c: AgxInput) => void;
  onConcluir: (id: number, v: boolean) => void; onExcluir: (id: number) => void;
}) {
  const [f, setF] = useState<AgxInput>(inicial);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof AgxInput>(k: K, v: AgxInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const existente = "concluido" in inicial ? inicial : null;
  const choques = lista.filter((c) => c.id !== f.id && c.data === f.data && !c.concluido &&
    (c.hora == null || f.hora == null || Math.abs(toMin(c.hora) - toMin(f.hora)) < 60));
  const enviar = () => {
    if (!f.titulo.trim()) { setMsg("Escreva o nome do compromisso."); return; }
    if (!f.data) { setMsg("Escolha a data."); return; }
    onSalvar(f);
  };
  const rot = "block text-sm font-medium text-white/80 mb-1";
  const marca = "w-5 h-5 accent-violet-500 shrink-0";
  return (
    <Folha titulo={f.id ? "Editar compromisso" : "Novo compromisso"} onFechar={salvando ? () => {} : onFechar}>
      <div className="space-y-4">
        <label className="block"><span className={rot}>Título</span>
          <input className={campo} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Reunião na Prefeitura" autoFocus={!f.id} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0"><span className={rot}>Data</span><input type="date" className={campo} value={f.data} onChange={(e) => set("data", e.target.value)} /></label>
          <label className="block min-w-0"><span className={rot}>Horário</span>
            <input type="time" className={campo} value={f.hora ?? ""} disabled={f.hora == null} onChange={(e) => set("hora", e.target.value || null)} /></label>
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className={marca} checked={f.hora == null} onChange={(e) => set("hora", e.target.checked ? null : "09:00")} /> Dia todo (sem horário)</label>
        <label className="block"><span className={rot}>Local (opcional)</span>
          <input className={campo} value={f.local ?? ""} onChange={(e) => set("local", e.target.value || null)} placeholder="Ex.: Prefeitura" /></label>
        <div><span className={rot}>Categoria</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => (
              <button key={c.id} type="button" onClick={() => set("categoria", c.id)} className={`rounded-full px-3 h-9 text-sm font-medium border ${f.categoria === c.id ? "text-white" : "text-white/80 border-white/20"}`}
                style={f.categoria === c.id ? { background: c.cor, borderColor: c.cor } : undefined}>{c.nome}</button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 space-y-3">
          <p className="font-semibold text-sm flex items-center gap-2"><Bell size={16} /> Avisos no celular</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className={marca} checked={f.avisarVespera} onChange={(e) => set("avisarVespera", e.target.checked)} /> No dia anterior, às 18h</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className={marca} checked={f.avisarDia} onChange={(e) => set("avisarDia", e.target.checked)} /> No próprio dia, às 7h</label>
          {f.hora != null && <label className="block"><span className={rot}>Antes do horário</span>
            <select className={campo} value={f.antecedenciaMin ?? ""} onChange={(e) => set("antecedenciaMin", e.target.value === "" ? null : Number(e.target.value))}>
              {ANTES.map(([v, t]) => <option key={String(v)} value={v ?? ""}>{t}</option>)}
            </select></label>}
        </div>
        <label className="block"><span className={rot}>Observação (opcional)</span>
          <textarea className={`${campo} h-24 py-3`} value={f.observacao ?? ""} onChange={(e) => set("observacao", e.target.value || null)} /></label>
        {choques.length > 0 && <p className="rounded-2xl bg-rose-500/15 border border-rose-300/40 p-3 text-sm text-rose-100">
          Conflito: neste dia já tem {choques.map((c) => `${horaTxt(c.hora)} ${c.titulo}`).join("; ")}</p>}
        {existente && (existente.criadoPor || existente.atualizadoPor) && <p className="text-xs text-white/55">
          Criado por {existente.criadoPor ?? "—"} · {format(parseISO(existente.createdAt), "dd/MM HH:mm")}
          {existente.atualizadoPor && existente.updatedAt !== existente.createdAt && <> · alterado por {existente.atualizadoPor} · {format(parseISO(existente.updatedAt), "dd/MM HH:mm")}</>}</p>}
        {(msg || erroSalvar) && <p className="text-sm text-rose-300" role="alert">{msg || erroSalvar}</p>}
        <button disabled={salvando} aria-busy={salvando} onClick={enviar} className={`${btnPrimario} w-full h-12 text-base`}>{salvando ? "Salvando…" : "Salvar"}</button>
        {existente && <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onConcluir(existente.id, !existente.concluido)} className={`${btnSuave} h-11 text-sm`}>{existente.concluido ? "Reabrir" : "Concluir"}</button>
          <button onClick={() => { if (window.confirm(`Excluir "${existente.titulo}"?`)) onExcluir(existente.id); }} className={`${btnBase} h-11 text-sm bg-rose-500/80`}>Excluir</button>
        </div>}
      </div>
    </Folha>
  );
}
const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));


// ---------------------------------------------------------------- falar (microfone grande)
type Reconhecedor = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

const novoCompromisso = (data: string, extra: Partial<AgxInput> = {}): AgxInput => ({
  id: null, titulo: "", data, hora: "09:00", local: null, observacao: null, categoria: "reuniao",
  avisarVespera: true, avisarDia: true, antecedenciaMin: 60, ...extra,
});

function TelaFalar({ sessao, onSair }: { sessao: AgxSessao; onSair: () => void }) {
  const nome = primeiroNome(sessao.usuario.nome);
  const inicial = new URLSearchParams(window.location.search).get("texto") ?? "";
  const [txt, setTxt] = useState(inicial);
  const [ouvindo, setOuvindo] = useState(false);
  const [dica, setDica] = useState("");
  const [res, setRes] = useState<Interpretacao | null>(() => (inicial.trim() ? interpretarFrase(inicial) : null));
  const [form, setForm] = useState<AgxInput | null>(null);
  const [salvo, setSalvo] = useState("");
  const [podeInstalar, setPodeInstalar] = useState(() => Boolean(installEvt));
  const rec = useRef<Reconhecedor | null>(null);
  const [lista, setLista] = useState<AgxCompromisso[]>([]);
  const [outra, setOutra] = useState<{ acao: "desmarcar" | "remarcar" | "concluir"; alvo: AgxCompromisso; data: string; hora: string | null } | null>(null);
  const [extra, setExtra] = useState<{ observacao: string | null; antecedenciaMin: number | null }>({ observacao: null, antecedenciaMin: null });
  const [pensando, setPensando] = useState(false);
  const grav = useRef<Gravacao | null>(null);
  const recarregar = useCallback(() => {
    const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return ISO(x); };
    api.listar(d(-7), d(180)).then(setLista).catch(() => {});
  }, []);
  useEffect(recarregar, [recarregar]);
  useEffect(() => () => liberarMicrofone(), []);
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  useEffect(() => () => rec.current?.stop(), []);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); installEvt = e as BeforeInstall; setPodeInstalar(true); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  const [gravando, setGravando] = useState(false);
  const trava = useRef(false);
  const repeticao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuarEscuta = useRef(false);
  const iniciar = useRef<() => void>(() => {});
  const receber = useRef<(t: string) => boolean>(() => false);
  const falarResultado = (t: string) => {
    void t;
  };
  const pararEscuta = () => {
    continuarEscuta.current=false;
    if(repeticao.current)clearTimeout(repeticao.current);
    grav.current?.cancelar();grav.current=null;
    rec.current?.stop();setOuvindo(false);
  };
  useEffect(()=>()=>{
    continuarEscuta.current=false;
    if(repeticao.current)clearTimeout(repeticao.current);
    rec.current?.stop();
  },[]);
  const salvar = async (c: AgxInput) => {
    if(trava.current)return;
    trava.current=true;setGravando(true);setDica("Salvando… aguarde a confirmação.");pararEscuta();
    try {
      await api.salvar(c);
      setSalvo(`${c.titulo} · ${dataLonga(c.data)} · ${horaTxt(c.hora)}`);
      setRes(null); setTxt(""); setForm(null);setDica("");setExtra({ observacao: null, antecedenciaMin: null });recarregar();
      falarResultado("Compromisso salvo na agenda.");
      window.history.replaceState(null, "", "/agenda-claudia/falar");
    } catch (e) {
      if (api.sessaoInvalida(e)) onSair();
      else {setDica(erroTxt(e));falarResultado("Não foi possível confirmar a gravação. Confira o aviso na tela.");}
    } finally {trava.current=false;setGravando(false);}
  };
  const confirmar = () => {
    if(!res?.data || (!res.hora && !res.diaTodo)) {
      setDica("Ainda falta o dia ou o horário. Diga o compromisso completo, por exemplo: reunião hoje à meia-noite e quarenta. Ou toque em Corrigir.");return;
    }
    void salvar(novoCompromisso(res.data,{titulo:res.titulo,hora:res.diaTodo?null:res.hora,local:res.local,categoria:res.categoria,
      observacao:extra.observacao,...(extra.antecedenciaMin?{antecedenciaMin:extra.antecedenciaMin}:{})}));
  };
  const executarOutra = async () => {
    if (!outra || trava.current) return;
    trava.current = true; setGravando(true); pararEscuta();
    try {
      const { acao, alvo } = outra;
      if (acao === "desmarcar") await api.excluir(alvo.id);
      else if (acao === "concluir") await api.concluir(alvo.id, true);
      else await api.salvar({ ...alvo, data: outra.data, hora: outra.hora });
      setSalvo(acao === "desmarcar" ? `Desmarcado: ${alvo.titulo}` : acao === "concluir" ? `Feito: ${alvo.titulo}`
        : `Remarcado: ${alvo.titulo} · ${dataLonga(outra.data)} · ${horaTxt(outra.hora)}`);
      setOutra(null); setTxt(""); setDica(""); recarregar();
    } catch (e) { if (api.sessaoInvalida(e)) onSair(); else setDica(erroTxt(e)); }
    finally { trava.current = false; setGravando(false); }
  };
  const cancelar = () => {pararEscuta();setOutra(null);setRes(null);setTxt("");setForm(null);setSalvo("");setDica("Cancelado. Nenhum novo compromisso foi salvo.");falarResultado("Cancelado.");};
  const entender = (t = txt): boolean => {
    if(trava.current)return false;
    const comando=comandoVoz(t);
    if(comando) {
      if(comando==="cancelar"){cancelar();return false;}
      if(!res && !outra){setDica("Primeiro diga o compromisso, o dia e o horário.");return true;}
      if(comando==="salvar"){if(outra)void executarOutra();else confirmar();return false;}
      setOutra(null);
      setRes(null);setSalvo("");setDica("Diga novamente o compromisso completo com o dia e o horário.");return true;
    }
    setSalvo("");
    if(!t.trim())return false;
    setTxt(t);setOutra(null);setRes(null);setDica("");setPensando(true);
    entenderVoz({ texto: t }, lista).then(aplicarIA).catch((e) => {
      if (api.sessaoInvalida(e)) { onSair(); return; }
      const l = intencaoLocal(t, lista);
      if (l) { aplicarIA({ transcricao: t, comando: null, titulo: null, data: null, hora: null, diaTodo: false, local: null, observacao: null, categoria: "outro", antecedenciaMin: null, ...l }); return; }
      const resultado=interpretarFrase(t);setRes(resultado);setExtra({ observacao: null, antecedenciaMin: null });
      setDica(resultado.falta.length ? "Faltou o dia ou o horário. Diga o compromisso completo ou toque em Corrigir." : "Confira os dados. Diga salvar, corrigir ou cancelar.");
    }).finally(() => setPensando(false));
    return true;
  };
  const aplicarIA = (ia: VozIA) => {
    let r = ia;
    if (r.transcricao) setTxt(r.transcricao);
    if (r.acao === "criar" || r.acao === "nada") { const l = intencaoLocal(r.transcricao, lista); if (l) r = { ...r, ...l }; }
    if (r.acao === "comando" && r.comando) { entender(r.comando); return; }
    if (r.acao === "criar") {
      const falta = [...(r.data ? [] : ["data" as const]), ...(r.hora || r.diaTodo ? [] : ["hora" as const])];
      setOutra(null); setExtra({ observacao: r.observacao, antecedenciaMin: r.antecedenciaMin });
      setRes({ titulo: r.titulo ?? "Compromisso", data: r.data, hora: r.hora, diaTodo: r.diaTodo, local: r.local, categoria: r.categoria, falta });
      setDica(falta.length ? "Faltou o dia ou o horário. Fale de novo ou toque em Corrigir." : "Confira e toque em Salvar (ou diga “salvar”).");
      return;
    }
    if (r.acao === "desmarcar" || r.acao === "remarcar" || r.acao === "concluir") {
      const alvo = lista.find((c) => c.id === r.alvoId);
      if (!alvo) { setRes(null); setOutra(null); setDica("Não achei esse compromisso na agenda. Fale o nome e o dia dele, por exemplo: “desmarca a reunião de quinta”."); return; }
      if (r.acao === "remarcar" && !r.novaData && !r.novaHora) { setDica("Para remarcar, diga o novo dia ou horário."); return; }
      setRes(null); setOutra({ acao: r.acao, alvo, data: r.novaData ?? alvo.data, hora: r.novaHora ?? alvo.hora });
      setDica("Confira e toque em Confirmar (ou diga “salvar”).");
      return;
    }
    setDica("Não entendi. Fale de novo, por exemplo: “festa de aniversário da Ana sábado às 8 da noite”.");
  };
  const usarGravador = gravadorSuportado() && (ehIOS() || !Rec);
  const mandarAudio = async (blob: Blob) => {
    if (blob.size < 1500) { setDica("Não ouvi nada. Toque e fale de novo."); return; }
    setPensando(true); setDica("");
    try { aplicarIA(await entenderVoz({ audio: blob }, lista)); }
    catch (e) { if (api.sessaoInvalida(e)) onSair(); else setDica("Não consegui entender o áudio agora. Tente de novo ou escreva abaixo."); }
    finally { setPensando(false); }
  };
  const ouvirGravando = async () => {
    if (trava.current || pensando) return;
    if (grav.current) { const g = grav.current; grav.current = null; setOuvindo(false); await mandarAudio(await g.parar()); return; }
    try {
      setDica(""); setSalvo("");
      grav.current = await gravar(25, () => { const g = grav.current; grav.current = null; setOuvindo(false); if (g) void g.parar().then(mandarAudio); });
      setOuvindo(true);
    } catch (e) {
      setDica((e as Error)?.name === "NotAllowedError"
        ? "O microfone está bloqueado. No iPhone: Ajustes → Safari → Microfone → Permitir. Depois toque de novo."
        : "Não consegui usar o microfone. Escreva o compromisso abaixo.");
    }
  };
  receber.current=entender;
  const ouvir = () => {
    if(trava.current)return;
    if (!Rec) { setDica("Use o microfone do teclado para ditar o compromisso e depois toque em Continuar."); return; }
    try {
      if(repeticao.current)clearTimeout(repeticao.current);
      const r = new Rec();
      r.lang = "pt-BR"; r.interimResults = true; r.continuous = false;
      continuarEscuta.current=false;
      r.onresult = (e) => {
        const t = Array.from(e.results).map((x) => x[0].transcript).join(" ");
        setTxt(t);
        if (e.results[e.results.length - 1].isFinal) continuarEscuta.current=receber.current(t);
      };
      r.onerror = (e) => {
        continuarEscuta.current=false;
        setDica(e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "O microfone está bloqueado. Libere o microfone para a agenda nas configurações, ou use o microfone do teclado."
          : e.error === "no-speech" ? "Não ouvi nada. Toque no microfone para falar, ou use os botões abaixo."
          : e.error === "network" ? "Confira a internet para usar a voz. Os botões continuam disponíveis." : "Não consegui ouvir. Toque no microfone ou use os botões.");
      };
      r.onend = () => {
        if(rec.current!==r)return;
        setOuvindo(false);rec.current=null;
        if(continuarEscuta.current && document.visibilityState!=="hidden") {
          repeticao.current=setTimeout(()=>{continuarEscuta.current=false;iniciar.current();},500);
        }
      };
      rec.current = r; r.start(); setOuvindo(true);
    } catch {continuarEscuta.current=false;setOuvindo(false);setDica("Toque no microfone para tentar de novo, ou use os botões abaixo.");}
  };
  iniciar.current=ouvir;
  const input = res && novoCompromisso(res.data ?? ISO(new Date()), {
    titulo: res.titulo, hora: res.diaTodo ? null : res.hora ?? "09:00", local: res.local, categoria: res.categoria,
  });
  const pronto = Boolean(res && res.data && (res.hora || res.diaTodo));
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xl font-bold">Olá, {nome}!</p>
        <a href="/agenda-claudia" className={`${btnBase} px-4 py-3 text-sm bg-white/10 border border-white/20`}>📅 Ver agenda</a>
      </div>
      <button data-native-recognition="react" disabled={pensando} onClick={usarGravador ? () => void ouvirGravando() : ouvindo ? pararEscuta : ouvir} aria-label={ouvindo ? "Parar de ouvir" : "Tocar e falar"}
        className={`mx-auto flex flex-col items-center justify-center w-32 h-32 rounded-full text-5xl shadow-2xl transition active:scale-95 ${ouvindo ? "bg-red-500 animate-pulse" : ""}`}
        style={ouvindo ? undefined : { background: "linear-gradient(135deg,#38bdf8,#8b5cf6)", boxShadow: "0 0 0 10px rgba(56,189,248,.18),0 16px 32px rgba(0,0,0,.45)" }}>
        🎙️<span className="text-sm font-bold mt-1 px-2 text-center leading-tight">{pensando ? "Entendendo…" : ouvindo ? (usarGravador ? "Toque p/ terminar" : "Ouvindo…") : res || outra ? "Diga sua opção" : "Toque e fale"}</span>
      </button>
      {txt.trim() && (ouvindo || pensando || res || outra) && (
        <div className={`${glass} !p-3 text-center`} aria-live="polite">
          <p className="text-sm text-white/65">{ouvindo ? "Ouvindo…" : pensando ? "Entendendo…" : "Você falou:"}</p>
          <p className="text-xl font-semibold leading-snug">“{txt}”</p>
        </div>
      )}
      {!txt.trim() && !res && !outra && <p className="text-center text-base text-white/80">Fale do seu jeito: marcar, desmarcar, remarcar ou “já fiz”. Ex.: “festa de aniversário da Ana sábado às 8 da noite” ou “desmarca a reunião de amanhã”.</p>}
      {dica && <p className="text-base text-rose-300 text-center" role="alert">{dica}</p>}
      {salvo && <div className="rounded-2xl bg-green-500/20 border border-green-400/50 p-4 text-base" role="status"><b>✅ Pronto:</b> <span className="capitalize">{salvo}</span></div>}
      {outra && (
        <div className="rounded-2xl bg-violet-400/10 border border-violet-300/40 p-4 space-y-2 text-base">
          <p className="text-sm text-white/70">{outra.acao === "desmarcar" ? "Desmarcar este compromisso?" : outra.acao === "concluir" ? "Marcar como feito?" : "Remarcar para:"}</p>
          <p className="text-lg font-bold">{outra.alvo.titulo}</p>
          <p>📅 <span className="capitalize">{dataLonga(outra.acao === "remarcar" ? outra.data : outra.alvo.data)}</span> · ⏰ {horaTxt(outra.acao === "remarcar" ? outra.hora : outra.alvo.hora)}</p>
          {outra.acao === "remarcar" && <p className="text-sm text-white/60">Antes: <span className="capitalize">{dataLonga(outra.alvo.data)}</span> · {horaTxt(outra.alvo.hora)}</p>}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button disabled={gravando} onClick={() => void executarOutra()} className={`${btnBase} h-12 text-base ${outra.acao === "desmarcar" ? "bg-rose-500 text-white" : "bg-green-500 text-green-950"}`}>{gravando ? "Salvando…" : "Confirmar"}</button>
            <button disabled={gravando} onClick={cancelar} className={`${btnBase} h-12 text-base bg-white/15`}>Cancelar</button>
          </div>
        </div>
      )}
      {res && input && (
        <div className="rounded-2xl bg-sky-400/10 border border-sky-300/40 p-4 space-y-2 text-base">
          <p className="text-sm text-white/70">Vai ficar assim na agenda:</p>
          <p className="text-xl font-bold">{res.titulo}</p>
          <p>📅 {res.data ? <span className="capitalize">{dataLonga(res.data)}</span> : <b className="text-rose-300">faltou o dia</b>}</p>
          <p>⏰ {res.diaTodo ? "Dia todo" : res.hora ? horaTxt(res.hora) : <b className="text-rose-300">faltou o horário</b>}</p>
          {res.local && <p>📍 {res.local}</p>}
          <p>🏷️ {categoria(res.categoria).nome}{extra.antecedenciaMin ? ` · aviso ${extra.antecedenciaMin} min antes` : ""}</p>
          {extra.observacao && <p className="text-sm text-white/70">📝 {extra.observacao}</p>}
          {!pronto && <p className="text-sm text-rose-200">Fale de novo com {res.falta.map((x) => (x === "data" ? "o dia" : "o horário")).join(" e ")}, ou toque em Corrigir.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <button disabled={gravando} onClick={confirmar} aria-busy={gravando} className={`${btnBase} min-h-12 py-3 text-base bg-green-500 text-green-950`}>{gravando ? "Salvando…" : "Salvar"}</button>
            <button disabled={gravando} onClick={() => {pararEscuta();setDica("");setForm(input);}} className={`${btnBase} h-12 text-base bg-white/15 text-white`}>Corrigir</button>
            <button disabled={gravando} onClick={cancelar} className={`${btnBase} h-12 text-base bg-white/15`}>Cancelar</button>
          </div>
        </div>
      )}
      <textarea className={`${campo} h-24 py-3`} value={txt} onChange={(e) => { setTxt(e.target.value); setRes(null); }} placeholder="Ou escreva aqui o compromisso…" />
      {!res && txt.trim() && <button onClick={() => entender()} className={`${btnBase} w-full h-12 text-lg bg-sky-400 text-sky-950`}>Continuar</button>}
      {!instalado() && ehAndroid() && podeInstalar && (
        <button onClick={async () => { await installEvt?.prompt(); installEvt = null; setPodeInstalar(false); }}
          className={`${btnBase} w-full h-12 text-base bg-white/10 border border-white/25`}>📲 Colocar o botão “Falar” na tela inicial</button>
      )}
      {ehIOS() && <AtalhoIphone />}
      {form && <Formulario erroSalvar={dica} salvando={gravando} inicial={form} lista={[]} onFechar={() => setForm(null)} onSalvar={salvar} onConcluir={() => {}} onExcluir={() => {}} />}
    </div>
  );
}

function AtalhoIphone() {
  const [aberto, setAberto] = useState(false);
  const url = `${window.location.origin}/agenda-claudia/falar?texto=`;
  return (
    <div className={glass}>
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-base font-bold text-left">
        <span>iPhone: botão de microfone na tela inicial</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <ol className="mt-3 space-y-2 text-sm list-decimal pl-6">
        <li>Abra o app <b>Atalhos</b> (já vem no iPhone) e toque em <b>+</b>.</li>
        <li>Adicione a ação <b>Ditar Texto</b> (idioma: Português).</li>
        <li>Adicione a ação <b>Codificar URL</b> (vai usar o “Texto Ditado”).</li>
        <li>Adicione a ação <b>Abrir URLs</b> e escreva: <code className="break-all bg-black/30 px-1 rounded">{url}</code> e, logo depois, escolha a variável <b>Texto Codificado</b>.</li>
        <li>Dê o nome <b>Agendar</b> e toque em <b>Compartilhar → Adicionar à Tela de Início</b>.</li>
        <li>Pronto: toque no ícone <b>Agendar</b>, fale o compromisso e confirme. Também funciona dizendo “E aí Siri, Agendar”.</li>
        <li className="text-white/70">Na primeira vez, o Safari pede o PIN da agenda.</li>
      </ol>}
    </div>
  );
}

// ---------------------------------------------------------------- avisos
function PainelAvisos({ sessao, avisar }: { sessao: AgxSessao; avisar: (t: string) => void }) {
  const souDona = sessao.usuario.papel === "dona";
  const dona = primeiroNome(sessao.dona.nome);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.statusPush>> | null>(null);
  const [ativoAqui, setAtivoAqui] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [podeInstalar, setPodeInstalar] = useState(() => Boolean(installEvt));
  const iosSemApp = ehIOS() && !instalado();

  const atualizar = useCallback(async () => {
    const sub = await assinaturaAtual().catch(() => null);
    const s = await api.statusPush(sub?.endpoint ?? null).catch(() => null);
    setStatus(s);
    setAtivoAqui(Boolean(sub && s?.esteAparelho && Notification.permission === "granted"));
  }, []);
  useEffect(() => { void atualizar(); }, [atualizar]);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); installEvt = e as BeforeInstall; setPodeInstalar(true); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true); setMsg("");
    try { await fn(); avisar(ok); } catch (e) { setMsg(erroTxt(e)); } finally { setOcupado(false); void atualizar(); }
  };
  return (
    <div className={glass}>
      <p className="text-lg font-bold mb-1">Lembretes no celular</p>
      <p className="text-sm text-white/75 mb-3">Com a permissão do celular, chegam mesmo com o app fechado: no dia anterior, no dia, antes e na hora do compromisso. O som segue as configurações do aparelho.</p>
      {!souDona ? (
        <p className="text-base">Os avisos vão só para o celular da {dona}. {status && <>Ela tem {status.aparelhos} {status.aparelhos === 1 ? "aparelho ativo" : "aparelhos ativos"}.</>}</p>
      ) : (
        <div className="space-y-3">
          {status && !status.configurado && <p className="text-sm text-rose-300">Falta configurar a chave dos avisos no servidor.</p>}
          {iosSemApp && (
            <div className="rounded-2xl bg-white/[0.08] p-4 text-sm space-y-1">
              <p className="font-semibold text-base">No iPhone, primeiro instale o app:</p>
              <p>1. Abra este endereço no <b>Safari</b>.</p>
              <p>2. Toque em <b>Compartilhar</b> (quadrado com a seta para cima).</p>
              <p>3. Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.</p>
              <p>4. Abra pelo ícone <b>Minha Agenda</b> e toque em <b>Ativar avisos</b>.</p>
            </div>
          )}
          {!instalado() && ehAndroid() && podeInstalar && (
            <button onClick={async () => { await installEvt?.prompt(); installEvt = null; setPodeInstalar(false); }}
              className={`${btnBase} w-full h-12 text-base bg-white/10 border border-white/25`}>📲 Instalar o app na tela inicial</button>
          )}
          <p className={`text-base font-bold ${ativoAqui ? "text-green-300" : "text-white/80"}`}>
            {ativoAqui ? "✅ Avisos ativos neste celular" : "Avisos desligados neste celular"}</p>
          {status?.esteAparelho?.ultimoErro && <p className="text-base text-rose-300">Último problema: {status.esteAparelho.ultimoErro}</p>}
          {!ativoAqui && <button disabled={ocupado || iosSemApp || !pushSuportado()} onClick={() => agir(ativarAvisos, "✅ Avisos ativados!")}
            className={`${btnBase} w-full h-12 text-lg bg-green-500 text-green-950`}>Ativar avisos neste celular</button>}
          {ativoAqui && <>
            <button disabled={ocupado} onClick={() => agir(() => api.testarPush(0), "Aviso de teste enviado. Deve chegar em instantes.")}
              className={`${btnBase} w-full h-12 text-base bg-sky-400 text-sky-950`}>Testar agora</button>
            <button disabled={ocupado} onClick={() => agir(() => api.testarPush(45), "Agora feche o app. Em 1 a 2 minutos chega o aviso.")}
              className={`${btnBase} w-full h-12 text-base bg-violet-500`}>Testar com o app fechado</button>
            <button disabled={ocupado} onClick={() => agir(desativarAvisos, "Avisos desligados neste celular.")}
              className="w-full text-base text-white/60 underline py-2">Desligar avisos neste celular</button>
          </>}
          {!pushSuportado() && !iosSemApp && <p className="text-sm text-rose-300">Este navegador não recebe avisos. No Android, use o Chrome.</p>}
          {status && <p className="text-base text-white/60">Aparelhos que recebem seus avisos: {status.aparelhos}</p>}
          {msg && <p className="text-sm text-rose-300" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function PainelAcessos({ avisar, falhou }: { avisar: (t: string) => void; falhou: (e: unknown) => void }) {
  const [pessoas, setPessoas] = useState<{ id: number; nome: string }[]>([]);
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [atual, setAtual] = useState("");
  const [novoPin, setNovoPin] = useState("");
  const [aberto, setAberto] = useState(false);
  const carregar = useCallback(() => { api.acessos().then(setPessoas).catch(() => {}); }, []);
  useEffect(carregar, [carregar]);
  return (
    <div className={glass}>
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-lg font-bold">
        <span>Quem pode mexer na agenda</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <div className="space-y-4 mt-3">
        {pessoas.length === 0 ? <p className="text-sm text-white/70">Só você.</p> : pessoas.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white/[0.06] p-3">
            <span className="text-base font-bold">{p.nome}</span>
            <button onClick={async () => { if (!window.confirm(`Tirar o acesso de ${p.nome}?`)) return; try { await api.revogar(p.id); carregar(); avisar("Acesso removido."); } catch (e) { falhou(e); } }}
              className={`${btnBase} px-4 h-12 text-base bg-red-500/80`}>Remover</button>
          </div>
        ))}
        <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
          <p className="text-base font-bold">Autorizar outra pessoa</p>
          <input className={campo} placeholder="Nome (ex.: Natali)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className={campo} placeholder="PIN dela (4 a 6 números)" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <p className="text-base text-white/60">Ela vai poder ver e mexer nos compromissos. Os avisos continuam indo só para você.</p>
          <button onClick={async () => { try { await api.autorizar(nome, pin); setNome(""); setPin(""); carregar(); avisar("Acesso autorizado."); } catch (e) { falhou(e); } }}
            disabled={nome.trim().length < 2 || pin.length < 4} className={`${btnBase} w-full h-14 text-base bg-green-500 text-green-950`}>Autorizar</button>
        </div>
        <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
          <p className="text-base font-bold">Trocar meu PIN</p>
          <input className={campo} placeholder="PIN atual" type="password" inputMode="numeric" maxLength={6} value={atual} onChange={(e) => setAtual(e.target.value.replace(/\D/g, ""))} />
          <input className={campo} placeholder="PIN novo" type="password" inputMode="numeric" maxLength={6} value={novoPin} onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, ""))} />
          <button onClick={async () => { try { await api.trocarPin(atual, novoPin); setAtual(""); setNovoPin(""); avisar("PIN trocado."); } catch (e) { falhou(e); } }}
            disabled={atual.length < 4 || novoPin.length < 4} className={`${btnBase} w-full h-14 text-base bg-white/15`}>Trocar PIN</button>
        </div>
      </div>}
    </div>
  );
}

function PainelHistorico({ lista }: { lista: AgxCompromisso[] }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Awaited<ReturnType<typeof api.historico>>>([]);
  useEffect(() => { if (aberto) api.historico().then(setItens).catch(() => {}); }, [aberto, lista]);
  return (
    <div className={glass}>
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-lg font-bold">
        <span>Últimas alterações</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <div className="mt-3 space-y-2">
        {itens.length === 0 ? <p className="text-sm text-white/70">Nada por enquanto.</p> : itens.slice(0, 30).map((h, i) => (
          <p key={i} className="text-sm"><b>{h.por ?? "—"}</b> {h.acao} {h.titulo && <>“{h.titulo}”</>} <span className="text-white/60">· {format(parseISO(h.em), "dd/MM HH:mm")}</span></p>
        ))}
      </div>}
    </div>
  );
}

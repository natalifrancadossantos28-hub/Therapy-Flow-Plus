import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgendaClaudiaAlarme } from "@/components/AgendaClaudiaAlarme";
import * as api from "@/lib/agenda-exec-rpc";
import { CATEGORIAS, categoria, type AgxCompromisso, type AgxInput, type AgxSessao, type Pessoa } from "@/lib/agenda-exec-rpc";
import { interpretarFrase, type Interpretacao } from "@/lib/agenda-exec-voz";
import { ativarAvisos, assinaturaAtual, desativarAvisos, ehAndroid, ehIOS, instalado, pushSuportado } from "@/lib/agenda-exec-push";
import { getCompanySession } from "@/lib/portal-session";

// Agenda da Cláudia: tela própria, letras e botões grandes, sem o menu do sistema.

const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const horaTxt = (h: string | null) => (h ? (h.endsWith(":00") ? h.slice(0, 2) + "h" : h.replace(":", "h")) : "Dia todo");
const dataLonga = (iso: string) => format(parseISO(iso), "EEEE, d 'de' MMMM", { locale: ptBR });
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0];
const ANTES: [number | null, string][] = [[null, "Não avisar"], [0, "Na hora"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [120, "2 horas antes"]];
const erroTxt = (e: unknown) => (api.migracaoPendente(e) ? "A agenda ainda não foi ativada no servidor (migração 0133)." : (e as Error)?.message || "Algo deu errado. Tente de novo.");

const glass = "rounded-3xl border border-white/15 bg-white/[0.07] backdrop-blur-xl p-5 shadow-2xl";
const btnBase = "rounded-2xl font-extrabold transition active:scale-[0.98] disabled:opacity-50";
const campo = "w-full h-14 rounded-2xl border border-white/20 bg-black/30 px-4 text-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-4 focus:ring-sky-400/40";

type BeforeInstall = Event & { prompt: () => Promise<void> };
let installEvt: BeforeInstall | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e as BeforeInstall; });
}

function useManifestAgenda(nome: string, falar: boolean) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const antes = { href: link?.getAttribute("href"), titulo: meta?.content, doc: document.title };
    link?.setAttribute("href", falar ? "/manifest-falar.webmanifest" : "/manifest-agenda.webmanifest");
    if (meta) meta.content = falar ? "Falar" : "Agenda";
    document.title = `Agenda da ${nome}`;
    return () => {
      if (link && antes.href) link.setAttribute("href", antes.href);
      if (meta && antes.titulo) meta.content = antes.titulo;
      document.title = antes.doc;
    };
  }, [nome, falar]);
}

function Fundo({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-white text-lg" style={{ background: "linear-gradient(135deg,rgba(11,21,48,.96),rgba(30,58,138,.9)),radial-gradient(circle at 20% 10%,#1e40af,transparent 50%),#0b1530" }}>
      <div className="max-w-5xl mx-auto px-4 pt-5 pb-36">{children}</div>
    </div>
  );
}

function Titulo({ nome }: { nome: string }) {
  return <h1 className="text-5xl md:text-6xl text-white leading-tight" style={{ fontFamily: "Caveat, 'Brush Script MT', cursive", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>Agenda da {nome}</h1>;
}

export default function AgendaClaudia() {
  const [sessao, setSessao] = useState<AgxSessao | null>(() => api.getSessao());
  const falar = window.location.pathname.replace(/\/+$/, "").endsWith("/falar");
  useManifestAgenda(sessao ? primeiroNome(sessao.dona.nome) : "Cláudia", falar);
  const sair = useCallback(() => { void api.sair(); setSessao(null); }, []);
  return <Fundo>{!sessao ? <Entrada onEntrou={setSessao} /> : falar ? <TelaFalar sessao={sessao} onSair={sair} /> : <Agenda sessao={sessao} onSair={sair} />}</Fundo>;
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
        {pessoas === null ? <p className="text-xl">Carregando…</p>
          : erro ? <p className="text-xl text-amber-300">{erro}</p>
          : pessoas.length === 0 ? <PrimeiroAcesso onCriado={carregar} />
          : (
            <>
              <p className="text-2xl font-extrabold mb-4">Quem está usando?</p>
              <div className="grid gap-3">
                {pessoas.map((p) => (
                  <button key={p.id} onClick={() => setEscolhida(p)} className={`${btnBase} h-20 text-2xl ${p.papel === "dona" ? "bg-gradient-to-br from-sky-500 to-violet-600" : "bg-white/10 border border-white/20"}`}>
                    {p.nome}{p.papel === "gestora" && <span className="block text-base font-semibold text-white/70">autorizada por {primeiroNome(p.donaNome)}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
      </div>
      {getCompanySession() && <a href="/" className="block text-center text-white/70 underline text-lg">← Voltar ao NFs</a>}
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
        <p className="text-2xl font-extrabold">Olá, {primeiroNome(pessoa.nome)}!</p>
        <p className="text-lg text-white/70">Digite seu PIN</p>
        <div className="flex justify-center gap-3 my-5" aria-label={`${pin.length} números digitados`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={`w-5 h-5 rounded-full ${i < pin.length ? "bg-sky-300" : "bg-white/20"}`} />)}
        </div>
        {msg && <p className="text-lg text-amber-300 mb-3" role="alert">{msg}</p>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "<", "0"].map((t) => (
            <button key={t} onClick={() => tecla(t)} aria-label={t === "<" ? "Apagar" : t} className={`${btnBase} h-20 text-3xl bg-white/10 border border-white/15`}>{t === "<" ? "⌫" : t}</button>
          ))}
          <button onClick={entrar} disabled={ocupado} className={`${btnBase} h-20 text-2xl bg-green-500 text-green-950`}>Entrar</button>
        </div>
        <button onClick={onVoltar} className="mt-5 text-lg text-white/70 underline">Voltar</button>
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
      <p className="text-2xl font-extrabold">Primeiro acesso: criar a agenda</p>
      {!admin ? <p className="text-xl text-amber-300">A Administração precisa entrar no NFs neste aparelho para criar a agenda.</p> : (
        <>
          <p className="text-lg text-white/70">Só a dona da agenda vai saber este PIN. Depois ela pode autorizar outra pessoa (ex.: a Natali) com outro PIN.</p>
          <label className="block"><span className="text-lg font-bold">Nome da dona da agenda</span><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="block"><span className="text-lg font-bold">PIN (4 a 6 números)</span><input className={campo} inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
          <label className="block"><span className="text-lg font-bold">Repita o PIN</span><input className={campo} inputMode="numeric" type="password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></label>
          {msg && <p className="text-lg text-amber-300">{msg}</p>}
          <button onClick={criar} className={`${btnBase} w-full h-16 text-2xl bg-green-500 text-green-950`}>Criar agenda</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- agenda
function Agenda({ sessao, onSair }: { sessao: AgxSessao; onSair: () => void }) {
  const dona = primeiroNome(sessao.dona.nome);
  const souDona = sessao.usuario.papel === "dona";
  const hoje = ISO(new Date());
  const [lista, setLista] = useState<AgxCompromisso[]>([]);
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [diaSel, setDiaSel] = useState(hoje);
  const [vista, setVista] = useState<"dia" | "semana" | "mes">("mes");
  const [form, setForm] = useState<AgxInput | null>(null);
  const [aviso, setAviso] = useState("");
  const [erroGeral, setErroGeral] = useState("");
  const calRef = useRef<HTMLDivElement>(null);
  const avRef = useRef<HTMLDivElement>(null);

  const avisar = useCallback((t: string) => { setAviso(t); window.setTimeout(() => setAviso(""), 4500); }, []);
  const falhou = useCallback((e: unknown) => { if (api.sessaoInvalida(e)) onSair(); else avisar(erroTxt(e)); }, [onSair, avisar]);

  const carregar = useCallback(() => {
    const de = [ISO(addDays(startOfMonth(mes), -7)), hoje].sort()[0];
    const ate = [ISO(addDays(endOfMonth(mes), 40)), ISO(addDays(new Date(), 14))].sort()[1];
    api.listar(de, ate).then((l) => { setLista(l); setErroGeral(""); }).catch((e) => { if (api.sessaoInvalida(e)) onSair(); else setErroGeral(erroTxt(e)); });
  }, [mes, hoje, onSair]);
  useEffect(carregar, [carregar]);
  useEffect(() => { const t = window.setInterval(carregar, 60_000); return () => window.clearInterval(t); }, [carregar]);

  const porDia = useMemo(() => {
    const m = new Map<string, AgxCompromisso[]>();
    for (const c of lista) m.set(c.data, [...(m.get(c.data) ?? []), c]);
    return m;
  }, [lista]);
  const doDia = (d: string) => porDia.get(d) ?? [];

  const novo = (data = diaSel, extra: Partial<AgxInput> = {}): AgxInput => ({
    id: null, titulo: "", data, hora: "09:00", local: null, observacao: null, categoria: "reuniao",
    avisarVespera: true, avisarDia: true, antecedenciaMin: 60, ...extra,
  });
  const salvar = async (c: AgxInput) => {
    try {
      await api.salvar(c);
      setForm(null); setDiaSel(c.data); setMes(startOfMonth(parseISO(c.data)));
      avisar("✅ Compromisso salvo!"); carregar();
    } catch (e) { falhou(e); }
  };
  const h = new Date().getHours();
  const saudacao = `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, ${primeiroNome(sessao.usuario.nome)}!`;
  const irFalar = () => { window.location.href = "/agenda-claudia/falar"; };
  const ir = (r: React.RefObject<HTMLDivElement | null>) => r.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Titulo nome={dona} />
          <p className="text-base text-white/70">{souDona ? "Sua agenda pessoal de compromissos" : `Você entrou como ${sessao.usuario.nome} (autorizada)`}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={onSair} className={`${btnBase} px-4 h-11 text-base bg-white/10 border border-white/20`}>Sair</button>
          {getCompanySession() && <a href="/" className="text-sm text-white/60 underline">Voltar ao NFs</a>}
        </div>
      </div>
      {erroGeral && <div className={`${glass} text-xl text-amber-300`}>{erroGeral}</div>}

      <div className={glass}>
        <p className="text-3xl font-black">{saudacao}</p>
        <p className="text-lg text-white/70 capitalize mb-3">{format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        {doDia(hoje).length === 0 ? <p className="text-xl text-white/80 py-2">Hoje você não tem compromissos.</p>
          : <><p className="text-xl font-bold">Hoje você tem {doDia(hoje).length} {doDia(hoje).length === 1 ? "compromisso" : "compromissos"}:</p>
            {doDia(hoje).map((c) => <Item key={c.id} c={c} onClick={() => setForm(c)} />)}</>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <BotaoGrande cor="from-blue-600 to-blue-700" icone="📅" texto="Minha Agenda" onClick={() => ir(calRef)} />
          <BotaoGrande cor="from-green-600 to-green-700" icone="➕" texto="Novo Compromisso" onClick={() => setForm(novo(hoje))} />
          <BotaoGrande cor="from-purple-600 to-purple-700" icone="🎙️" texto="Falar" onClick={irFalar} />
          <BotaoGrande cor="from-orange-600 to-orange-700" icone="🔔" texto="Lembretes" onClick={() => ir(avRef)} />
        </div>
      </div>

      <div className={glass} ref={calRef}>
        <div className="flex gap-2 mb-4">
          {(["dia", "semana", "mes"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} className={`${btnBase} flex-1 h-12 text-lg ${vista === v ? "bg-sky-400 text-sky-950" : "bg-white/10 border border-white/20"}`}>{v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}</button>
          ))}
        </div>
        {vista === "mes" && <Mes mes={mes} setMes={setMes} diaSel={diaSel} setDiaSel={setDiaSel} doDia={doDia} hoje={hoje} />}
        {vista === "semana" && <Semana base={diaSel} setDiaSel={(d) => { setDiaSel(d); setVista("dia"); }} doDia={doDia} hoje={hoje} />}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xl font-extrabold capitalize">{diaSel === hoje ? "Hoje" : dataLonga(diaSel)}</p>
            {vista === "dia" && <div className="flex gap-2">
              <button aria-label="Dia anterior" onClick={() => setDiaSel(ISO(addDays(parseISO(diaSel), -1)))} className={`${btnBase} w-12 h-12 text-2xl bg-white/10`}>‹</button>
              <button aria-label="Próximo dia" onClick={() => setDiaSel(ISO(addDays(parseISO(diaSel), 1)))} className={`${btnBase} w-12 h-12 text-2xl bg-white/10`}>›</button>
            </div>}
          </div>
          {doDia(diaSel).length === 0 ? <p className="text-lg text-white/70">Nenhum compromisso neste dia.</p> : doDia(diaSel).map((c) => <Item key={c.id} c={c} onClick={() => setForm(c)} />)}
          <button onClick={() => setForm(novo(diaSel))} className={`${btnBase} w-full h-14 mt-3 text-xl bg-green-500/90 text-green-950`}>➕ Adicionar neste dia</button>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 text-base text-white/75">
          {CATEGORIAS.map((c) => <span key={c.id} className="inline-flex items-center gap-1.5"><i className="w-3.5 h-3.5 rounded" style={{ background: c.cor }} />{c.nome}</span>)}
        </div>
      </div>

      {souDona && <AgendaClaudiaAlarme donaId={sessao.dona.id} compromissos={lista} />}
      <div ref={avRef}><PainelAvisos sessao={sessao} avisar={avisar} /></div>
      {souDona && <PainelAcessos avisar={avisar} falhou={falhou} />}
      <PainelHistorico lista={lista} />

      <button onClick={irFalar} aria-label="Falar compromisso"
        className="fixed right-5 bottom-6 z-30 w-20 h-20 rounded-full text-4xl text-white shadow-2xl"
        style={{ background: "linear-gradient(135deg,#38bdf8,#8b5cf6)", boxShadow: "0 0 0 8px rgba(56,189,248,.18),0 12px 30px rgba(0,0,0,.45)" }}>🎙️</button>

      {form && <Formulario inicial={form} lista={lista} onFechar={() => setForm(null)} onSalvar={salvar}
        onConcluir={async (c, v) => { try { await api.concluir(c, v); setForm(null); carregar(); avisar(v ? "Marcado como concluído." : "Reaberto."); } catch (e) { falhou(e); } }}
        onExcluir={async (c) => { try { await api.excluir(c); setForm(null); carregar(); avisar("Compromisso excluído."); } catch (e) { falhou(e); } }} />}
      {aviso && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-32 z-50 rounded-2xl bg-slate-900 border border-white/20 px-6 py-4 text-xl font-bold shadow-2xl">{aviso}</div>}
    </div>
  );
}

function BotaoGrande({ cor, icone, texto, onClick }: { cor: string; icone: string; texto: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${btnBase} bg-gradient-to-br ${cor} h-28 text-xl flex flex-col items-center justify-center gap-1 shadow-xl`}>
      <span className="text-4xl" aria-hidden>{icone}</span>{texto}
    </button>
  );
}

function Item({ c, onClick }: { c: AgxCompromisso; onClick: () => void }) {
  const cat = categoria(c.categoria);
  return (
    <button onClick={onClick} className={`w-full text-left flex gap-4 items-center rounded-2xl bg-white/[0.06] p-4 my-2 border-l-8 ${c.concluido ? "opacity-50" : ""}`} style={{ borderColor: cat.cor }}>
      <span className="text-2xl font-black min-w-[4.5rem]">{horaTxt(c.hora)}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-xl font-bold ${c.concluido ? "line-through" : ""}`}>{c.titulo}</span>
        <span className="block text-base text-white/70">
          {c.local && <>📍 {c.local} · </>}
          <span className="font-bold rounded-full px-2" style={{ background: `${cat.cor}55` }}>{cat.nome}</span>
          {c.criadoPor && <> · por {primeiroNome(c.criadoPor)}</>}
          {c.avisoVistoEm && <> · <b className="text-green-300">✔ aviso visto {format(parseISO(c.avisoVistoEm), "HH:mm")}</b></>}
        </span>
      </span>
    </button>
  );
}

function Mes({ mes, setMes, diaSel, setDiaSel, doDia, hoje }: {
  mes: Date; setMes: (d: Date) => void; diaSel: string; setDiaSel: (d: string) => void; doDia: (d: string) => AgxCompromisso[]; hoje: string;
}) {
  const dias: Date[] = [];
  for (let d = startOfWeek(mes); d <= endOfWeek(endOfMonth(mes)); d = addDays(d, 1)) dias.push(d);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button aria-label="Mês anterior" onClick={() => setMes(subMonths(mes, 1))} className={`${btnBase} w-14 h-12 text-3xl bg-white/10`}>‹</button>
        <p className="text-2xl font-extrabold capitalize">{format(mes, "MMMM yyyy", { locale: ptBR })}</p>
        <button aria-label="Próximo mês" onClick={() => setMes(addMonths(mes, 1))} className={`${btnBase} w-14 h-12 text-3xl bg-white/10`}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="text-center text-base font-bold text-white/60">{d}</div>)}
        {dias.map((d) => {
          const iso = ISO(d), evs = doDia(iso);
          return (
            <button key={iso} onClick={() => setDiaSel(iso)} aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${evs.length} compromissos`}
              className={`min-h-[3.75rem] rounded-xl p-1 text-left border-2 ${iso === diaSel ? "border-sky-300 bg-sky-400/20" : iso === hoje ? "border-yellow-300" : "border-transparent bg-white/[0.05]"} ${isSameMonth(d, mes) ? "" : "opacity-40"}`}>
              <span className="block text-lg font-extrabold leading-none">{format(d, "d")}</span>
              <span className="flex flex-wrap gap-0.5 mt-1">{evs.slice(0, 4).map((c) => <i key={c.id} className="w-2.5 h-2.5 rounded-full" style={{ background: categoria(c.categoria).cor }} />)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Semana({ base, setDiaSel, doDia, hoje }: { base: string; setDiaSel: (d: string) => void; doDia: (d: string) => AgxCompromisso[]; hoje: string }) {
  const ini = startOfWeek(parseISO(base));
  return (
    <div className="grid gap-2">
      {Array.from({ length: 7 }, (_, i) => addDays(ini, i)).map((d) => {
        const iso = ISO(d), evs = doDia(iso);
        return (
          <button key={iso} onClick={() => setDiaSel(iso)} className={`text-left rounded-2xl p-3 bg-white/[0.05] border-2 ${iso === hoje ? "border-yellow-300" : "border-transparent"}`}>
            <span className="block text-lg font-extrabold capitalize">{format(d, "EEEE, d/MM", { locale: ptBR })}</span>
            {evs.length === 0 ? <span className="text-base text-white/50">Livre</span>
              : evs.map((c) => <span key={c.id} className="block text-lg"><b style={{ color: categoria(c.categoria).cor }}>●</b> {horaTxt(c.hora)} {c.titulo}</span>)}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- formulário
function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end md:items-center justify-center" onClick={onFechar}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-xl max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl md:rounded-3xl bg-[#0f1d3f] border border-white/15 p-5 text-white text-lg">
        <div className="flex items-center justify-between mb-3">
          <p className="text-2xl font-black">{titulo}</p>
          <button onClick={onFechar} aria-label="Fechar" className={`${btnBase} w-12 h-12 text-2xl bg-white/10`}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Formulario({ inicial, lista, onFechar, onSalvar, onConcluir, onExcluir }: {
  inicial: AgxInput | AgxCompromisso; lista: AgxCompromisso[]; onFechar: () => void; onSalvar: (c: AgxInput) => void;
  onConcluir: (id: number, v: boolean) => void; onExcluir: (id: number) => void;
}) {
  const [f, setF] = useState<AgxInput>(inicial);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof AgxInput>(k: K, v: AgxInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const existente = "concluido" in inicial ? inicial : null;
  const conflitos = lista.filter((c) => c.id !== f.id && c.data === f.data && !c.concluido &&
    (c.hora == null || f.hora == null || Math.abs(toMin(c.hora) - toMin(f.hora)) < 60));
  const enviar = () => {
    if (!f.titulo.trim()) { setMsg("Escreva o nome do compromisso."); return; }
    if (!f.data) { setMsg("Escolha a data."); return; }
    onSalvar(f);
  };
  return (
    <Folha titulo={f.id ? "Editar compromisso" : "Novo compromisso"} onFechar={onFechar}>
      <div className="space-y-4">
        <label className="block"><span className="font-bold">O que é?</span>
          <input className={campo} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Reunião na Prefeitura" autoFocus={!f.id} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="font-bold">Dia</span><input type="date" className={campo} value={f.data} onChange={(e) => set("data", e.target.value)} /></label>
          <label className="block"><span className="font-bold">Horário</span>
            <input type="time" className={campo} value={f.hora ?? ""} disabled={f.hora == null} onChange={(e) => set("hora", e.target.value || null)} /></label>
        </div>
        <label className="flex items-center gap-3 text-xl"><input type="checkbox" className="w-7 h-7" checked={f.hora == null} onChange={(e) => set("hora", e.target.checked ? null : "09:00")} /> Dia todo (sem horário)</label>
        <label className="block"><span className="font-bold">Onde? (opcional)</span>
          <input className={campo} value={f.local ?? ""} onChange={(e) => set("local", e.target.value || null)} placeholder="Ex.: Prefeitura" /></label>
        <div><span className="font-bold">Tipo</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {CATEGORIAS.map((c) => (
              <button key={c.id} type="button" onClick={() => set("categoria", c.id)} className={`rounded-full px-4 h-12 text-lg font-bold border-2 ${f.categoria === c.id ? "text-white" : "text-white/80 border-white/20"}`}
                style={f.categoria === c.id ? { background: c.cor, borderColor: c.cor } : undefined}>{c.nome}</button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
          <p className="font-extrabold text-xl">🔔 Avisos no celular</p>
          <label className="flex items-center gap-3 text-xl"><input type="checkbox" className="w-7 h-7" checked={f.avisarVespera} onChange={(e) => set("avisarVespera", e.target.checked)} /> No dia anterior, às 18h</label>
          <label className="flex items-center gap-3 text-xl"><input type="checkbox" className="w-7 h-7" checked={f.avisarDia} onChange={(e) => set("avisarDia", e.target.checked)} /> No próprio dia, às 7h</label>
          {f.hora != null && <label className="block"><span className="font-bold">Antes do horário</span>
            <select className={campo} value={f.antecedenciaMin ?? ""} onChange={(e) => set("antecedenciaMin", e.target.value === "" ? null : Number(e.target.value))}>
              {ANTES.map(([v, t]) => <option key={String(v)} value={v ?? ""}>{t}</option>)}
            </select></label>}
        </div>
        <label className="block"><span className="font-bold">Observação (opcional)</span>
          <textarea className={`${campo} h-24 py-3`} value={f.observacao ?? ""} onChange={(e) => set("observacao", e.target.value || null)} /></label>
        {conflitos.length > 0 && <p className="rounded-2xl bg-amber-400/15 border border-amber-300/50 p-3 text-lg text-amber-200">
          ⚠️ Neste dia já tem: {conflitos.map((c) => `${horaTxt(c.hora)} ${c.titulo}`).join("; ")}</p>}
        {existente && (existente.criadoPor || existente.atualizadoPor) && <p className="text-base text-white/60">
          Criado por {existente.criadoPor ?? "—"} · {format(parseISO(existente.createdAt), "dd/MM HH:mm")}
          {existente.atualizadoPor && existente.updatedAt !== existente.createdAt && <> · alterado por {existente.atualizadoPor} · {format(parseISO(existente.updatedAt), "dd/MM HH:mm")}</>}</p>}
        {msg && <p className="text-lg text-amber-300" role="alert">{msg}</p>}
        <button onClick={enviar} className={`${btnBase} w-full h-16 text-2xl bg-green-500 text-green-950`}>Salvar</button>
        {existente && <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onConcluir(existente.id, !existente.concluido)} className={`${btnBase} h-14 text-lg bg-white/10 border border-white/20`}>{existente.concluido ? "Reabrir" : "✔ Concluído"}</button>
          <button onClick={() => { if (window.confirm(`Excluir "${existente.titulo}"?`)) onExcluir(existente.id); }} className={`${btnBase} h-14 text-lg bg-red-500/80`}>Excluir</button>
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
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  useEffect(() => () => rec.current?.stop(), []);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); installEvt = e as BeforeInstall; setPodeInstalar(true); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  const entender = (t = txt) => { setSalvo(""); if (t.trim()) setRes(interpretarFrase(t)); };
  const ouvir = () => {
    setRes(null); setSalvo("");
    if (!Rec) { setDica("Toque no campo abaixo e use o microfone 🎤 do teclado do celular para falar."); return; }
    try {
      const r = new Rec();
      r.lang = "pt-BR"; r.interimResults = true; r.continuous = false;
      r.onresult = (e) => {
        const t = Array.from(e.results).map((x) => x[0].transcript).join(" ");
        setTxt(t);
        if (e.results[e.results.length - 1].isFinal) entender(t);
      };
      r.onerror = (e) => setDica(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "O microfone está bloqueado. Libere o microfone para o NFs nas configurações, ou use o microfone 🎤 do teclado."
        : e.error === "no-speech" ? "Não ouvi nada. Toque no microfone e fale o compromisso."
        : e.error === "network" ? "Sem internet: o reconhecimento de voz precisa de internet." : "Não consegui ouvir. Use o microfone 🎤 do teclado.");
      r.onend = () => setOuvindo(false);
      rec.current = r; r.start(); setOuvindo(true); setDica("");
    } catch { setDica("Use o microfone 🎤 do teclado do celular para falar."); }
  };
  const salvar = async (c: AgxInput) => {
    try {
      await api.salvar(c);
      setSalvo(`${c.titulo} · ${dataLonga(c.data)} · ${horaTxt(c.hora)}`);
      setRes(null); setTxt(""); setForm(null);
      window.history.replaceState(null, "", "/agenda-claudia/falar");
    } catch (e) { if (api.sessaoInvalida(e)) onSair(); else setDica(erroTxt(e)); }
  };
  const input = res && novoCompromisso(res.data ?? ISO(new Date()), {
    titulo: res.titulo, hora: res.diaTodo ? null : res.hora ?? "09:00", local: res.local, categoria: res.categoria,
  });
  const pronto = Boolean(res && res.data && (res.hora || res.diaTodo));
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <p className="text-3xl font-black">Olá, {nome}!</p>
        <a href="/agenda-claudia" className={`${btnBase} px-4 py-3 text-lg bg-white/10 border border-white/20`}>📅 Ver agenda</a>
      </div>
      <button onClick={ouvindo ? () => rec.current?.stop() : ouvir} aria-label={ouvindo ? "Parar de ouvir" : "Tocar e falar"}
        className={`mx-auto flex flex-col items-center justify-center w-64 h-64 rounded-full text-8xl shadow-2xl transition active:scale-95 ${ouvindo ? "bg-red-500 animate-pulse" : ""}`}
        style={ouvindo ? undefined : { background: "linear-gradient(135deg,#38bdf8,#8b5cf6)", boxShadow: "0 0 0 14px rgba(56,189,248,.18),0 20px 40px rgba(0,0,0,.45)" }}>
        🎙️<span className="text-2xl font-black mt-2">{ouvindo ? "Ouvindo…" : "Toque e fale"}</span>
      </button>
      <p className="text-center text-lg text-white/75">Ex.: “Agendar reunião amanhã às 9 horas na Prefeitura”</p>
      {dica && <p className="text-xl text-amber-300 text-center" role="alert">{dica}</p>}
      {salvo && <div className="rounded-2xl bg-green-500/20 border border-green-400/50 p-4 text-xl" role="status"><b>✅ Salvo na agenda:</b> <span className="capitalize">{salvo}</span></div>}
      {res && input && (
        <div className="rounded-2xl bg-sky-400/10 border border-sky-300/40 p-4 space-y-2 text-xl">
          <p className="text-2xl font-black">{res.titulo}</p>
          <p>📅 {res.data ? <span className="capitalize">{dataLonga(res.data)}</span> : <b className="text-amber-300">faltou o dia</b>}</p>
          <p>⏰ {res.diaTodo ? "Dia todo" : res.hora ? horaTxt(res.hora) : <b className="text-amber-300">faltou o horário</b>}</p>
          {res.local && <p>📍 {res.local}</p>}
          {!pronto && <p className="text-lg text-amber-200">Fale de novo com {res.falta.map((x) => (x === "data" ? "o dia" : "o horário")).join(" e ")}, ou toque em Corrigir.</p>}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button disabled={!pronto} onClick={() => salvar(input)} className={`${btnBase} h-16 text-xl bg-green-500 text-green-950`}>Salvar</button>
            <button onClick={() => setForm(input)} className={`${btnBase} h-16 text-xl bg-yellow-400 text-yellow-950`}>Corrigir</button>
            <button onClick={() => { setRes(null); setTxt(""); }} className={`${btnBase} h-16 text-xl bg-white/15`}>Cancelar</button>
          </div>
        </div>
      )}
      <textarea className={`${campo} h-24 py-3`} value={txt} onChange={(e) => { setTxt(e.target.value); setRes(null); }} placeholder="Ou escreva aqui o compromisso…" />
      {!res && txt.trim() && <button onClick={() => entender()} className={`${btnBase} w-full h-16 text-2xl bg-sky-400 text-sky-950`}>Continuar</button>}
      {!instalado() && ehAndroid() && podeInstalar && (
        <button onClick={async () => { await installEvt?.prompt(); installEvt = null; setPodeInstalar(false); }}
          className={`${btnBase} w-full h-16 text-xl bg-white/10 border border-white/25`}>📲 Colocar o botão “Falar” na tela inicial</button>
      )}
      {ehIOS() && <AtalhoIphone />}
      {form && <Formulario inicial={form} lista={[]} onFechar={() => setForm(null)} onSalvar={salvar} onConcluir={() => {}} onExcluir={() => {}} />}
    </div>
  );
}

function AtalhoIphone() {
  const [aberto, setAberto] = useState(false);
  const url = `${window.location.origin}/agenda-claudia/falar?texto=`;
  return (
    <div className={glass}>
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-xl font-black text-left">
        <span>🍎 iPhone: botão de microfone na tela inicial</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <ol className="mt-3 space-y-2 text-lg list-decimal pl-6">
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
      <p className="text-2xl font-black mb-1">🔔 Lembretes no celular</p>
      <p className="text-lg text-white/75 mb-3">Com a permissão do celular, chegam mesmo com o app fechado: no dia anterior, no dia, antes e na hora do compromisso. O som segue as configurações do aparelho.</p>
      {!souDona ? (
        <p className="text-xl">Os avisos vão só para o celular da {dona}. {status && <>Ela tem {status.aparelhos} {status.aparelhos === 1 ? "aparelho ativo" : "aparelhos ativos"}.</>}</p>
      ) : (
        <div className="space-y-3">
          {status && !status.configurado && <p className="text-lg text-amber-300">Falta configurar a chave dos avisos no servidor.</p>}
          {iosSemApp && (
            <div className="rounded-2xl bg-white/[0.08] p-4 text-lg space-y-1">
              <p className="font-extrabold text-xl">No iPhone, primeiro instale o app:</p>
              <p>1. Abra este endereço no <b>Safari</b>.</p>
              <p>2. Toque em <b>Compartilhar</b> (quadrado com a seta para cima).</p>
              <p>3. Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.</p>
              <p>4. Abra pelo ícone <b>Agenda</b> e toque em <b>Ativar avisos</b>.</p>
            </div>
          )}
          {!instalado() && ehAndroid() && podeInstalar && (
            <button onClick={async () => { await installEvt?.prompt(); installEvt = null; setPodeInstalar(false); }}
              className={`${btnBase} w-full h-16 text-xl bg-white/10 border border-white/25`}>📲 Instalar o app na tela inicial</button>
          )}
          <p className={`text-xl font-bold ${ativoAqui ? "text-green-300" : "text-white/80"}`}>
            {ativoAqui ? "✅ Avisos ativos neste celular" : "Avisos desligados neste celular"}</p>
          {status?.esteAparelho?.ultimoErro && <p className="text-base text-amber-300">Último problema: {status.esteAparelho.ultimoErro}</p>}
          {!ativoAqui && <button disabled={ocupado || iosSemApp || !pushSuportado()} onClick={() => agir(ativarAvisos, "✅ Avisos ativados!")}
            className={`${btnBase} w-full h-16 text-2xl bg-green-500 text-green-950`}>Ativar avisos neste celular</button>}
          {ativoAqui && <>
            <button disabled={ocupado} onClick={() => agir(() => api.testarPush(0), "Aviso de teste enviado. Deve chegar em instantes.")}
              className={`${btnBase} w-full h-16 text-xl bg-sky-400 text-sky-950`}>Testar agora</button>
            <button disabled={ocupado} onClick={() => agir(() => api.testarPush(45), "Agora feche o app. Em 1 a 2 minutos chega o aviso.")}
              className={`${btnBase} w-full h-16 text-xl bg-violet-500`}>Testar com o app fechado</button>
            <button disabled={ocupado} onClick={() => agir(desativarAvisos, "Avisos desligados neste celular.")}
              className="w-full text-base text-white/60 underline py-2">Desligar avisos neste celular</button>
          </>}
          {!pushSuportado() && !iosSemApp && <p className="text-lg text-amber-300">Este navegador não recebe avisos. No Android, use o Chrome.</p>}
          {status && <p className="text-base text-white/60">Aparelhos que recebem seus avisos: {status.aparelhos}</p>}
          {msg && <p className="text-lg text-amber-300" role="alert">{msg}</p>}
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
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-2xl font-black">
        <span>👥 Quem pode mexer na agenda</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <div className="space-y-4 mt-3">
        {pessoas.length === 0 ? <p className="text-lg text-white/70">Só você.</p> : pessoas.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white/[0.06] p-3">
            <span className="text-xl font-bold">{p.nome}</span>
            <button onClick={async () => { if (!window.confirm(`Tirar o acesso de ${p.nome}?`)) return; try { await api.revogar(p.id); carregar(); avisar("Acesso removido."); } catch (e) { falhou(e); } }}
              className={`${btnBase} px-4 h-12 text-base bg-red-500/80`}>Remover</button>
          </div>
        ))}
        <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
          <p className="text-xl font-bold">Autorizar outra pessoa</p>
          <input className={campo} placeholder="Nome (ex.: Natali)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className={campo} placeholder="PIN dela (4 a 6 números)" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <p className="text-base text-white/60">Ela vai poder ver e mexer nos compromissos. Os avisos continuam indo só para você.</p>
          <button onClick={async () => { try { await api.autorizar(nome, pin); setNome(""); setPin(""); carregar(); avisar("Acesso autorizado."); } catch (e) { falhou(e); } }}
            disabled={nome.trim().length < 2 || pin.length < 4} className={`${btnBase} w-full h-14 text-xl bg-green-500 text-green-950`}>Autorizar</button>
        </div>
        <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
          <p className="text-xl font-bold">Trocar meu PIN</p>
          <input className={campo} placeholder="PIN atual" type="password" inputMode="numeric" maxLength={6} value={atual} onChange={(e) => setAtual(e.target.value.replace(/\D/g, ""))} />
          <input className={campo} placeholder="PIN novo" type="password" inputMode="numeric" maxLength={6} value={novoPin} onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, ""))} />
          <button onClick={async () => { try { await api.trocarPin(atual, novoPin); setAtual(""); setNovoPin(""); avisar("PIN trocado."); } catch (e) { falhou(e); } }}
            disabled={atual.length < 4 || novoPin.length < 4} className={`${btnBase} w-full h-14 text-xl bg-white/15`}>Trocar PIN</button>
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
      <button onClick={() => setAberto(!aberto)} className="w-full flex justify-between items-center text-2xl font-black">
        <span>🕘 Últimas alterações</span><span>{aberto ? "▲" : "▼"}</span></button>
      {aberto && <div className="mt-3 space-y-2">
        {itens.length === 0 ? <p className="text-lg text-white/70">Nada por enquanto.</p> : itens.slice(0, 30).map((h, i) => (
          <p key={i} className="text-lg"><b>{h.por ?? "—"}</b> {h.acao} {h.titulo && <>“{h.titulo}”</>} <span className="text-white/60">· {format(parseISO(h.em), "dd/MM HH:mm")}</span></p>
        ))}
      </div>}
    </div>
  );
}

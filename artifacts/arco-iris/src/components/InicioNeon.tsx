import { useEffect, useState } from "react";
import { Link } from "wouter";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CalendarCheck, CalendarDays, ChevronRight, Clock, Megaphone, Settings, Snowflake, ListTodo, Users, Zap } from "lucide-react";
import { agoraBR, fraseDoMomento, periodo } from "@/components/Saudacao";
import { listCompromissos, type Compromisso } from "@/lib/agenda-admin-rpc";
import { getCurrentScope } from "@/lib/portal-session";

export const img3d = (n: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${n}.webp`;
export const IMG_PERIODO = ["visual/sol", "visual/tarde", "visual/lua"];

const ATALHOS = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays, cor: "#38bdf8" },
  { href: "/professionals", label: "Equipe", icon: Users, cor: "#a78bfa" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, cor: "#34d399" },
  { href: "/personalizacao-visual", label: "Ajustes", icon: Settings, cor: "#fb923c" },
];
const TONS = [
  { icon: CalendarCheck, cor: "#a78bfa", tag: "Evento" },
  { icon: Megaphone, cor: "#38bdf8", tag: "Informativo" },
  { icon: Clock, cor: "#34d399", tag: "Planejamento" },
];

/** Tela Início (Painel de Gestão) no visual roxo-noite neon. Só dados reais: agenda administrativa, fila e pausados. */
export function InicioNeon({ fila, pausados }: { fila: number | null; pausados: number | null }) {
  const [agora, setAgora] = useState(agoraBR);
  const [proximos, setProximos] = useState<Compromisso[] | null>(null);
  useEffect(() => {
    const t = setInterval(() => setAgora(agoraBR()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const hoje = new Date();
    let vivo = true;
    listCompromissos(format(hoje, "yyyy-MM-dd"), format(addDays(hoje, 60), "yyyy-MM-dd"))
      .then((l) => { if (vivo) setProximos(l.filter((c) => !c.concluido).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`)).slice(0, 3)); })
      .catch(() => { if (vivo) setProximos([]); });
    return () => { vivo = false; };
  }, []);

  const quem = getCurrentScope() === "reception" ? "Equipe da Recepção" : "Equipe de Gestão";
  const { idx, texto } = periodo(agora.getHours());
  const frase = fraseDoMomento(quem, null, agora);
  const pendencias = [
    fila ? { href: "/waiting-list", icon: ListTodo, titulo: `${fila} paciente${fila === 1 ? "" : "s"} na fila de espera`, sub: "Aguardando vaga" } : null,
    pausados ? { href: "/pausados", icon: Snowflake, titulo: `${pausados} paciente${pausados === 1 ? "" : "s"} pausado${pausados === 1 ? "" : "s"}`, sub: "Conferir retorno" } : null,
  ].filter(Boolean) as { href: string; icon: typeof ListTodo; titulo: string; sub: string }[];

  return (
    <div className="inicio-neon space-y-5 mb-6">
      {/* Herói */}
      <section className="relative flex items-center gap-2 pt-1">
        <div className="flex-1 min-w-0 z-10">
          <h1 className="font-display font-extrabold text-[34px] sm:text-5xl leading-[1.08] text-foreground">
            {texto},<br />
            <span className="bg-gradient-to-r from-fuchsia-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">{quem}</span>
          </h1>
          <div className="mt-3 h-1.5 w-28 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 via-40% to-sky-400" />
          <p className="mt-3 text-lg sm:text-xl text-foreground/85 leading-snug">Juntos, construímos uma inclusão cada vez maior!</p>
        </div>
        <img src={img3d("visual/coracao")} alt="" aria-hidden width={180} height={180} className="w-36 h-36 sm:w-48 sm:h-48 shrink-0 object-contain drop-shadow-[0_0_30px_rgba(99,102,241,.55)]" />
      </section>

      {/* Atalhos */}
      <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2.5 sm:gap-4 max-w-3xl">
        {ATALHOS.map((a) => (
          <Link key={a.href} href={a.href} className="neon-tile flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-1 text-center" style={{ ["--c" as string]: a.cor } as React.CSSProperties}>
            <a.icon className="w-8 h-8" style={{ color: a.cor, filter: `drop-shadow(0 0 8px ${a.cor})` }} />
            <span className="text-[13px] sm:text-[15px] font-semibold text-white leading-tight break-words">{a.label}</span>
          </Link>
        ))}
      </nav>

      {/* Saudação com desenho do período */}
      <section className="neon-painel flex items-center gap-4 sm:gap-6 p-4 sm:p-6" style={{ ["--c" as string]: "#8b5cf6" } as React.CSSProperties}>
        <span className="grid place-items-center w-24 h-24 sm:w-28 sm:h-28 rounded-full shrink-0 bg-violet-500/15 shadow-[0_0_30px_-6px_rgba(139,92,246,.8)]">
          <img src={img3d(IMG_PERIODO[idx])} alt="" aria-hidden width={88} height={88} className="w-20 h-20 sm:w-24 sm:h-24 object-contain" />
        </span>
        <span className="w-px self-stretch bg-violet-300/30" />
        <div className="min-w-0">
          <p className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight">{texto}, <span className="text-violet-300">Equipe!</span></p>
          <p className="mt-1.5 text-base sm:text-lg text-white/85 leading-snug">{frase}</p>
          <div className="mt-2.5 h-1 w-20 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Últimas atualizações (Agenda Administrativa) */}
        <section className="neon-painel p-4 sm:p-5" style={{ ["--c" as string]: "#8b5cf6" } as React.CSSProperties}>
          <div className="flex items-center gap-3 mb-3">
            <span className="grid place-items-center w-10 h-10 rounded-full bg-violet-500/20"><Zap className="w-6 h-6 text-violet-300" /></span>
            <h2 className="flex-1 font-display text-xl sm:text-2xl font-bold text-white">Próximos compromissos</h2>
            <Link href="/agenda-administrativa" className="text-base font-semibold text-violet-300 whitespace-nowrap">Ver todas →</Link>
          </div>
          <div className="space-y-2.5">
            {proximos === null && <p className="text-white/60 text-base animate-pulse px-1">Carregando…</p>}
            {proximos?.length === 0 && <p className="text-white/65 text-base px-1">Nenhum compromisso marcado. Toque em “Ver todas” para criar.</p>}
            {proximos?.map((c, i) => {
              const t = TONS[i % TONS.length];
              return (
                <Link key={c.id} href="/agenda-administrativa" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-3">
                  <span className="grid place-items-center w-14 h-14 rounded-full shrink-0" style={{ background: `${t.cor}22`, boxShadow: `0 0 18px -6px ${t.cor}`, border: `1px solid ${t.cor}55` }}>
                    <t.icon className="w-7 h-7" style={{ color: t.cor }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-white leading-snug break-words">{c.titulo}</span>
                    {c.local && <span className="block text-base text-white/75 truncate">{c.local}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/75">
                      <CalendarDays className="w-4 h-4" /> {format(new Date(`${c.data}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })} · {c.hora}
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${t.cor}33`, color: t.cor }}>{t.tag}</span>
                    </span>
                  </span>
                  <ChevronRight className="w-6 h-6 text-white/50 shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Pendências (fila e pausados reais) */}
        <section className="neon-painel p-4 sm:p-5" style={{ ["--c" as string]: "#f59e0b" } as React.CSSProperties}>
          <div className="flex items-center gap-3 mb-3">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-amber-400 text-[#1b1240] text-xl font-black">!</span>
            <h2 className="flex-1 font-display text-xl sm:text-2xl font-bold text-white">Pendências</h2>
            {pendencias.length > 0 && <span className="rounded-full bg-amber-400 text-[#1b1240] px-3 py-1 text-sm font-bold">{pendencias.length} {pendencias.length === 1 ? "item" : "itens"}</span>}
          </div>
          <div className="space-y-2">
            {fila === null && pausados === null && <p className="text-white/60 text-base animate-pulse px-1">Carregando…</p>}
            {(fila !== null || pausados !== null) && pendencias.length === 0 && <p className="text-white/65 text-base px-1">Tudo em dia por aqui.</p>}
            {pendencias.map((p) => (
              <Link key={p.href} href={p.href} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-3">
                <p.icon className="w-7 h-7 text-white/85 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-white leading-snug">{p.titulo}</span>
                  <span className="block text-sm text-white/65">{p.sub}</span>
                </span>
                <ChevronRight className="w-6 h-6 text-white/50 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Banner */}
      <section className="relative overflow-hidden rounded-[26px] border border-violet-400/40 shadow-[0_0_30px_-10px_rgba(139,92,246,.8)] h-36 sm:h-48">
        <img src={img3d("visual/banner")} alt="Mãos de adulto e criança segurando um coração de quebra-cabeça" className="absolute inset-0 w-full h-full object-cover object-left" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2e1065]/30 to-[#2e1065]/70" />
        <p className="absolute right-4 sm:right-10 top-1/2 -translate-y-1/2 w-[58%] text-right text-white text-[26px] sm:text-[40px] leading-[1.05] -rotate-[4deg]" style={{ fontFamily: "Caveat, cursive", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>
          Inclusão é construir juntos um mundo melhor! ♡
        </p>
      </section>
    </div>
  );
}

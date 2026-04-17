import { useEffect, useState, useMemo } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import { TrendingUp, DollarSign, Users, AlertTriangle, ChevronDown, Sparkles, Target, BarChart3, LayoutList, Search } from "lucide-react";
import { Card, Button } from "@/components/ui-custom";
import { motion, AnimatePresence } from "framer-motion";

// ── Constantes fixas ─────────────────────────────────────────────────────────
const VALOR_REPASSE = 30;         // R$ por sessão (Prefeitura)
const VALOR_GRUPO   = 60;         // R$ por sessão em grupo (2 crianças)
const DIAS_UTEIS    = 20;         // dias úteis por mês (referência)

// Teto de faturamento por carga horária (JS puro)
const TETO: Record<string, number> = { "20h": 3600, "30h": 5400 };
const getTeto = (carga: string) => TETO[carga] ?? 5400;

type Appointment = { id: number; status: string; date: string };

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentMonthRange() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo:   `${y}-${m}-${lastDay}`,
    label:    now.toLocaleString("pt-BR", { month: "long", year: "numeric" }),
  };
}

const CANCELLED_STATUSES = new Set(["desmarcado", "remarcado"]);

export default function Lucratividade() {
  const { data: professionals = [] } = useGetProfessionals({} as any);
  const [view, setView] = useState<"analise" | "painel">("analise");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGrupos, setShowGrupos] = useState(false);
  const [open, setOpen] = useState(false);

  const { dateFrom, dateTo, label: mesLabel } = getCurrentMonthRange();

  useEffect(() => {
    if (!selectedId) { setAppointments([]); return; }
    setLoading(true);
    fetch(`/api/appointments?professionalId=${selectedId}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(r => r.json())
      .then((data: Appointment[]) => setAppointments(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId, dateFrom, dateTo]);

  const selectedProfessional = useMemo(
    () => professionals.find((p: any) => p.id === selectedId),
    [professionals, selectedId]
  );

  // Custo e teto do profissional selecionado (usa salário individual ou teto de carga)
  const tetoSelecionado  = selectedProfessional ? getTeto(selectedProfessional.cargaHoraria ?? "30h") : 5400;
  const custoSelecionado = selectedProfessional?.salario ?? tetoSelecionado;
  const breakEvenMes     = Math.ceil(custoSelecionado / VALOR_REPASSE);
  const breakEvenDia     = (breakEvenMes / DIAS_UTEIS).toFixed(1);

  const totalPacientesMes = useMemo(
    () => appointments.filter(a => !CANCELLED_STATUSES.has(a.status)).length,
    [appointments]
  );

  const totalAtendidos = useMemo(
    () => appointments.filter(a => a.status === "atendimento").length,
    [appointments]
  );

  const faturamento      = totalPacientesMes * VALOR_REPASSE;
  const saldo            = faturamento - custoSelecionado;
  const isPositive       = saldo >= 0;
  const pctMeta          = Math.min(100, Math.round((totalPacientesMes / breakEvenMes) * 100));
  const faltam           = Math.max(0, breakEvenMes - totalPacientesMes);

  const faturamentoGrupo = totalPacientesMes * VALOR_GRUPO;
  const saldoGrupo       = faturamentoGrupo - custoSelecionado;

  // Painel de Gestão — dados de todos os profissionais (JS puro)
  const painelRows = useMemo(() => {
    return (professionals as any[]).map((p: any) => {
      const teto  = getTeto(p.cargaHoraria ?? "30h");
      const custo = p.salario ?? null;
      const saldoContratual = custo != null ? teto - custo : null;
      return { ...p, teto, custo, saldoContratual };
    }).sort((a: any, b: any) => {
      // Primeiro os com prejuízo (saldo negativo), depois os sem salário, depois positivos
      if (a.saldoContratual == null && b.saldoContratual == null) return 0;
      if (a.saldoContratual == null) return 1;
      if (b.saldoContratual == null) return -1;
      return a.saldoContratual - b.saldoContratual;
    });
  }, [professionals]);

  const painelTotais = useMemo(() => {
    const comSalario = painelRows.filter((r: any) => r.custo != null);
    const totalCusto = comSalario.reduce((s: number, r: any) => s + r.custo, 0);
    const totalTeto  = comSalario.reduce((s: number, r: any) => s + r.teto, 0);
    return { totalCusto, totalTeto, saldoGeral: totalTeto - totalCusto, count: comSalario.length };
  }, [painelRows]);

  const NEON_BLUE  = "#00d4ff";
  const NEON_RED   = "#ff2060";
  const NEON_GREEN = "#00ff9f";
  const corSaldo   = isPositive ? NEON_GREEN : NEON_RED;
  const corLabel   = isPositive ? "SUPERÁVIT" : "DÉFICIT";

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3"
            style={{ color: NEON_BLUE, textShadow: `0 0 24px ${NEON_BLUE}66` }}>
            <DollarSign className="w-8 h-8" style={{ filter: `drop-shadow(0 0 8px ${NEON_BLUE})` }} />
            Lucratividade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise financeira por profissional · {mesLabel}
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-full text-xs font-bold border"
          style={{ background: "rgba(0,212,255,0.08)", borderColor: "rgba(0,212,255,0.25)", color: NEON_BLUE }}>
          Repasse: {fmt(VALOR_REPASSE)}/sessão · 20h = {fmt(3600)} · 30h = {fmt(5400)}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 p-1 rounded-2xl"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {([
          { key: "analise", label: "Por Profissional", icon: BarChart3 },
          { key: "painel",  label: "Painel de Gestão",  icon: LayoutList },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: view === tab.key ? "rgba(0,212,255,0.12)" : "transparent",
              border: view === tab.key ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
              color: view === tab.key ? NEON_BLUE : "rgba(255,255,255,0.4)",
              boxShadow: view === tab.key ? `0 0 16px rgba(0,212,255,0.08)` : "none",
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ ABA: PAINEL DE GESTÃO ═══════════════════════════════════════════ */}
      {view === "painel" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Sumário geral */}
          {painelTotais.count > 0 && (
            <div className="rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
              style={{ background: "rgba(0,212,255,0.05)", border: "1.5px solid rgba(0,212,255,0.18)" }}>
              {[
                { label: "Total de custo mensal", value: fmt(painelTotais.totalCusto), color: NEON_RED },
                { label: "Total de faturamento teto", value: fmt(painelTotais.totalTeto), color: NEON_BLUE },
                { label: "Saldo Geral Contratual", value: fmt(Math.abs(painelTotais.saldoGeral)),
                  color: painelTotais.saldoGeral >= 0 ? NEON_GREEN : NEON_RED,
                  sub: painelTotais.saldoGeral >= 0 ? "SUPERÁVIT" : "DÉFICIT" },
                { label: "Profissionais com custo", value: `${painelTotais.count} / ${professionals.length}`, color: NEON_BLUE },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="text-2xl font-bold font-display" style={{ color: item.color, textShadow: `0 0 16px ${item.color}55` }}>
                    {item.value}
                  </p>
                  {(item as any).sub && (
                    <span className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full"
                      style={{ background: `${item.color}18`, color: item.color }}>{(item as any).sub}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tabela de profissionais */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Cabeçalho */}
            <div className="grid grid-cols-12 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground"
              style={{ background: "rgba(0,212,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="col-span-4">Profissional</span>
              <span className="col-span-2 text-center">Carga</span>
              <span className="col-span-2 text-right">Teto</span>
              <span className="col-span-2 text-right">Custo</span>
              <span className="col-span-2 text-right">Saldo Real</span>
            </div>

            {painelRows.map((row: any, i: number) => {
              const isRed   = row.saldoContratual != null && row.saldoContratual < 0;
              const isGreen = row.saldoContratual != null && row.saldoContratual >= 0;
              const corRow  = isRed ? NEON_RED : isGreen ? NEON_GREEN : "rgba(255,255,255,0.3)";
              return (
                <div key={row.id}
                  className="grid grid-cols-12 px-5 py-4 items-center"
                  style={{
                    borderBottom: i < painelRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    background: isRed ? "rgba(255,32,96,0.03)" : "transparent",
                  }}
                >
                  <div className="col-span-4">
                    <p className="font-bold text-sm">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.specialty}</p>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{
                        background: row.cargaHoraria === "20h" ? "rgba(249,115,22,0.12)" : "rgba(0,212,255,0.1)",
                        color: row.cargaHoraria === "20h" ? "#f97316" : NEON_BLUE,
                        border: `1px solid ${row.cargaHoraria === "20h" ? "rgba(249,115,22,0.3)" : "rgba(0,212,255,0.25)"}`,
                      }}>
                      {row.cargaHoraria ?? "30h"}
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-semibold" style={{ color: NEON_BLUE }}>{fmt(row.teto)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    {row.custo != null
                      ? <span className="text-sm font-semibold text-foreground">{fmt(row.custo)}</span>
                      : <span className="text-xs text-muted-foreground/50 italic">não definido</span>
                    }
                  </div>
                  <div className="col-span-2 text-right">
                    {row.saldoContratual != null ? (
                      <div>
                        <span className="text-sm font-bold" style={{ color: corRow, textShadow: `0 0 8px ${corRow}66` }}>
                          {row.saldoContratual >= 0 ? "+" : ""}{fmt(row.saldoContratual)}
                        </span>
                        {isRed && (
                          <p className="text-[10px] font-bold" style={{ color: NEON_RED }}>PREJUÍZO</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dica */}
          <div className="text-xs text-muted-foreground px-1">
            <Search className="inline w-3 h-3 mr-1" />
            Cadastre o custo mensal de cada profissional na tela de Profissionais para ver o Saldo Real aqui.
          </div>
        </motion.div>
      )}

      {/* ═══ ABA: ANÁLISE POR PROFISSIONAL ══════════════════════════════════ */}
      {view === "analise" && <>
      {/* Seletor de profissional */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl font-semibold text-left transition-all"
          style={{
            background: "rgba(0,212,255,0.06)",
            border: `1.5px solid ${selectedId ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.1)"}`,
            color: selectedId ? NEON_BLUE : "rgba(255,255,255,0.4)",
            boxShadow: selectedId ? `0 0 20px rgba(0,212,255,0.1)` : "none",
          }}
        >
          <span className="flex items-center gap-3">
            <Users className="w-5 h-5" />
            {selectedProfessional
              ? `${selectedProfessional.name} · ${selectedProfessional.specialty || "Sem especialidade"}`
              : "Selecione um profissional para analisar"}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute left-0 right-0 mt-2 z-50 rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: "hsl(222 50% 8%)", border: "1px solid rgba(0,212,255,0.2)" }}
            >
              {professionals.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setOpen(false); setShowGrupos(false); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all hover:bg-white/5 font-medium"
                  style={{ color: selectedId === p.id ? NEON_BLUE : "rgba(255,255,255,0.8)" }}
                >
                  <div className="w-2 h-2 rounded-full" style={{
                    background: selectedId === p.id ? NEON_BLUE : "rgba(255,255,255,0.2)",
                    boxShadow: selectedId === p.id ? `0 0 8px ${NEON_BLUE}` : "none",
                  }} />
                  <span>{p.name}</span>
                  <span className="text-xs opacity-50 ml-1">· {p.specialty || "—"}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Estado inicial */}
      {!selectedId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="w-16 h-16 mb-4" style={{ color: "rgba(0,212,255,0.2)" }} />
          <p className="text-muted-foreground font-medium">Selecione um profissional acima</p>
          <p className="text-xs text-muted-foreground/60 mt-1">para ver a análise de lucratividade do mês</p>
        </div>
      )}

      {/* Loading */}
      {selectedId && loading && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 rounded-full animate-spin border-2 border-transparent"
            style={{ borderTopColor: NEON_BLUE }} />
          <p className="text-sm text-muted-foreground mt-3">Carregando agenda...</p>
        </div>
      )}

      {/* Análise completa */}
      {selectedId && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Card principal: Saldo */}
          <div className="rounded-3xl p-8 text-center relative overflow-hidden"
            style={{
              background: isPositive
                ? "linear-gradient(135deg, rgba(0,255,159,0.06) 0%, rgba(0,212,255,0.04) 100%)"
                : "linear-gradient(135deg, rgba(255,32,96,0.08) 0%, rgba(255,80,0,0.04) 100%)",
              border: `1.5px solid ${isPositive ? "rgba(0,255,159,0.25)" : "rgba(255,32,96,0.35)"}`,
              boxShadow: isPositive
                ? "0 0 60px rgba(0,255,159,0.08)"
                : "0 0 60px rgba(255,32,96,0.1)",
            }}
          >
            {/* Glow background */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${corSaldo}0f 0%, transparent 70%)`,
              }} />

            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-1"
              style={{ color: `${corSaldo}99` }}>
              Saldo Mensal · {mesLabel}
            </p>

            <p className="text-6xl font-bold font-display mb-1 relative"
              style={{ color: corSaldo, textShadow: `0 0 40px ${corSaldo}88` }}>
              {fmt(Math.abs(saldo))}
            </p>

            <span className="inline-block px-4 py-1 rounded-full text-xs font-black tracking-widest mb-6"
              style={{
                background: `${corSaldo}18`,
                border: `1px solid ${corSaldo}44`,
                color: corSaldo,
              }}>
              {corLabel}
            </span>

            {/* Mini cards */}
            <div className="grid grid-cols-3 gap-3 mt-2 relative">
              {[
                { label: "Sessões na agenda", value: totalPacientesMes, sub: `${totalAtendidos} realizadas`, color: NEON_BLUE },
                { label: "Faturamento bruto", value: fmt(faturamento), sub: `${VALOR_REPASSE}×${totalPacientesMes} sess.`, color: NEON_BLUE },
                { label: "Custo mensal", value: fmt(custoSelecionado), sub: selectedProfessional?.salario ? "definido" : "teto estimado", color: "rgba(255,255,255,0.4)" },
              ].map(card => (
                <div key={card.label} className="rounded-2xl p-4 text-center"
                  style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-xl font-bold font-display" style={{ color: card.color }}>{card.value}</p>
                  <p className="text-[11px] font-semibold mt-0.5 text-muted-foreground">{card.label}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Meta de ponto de equilíbrio */}
          <div className="rounded-2xl p-6"
            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <div className="flex items-start gap-3 mb-4">
              <Target className="w-5 h-5 mt-0.5 shrink-0" style={{ color: NEON_BLUE }} />
              <div>
                <p className="font-bold text-sm" style={{ color: NEON_BLUE }}>Ponto de Equilíbrio</p>
                <p className="text-sm text-foreground/80 mt-0.5">
                  Para este profissional se pagar, ele precisa atender{" "}
                  <strong className="text-white">{breakEvenDia} pacientes/dia</strong>
                  {" "}({breakEvenMes}/mês)
                </p>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Progresso do mês</span>
              <span style={{ color: pctMeta >= 100 ? NEON_GREEN : NEON_BLUE }}>
                {totalPacientesMes} / {breakEvenMes} sessões ({pctMeta}%)
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctMeta}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{
                  background: pctMeta >= 100
                    ? `linear-gradient(90deg, ${NEON_GREEN}88, ${NEON_GREEN})`
                    : `linear-gradient(90deg, ${NEON_BLUE}88, ${NEON_BLUE})`,
                  boxShadow: `0 0 12px ${pctMeta >= 100 ? NEON_GREEN : NEON_BLUE}66`,
                }}
              />
            </div>

            {faltam > 0 && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#f97316" }} />
                Faltam <strong className="text-white">{faltam} sessões</strong> para atingir o ponto de equilíbrio
              </p>
            )}
            {faltam === 0 && (
              <p className="text-xs mt-2 font-semibold" style={{ color: NEON_GREEN }}>
                ✓ Ponto de equilíbrio atingido!
              </p>
            )}
          </div>

          {/* Botão Simular Grupos */}
          <button
            onClick={() => setShowGrupos(g => !g)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all"
            style={{
              background: showGrupos ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.06)",
              border: `1.5px solid ${showGrupos ? "rgba(139,92,246,0.4)" : "rgba(139,92,246,0.2)"}`,
              color: "#a78bfa",
              boxShadow: showGrupos ? "0 0 24px rgba(139,92,246,0.12)" : "none",
            }}
          >
            <Sparkles className="w-4 h-4" />
            Simular Grupos
            <ChevronDown className={`w-4 h-4 transition-transform ${showGrupos ? "rotate-180" : ""}`} />
          </button>

          {/* Simulação de Grupos */}
          <AnimatePresence>
            {showGrupos && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl p-6"
                  style={{ background: "rgba(139,92,246,0.07)", border: "1.5px solid rgba(139,92,246,0.25)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4" style={{ color: "#a78bfa" }} />
                    <h3 className="font-bold text-sm" style={{ color: "#a78bfa" }}>Simulação com Grupos</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-5">
                    Cada horário atendendo <strong className="text-white">2 crianças</strong> → repasse de{" "}
                    <strong className="text-white">{fmt(VALOR_GRUPO)}/sessão</strong>
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Faturamento grupos", value: fmt(faturamentoGrupo), sub: `${VALOR_GRUPO}×${totalPacientesMes}`, color: "#a78bfa" },
                      { label: "Saldo com grupos", value: fmt(Math.abs(saldoGrupo)), sub: saldoGrupo >= 0 ? "SUPERÁVIT" : "DÉFICIT", color: saldoGrupo >= 0 ? NEON_GREEN : NEON_RED },
                      { label: "Aumento de receita", value: fmt(faturamentoGrupo - faturamento), sub: `+${fmt(VALOR_GRUPO - VALOR_REPASSE)}/sessão`, color: "#a78bfa" },
                    ].map(card => (
                      <div key={card.label} className="rounded-2xl p-4 text-center"
                        style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(139,92,246,0.15)" }}>
                        <p className="text-xl font-bold font-display" style={{ color: card.color, textShadow: `0 0 12px ${card.color}66` }}>
                          {card.value}
                        </p>
                        <p className="text-[11px] font-semibold mt-0.5 text-muted-foreground">{card.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: card.color, opacity: 0.7 }}>{card.sub}</p>
                      </div>
                    ))}
                  </div>

                  {saldoGrupo > saldo && (
                    <p className="text-xs mt-4 font-semibold" style={{ color: "#a78bfa" }}>
                      <Sparkles className="inline w-3.5 h-3.5 mr-1" />
                      Com grupos, o saldo aumenta em {fmt(saldoGrupo - saldo)} — um acréscimo de{" "}
                      {saldo < 0 ? "redução do déficit" : "lucro adicional"} de 100%.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
      </>}
    </div>
  );
}

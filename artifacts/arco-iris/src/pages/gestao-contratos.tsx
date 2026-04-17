import { useEffect, useState, useMemo, useRef } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import {
  FileText, Printer, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  Building2, LayoutList, CheckCircle2, TrendingUp, TrendingDown, DollarSign, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button } from "@/components/ui-custom";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Contractor = { id: number; name: string; valorPorAtendimento: number };
type Appointment = { id: number; status: string; professionalId: number };

// ── Helpers ──────────────────────────────────────────────────────────────────
const CANCELLED = new Set(["desmarcado", "remarcado"]);
const NEON_BLUE  = "#00d4ff";
const NEON_GREEN = "#00ff9f";
const NEON_RED   = "#ff2060";
const TETO: Record<string, number> = { "20h": 3600, "30h": 5400 };
const getTeto = (carga: string) => TETO[carga] ?? 5400;

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthRange(offset = 0) {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() + offset);
  const y   = now.getFullYear();
  const m   = now.getMonth();
  const pad = String(m + 1).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return {
    dateFrom: `${y}-${pad}-01`,
    dateTo:   `${y}-${pad}-${last}`,
    label:    now.toLocaleString("pt-BR", { month: "long", year: "numeric" })
              .replace(/^\w/, c => c.toUpperCase()),
  };
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function GestaoContratos() {
  const { data: professionals = [] } = useGetProfessionals({} as any);

  const [view, setView] = useState<"contratantes" | "painel">("contratantes");

  // ── Contractors state ──────────────────────────────────────────────────────
  const [contractors, setContractors]     = useState<Contractor[]>([]);
  const [loadingCtrs, setLoadingCtrs]     = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [editTarget, setEditTarget]       = useState<Contractor | null>(null);
  const [formName, setFormName]           = useState("");
  const [formValor, setFormValor]         = useState("30");
  const [savingCtrs, setSavingCtrs]       = useState(false);

  useEffect(() => {
    setLoadingCtrs(true);
    fetch("/api/contractors")
      .then(r => r.json())
      .then(setContractors)
      .catch(console.error)
      .finally(() => setLoadingCtrs(false));
  }, []);

  function openCreate() {
    setEditTarget(null);
    setFormName("");
    setFormValor("30");
    setShowForm(true);
  }

  function openEdit(c: Contractor) {
    setEditTarget(c);
    setFormName(c.name);
    setFormValor(String(c.valorPorAtendimento));
    setShowForm(true);
  }

  async function handleSaveContractor(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSavingCtrs(true);
    try {
      const body = JSON.stringify({ name: formName.trim(), valorPorAtendimento: Number(formValor) || 30 });
      const headers = { "Content-Type": "application/json" };
      let res;
      if (editTarget) {
        res = await fetch(`/api/contractors/${editTarget.id}`, { method: "PUT", headers, body });
      } else {
        res = await fetch("/api/contractors", { method: "POST", headers, body });
      }
      const row = await res.json();
      if (editTarget) {
        setContractors(cs => cs.map(c => c.id === editTarget.id ? row : c));
      } else {
        setContractors(cs => [...cs, row]);
      }
      setShowForm(false);
    } catch { /* silently ignore */ }
    finally { setSavingCtrs(false); }
  }

  async function handleDeleteContractor(id: number) {
    if (!confirm("Remover este contratante?")) return;
    await fetch(`/api/contractors/${id}`, { method: "DELETE" });
    setContractors(cs => cs.filter(c => c.id !== id));
  }

  // ── Painel state ──────────────────────────────────────────────────────────
  const [selectedContractorId, setSelectedContractorId] = useState<number | null>(null);
  const [monthOffset, setMonthOffset]                   = useState(0);
  const [appointments, setAppointments]                 = useState<Appointment[]>([]);
  const [loadingApts, setLoadingApts]                   = useState(false);

  const range             = useMemo(() => getMonthRange(monthOffset), [monthOffset]);
  const selectedContractor = useMemo(
    () => contractors.find(c => c.id === selectedContractorId) ?? null,
    [contractors, selectedContractorId]
  );

  useEffect(() => {
    if (view !== "painel") return;
    setLoadingApts(true);
    fetch(`/api/appointments?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`)
      .then(r => r.json())
      .then((data: Appointment[]) => setAppointments(data))
      .catch(console.error)
      .finally(() => setLoadingApts(false));
  }, [view, range.dateFrom, range.dateTo]);

  const valor = selectedContractor?.valorPorAtendimento ?? 0;

  type PainelRow = {
    id: number; name: string; specialty: string;
    cargaHoraria: string; teto: number; salario: number | null;
    atendimentos: number; producao: number; saldo: number | null;
  };

  const painelRows: PainelRow[] = useMemo(() => {
    const countMap: Record<number, number> = {};
    for (const a of appointments) {
      if (CANCELLED.has(a.status)) continue;
      countMap[a.professionalId] = (countMap[a.professionalId] ?? 0) + 1;
    }
    return (professionals as any[]).map((p: any) => {
      const atendimentos = countMap[p.id] ?? 0;
      const producao     = atendimentos * valor;
      const custo        = p.salario ?? null;
      const saldo        = custo != null ? producao - custo : null;
      return {
        id:          p.id,
        name:        p.name,
        specialty:   p.specialty ?? "—",
        cargaHoraria: p.cargaHoraria ?? "30h",
        teto:        getTeto(p.cargaHoraria ?? "30h"),
        salario:     custo,
        atendimentos,
        producao,
        saldo,
      };
    }).sort((a, b) => b.atendimentos - a.atendimentos);
  }, [professionals, appointments, valor]);

  const totais = useMemo(() => {
    const totalApt  = painelRows.reduce((s, r) => s + r.atendimentos, 0);
    const totalProd = painelRows.reduce((s, r) => s + r.producao, 0);
    const comCusto  = painelRows.filter(r => r.salario != null);
    const totalCusto = comCusto.reduce((s, r) => s + (r.salario ?? 0), 0);
    const totalSaldo = comCusto.reduce((s, r) => s + (r.saldo ?? 0), 0);
    return { totalApt, totalProd, totalCusto, totalSaldo, comCusto: comCusto.length };
  }, [painelRows]);

  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root * { display: block !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; }
          th { background: #f0f0f0; }
        }
        .print-only { display: none; }
      `}</style>

      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3"
            style={{ color: NEON_BLUE, textShadow: `0 0 24px ${NEON_BLUE}66` }}>
            <Building2 className="w-8 h-8" style={{ filter: `drop-shadow(0 0 8px ${NEON_BLUE})` }} />
            Gestão de Contratos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contratantes, repasses e lucratividade por prestador
          </p>
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="flex gap-2 p-1 rounded-2xl no-print"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {([
          { key: "contratantes", label: "Contratantes",      icon: Building2  },
          { key: "painel",       label: "Painel de Produção", icon: LayoutList },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: view === tab.key ? "rgba(0,212,255,0.12)" : "transparent",
              border:     view === tab.key ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
              color:      view === tab.key ? NEON_BLUE : "rgba(255,255,255,0.4)",
              boxShadow:  view === tab.key ? `0 0 16px rgba(0,212,255,0.08)` : "none",
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ABA — CONTRATANTES
      ════════════════════════════════════════════════════════════════════ */}
      {view === "contratantes" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Botão novo */}
          <div className="flex justify-end">
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Novo Contratante
            </Button>
          </div>

          {/* Formulário inline */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
              >
                <form onSubmit={handleSaveContractor}
                  className="rounded-2xl p-5 space-y-4"
                  style={{ background: "rgba(0,212,255,0.05)", border: "1.5px solid rgba(0,212,255,0.25)" }}
                >
                  <h3 className="font-bold text-sm" style={{ color: NEON_BLUE }}>
                    {editTarget ? "Editar Contratante" : "Novo Contratante"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Nome do Contratante
                      </label>
                      <input
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium bg-background border border-border focus:outline-none focus:ring-2"
                        style={{ focusRingColor: NEON_BLUE } as any}
                        placeholder="Ex: Prefeitura de…, Clínica X…"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        Valor por Atendimento (R$)
                      </label>
                      <input
                        type="number" min={1} step={1}
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium bg-background border border-border focus:outline-none"
                        placeholder="30"
                        value={formValor}
                        onChange={e => setFormValor(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={savingCtrs}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ background: NEON_BLUE, color: "#000", opacity: savingCtrs ? 0.6 : 1 }}>
                      {savingCtrs ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Salvar
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lista */}
          {loadingCtrs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: NEON_BLUE }} />
            </div>
          ) : contractors.length === 0 ? (
            <div className="rounded-2xl p-10 text-center"
              style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
              <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Nenhum contratante cadastrado.</p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Clique em "Novo Contratante" para começar.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              {contractors.map((c, i) => (
                <div key={c.id}
                  className="flex items-center gap-4 px-5 py-4"
                  style={{ borderBottom: i < contractors.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                >
                  <div className="flex-1">
                    <p className="font-bold text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(c.valorPorAtendimento)} por atendimento
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(0,212,255,0.1)", color: NEON_BLUE, border: "1px solid rgba(0,212,255,0.25)" }}>
                    R$ {c.valorPorAtendimento}/atend.
                  </span>
                  <button onClick={() => openEdit(c)}
                    className="p-2 rounded-lg hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteContractor(c.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Dica */}
          {contractors.length > 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Selecione um contratante na aba <strong className="text-foreground">Painel de Produção</strong> para ver
              o relatório de atendimentos, produção e saldo por prestador.
            </p>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA — PAINEL DE PRODUÇÃO
      ════════════════════════════════════════════════════════════════════ */}
      {view === "painel" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Toolbar: contratante + mês + imprimir */}
          <div className="flex flex-wrap gap-3 items-center no-print">
            {/* Select contratante */}
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Contratante
              </label>
              <select
                value={selectedContractorId ?? ""}
                onChange={e => setSelectedContractorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium bg-background border border-border focus:outline-none"
              >
                <option value="">— Selecione um contratante —</option>
                {contractors.map(c => (
                  <option key={c.id} value={c.id}>{c.name} (R$ {c.valorPorAtendimento}/atend.)</option>
                ))}
              </select>
            </div>

            {/* Navegador de mês */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Mês de referência
              </label>
              <div className="flex items-center gap-2">
                <button onClick={() => setMonthOffset(o => o - 1)}
                  className="p-2 rounded-xl hover:bg-secondary/80 transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-4 py-2 rounded-xl text-sm font-semibold min-w-[160px] text-center"
                  style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: NEON_BLUE }}>
                  {range.label}
                </span>
                <button onClick={() => setMonthOffset(o => o + 1)}
                  className="p-2 rounded-xl hover:bg-secondary/80 transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Botão imprimir */}
            {selectedContractor && (
              <div className="self-end">
                <button onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: NEON_BLUE }}>
                  <Printer className="w-4 h-4" />
                  Exportar Relatório
                </button>
              </div>
            )}
          </div>

          {/* Sem contratante selecionado */}
          {!selectedContractor ? (
            <div className="rounded-2xl p-10 text-center"
              style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
              <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Selecione um contratante para ver o painel.</p>
              {contractors.length === 0 && (
                <p className="text-muted-foreground/60 text-xs mt-2">
                  Nenhum contratante cadastrado. Vá para a aba "Contratantes" e adicione um.
                </p>
              )}
            </div>
          ) : (
            <div ref={printRef} id="print-root">

              {/* Cabeçalho do relatório (visível no print) */}
              <div className="print-only mb-4">
                <h2 style={{ fontSize: 18, fontWeight: "bold" }}>Relatório de Produção — {selectedContractor.name}</h2>
                <p style={{ fontSize: 13 }}>Período: {range.label} · Valor por atendimento: R$ {selectedContractor.valorPorAtendimento}</p>
                <p style={{ fontSize: 11, color: "#666" }}>Gerado em {new Date().toLocaleDateString("pt-BR")}</p>
              </div>

              {/* Cards sumário */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
                {[
                  { label: "Total de Atendimentos", value: totais.totalApt.toString(), icon: CheckCircle2, color: NEON_BLUE },
                  { label: "Produção Total",   value: fmt(totais.totalProd),  icon: TrendingUp,   color: NEON_BLUE },
                  { label: "Custo Total",      value: fmt(totais.totalCusto), icon: DollarSign,   color: "rgba(255,255,255,0.5)" },
                  {
                    label: "Saldo Consolidado",
                    value: fmt(Math.abs(totais.totalSaldo)),
                    icon:  totais.totalSaldo >= 0 ? TrendingUp : TrendingDown,
                    color: totais.totalSaldo >= 0 ? NEON_GREEN : NEON_RED,
                    sub:   totais.totalSaldo >= 0 ? "SUPERÁVIT" : "DÉFICIT",
                  },
                ].map(item => (
                  <div key={item.label} className="rounded-2xl p-4"
                    style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <item.icon className="w-4 h-4 mb-2" style={{ color: item.color }} />
                    <p className="text-xl font-bold font-display" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[11px] font-semibold mt-0.5 text-muted-foreground">{item.label}</p>
                    {(item as any).sub && (
                      <span className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{ background: `${item.color}18`, color: item.color }}>{(item as any).sub}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Tabela */}
              {loadingApts ? (
                <div className="flex justify-center py-10 no-print">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: NEON_BLUE }} />
                </div>
              ) : (
                <>
                  {/* Screen table */}
                  <div className="rounded-2xl overflow-hidden no-print"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    {/* Header */}
                    <div className="grid grid-cols-12 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground"
                      style={{ background: "rgba(0,212,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="col-span-3">Prestador</span>
                      <span className="col-span-2 text-center">Carga</span>
                      <span className="col-span-2 text-right">Atend.</span>
                      <span className="col-span-2 text-right">Produção</span>
                      <span className="col-span-1 text-right">Custo</span>
                      <span className="col-span-2 text-right">Saldo</span>
                    </div>
                    {painelRows.map((row, i) => {
                      const isPos = row.saldo != null && row.saldo >= 0;
                      const isNeg = row.saldo != null && row.saldo < 0;
                      const corSaldo = isPos ? NEON_GREEN : isNeg ? NEON_RED : "rgba(255,255,255,0.3)";
                      return (
                        <div key={row.id}
                          className="grid grid-cols-12 px-5 py-3.5 items-center"
                          style={{
                            borderBottom: i < painelRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            background: isNeg ? "rgba(255,32,96,0.03)" : "transparent",
                          }}
                        >
                          <div className="col-span-3">
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
                              {row.cargaHoraria}
                            </span>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className="text-sm font-semibold" style={{ color: row.atendimentos > 0 ? NEON_BLUE : "rgba(255,255,255,0.3)" }}>
                              {row.atendimentos}
                            </span>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className="text-sm font-semibold">{fmt(row.producao)}</span>
                          </div>
                          <div className="col-span-1 text-right">
                            {row.salario != null
                              ? <span className="text-xs font-semibold text-foreground/70">{fmt(row.salario)}</span>
                              : <span className="text-xs text-muted-foreground/40 italic">—</span>
                            }
                          </div>
                          <div className="col-span-2 text-right">
                            {row.saldo != null ? (
                              <span className="text-sm font-bold" style={{ color: corSaldo, textShadow: `0 0 8px ${corSaldo}55` }}>
                                {row.saldo >= 0 ? "+" : ""}{fmt(row.saldo)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Rodapé total */}
                    <div className="grid grid-cols-12 px-5 py-3 text-sm font-black"
                      style={{ background: "rgba(0,212,255,0.06)", borderTop: "1px solid rgba(0,212,255,0.15)" }}>
                      <span className="col-span-3" style={{ color: NEON_BLUE }}>TOTAL</span>
                      <span className="col-span-2" />
                      <span className="col-span-2 text-right" style={{ color: NEON_BLUE }}>{totais.totalApt}</span>
                      <span className="col-span-2 text-right" style={{ color: NEON_BLUE }}>{fmt(totais.totalProd)}</span>
                      <span className="col-span-1 text-right text-foreground/60">{fmt(totais.totalCusto)}</span>
                      <span className="col-span-2 text-right"
                        style={{ color: totais.totalSaldo >= 0 ? NEON_GREEN : NEON_RED }}>
                        {totais.totalSaldo >= 0 ? "+" : ""}{fmt(totais.totalSaldo)}
                      </span>
                    </div>
                  </div>

                  {/* Print table */}
                  <table className="print-only w-full" style={{ display: "none" }}>
                    <thead>
                      <tr>
                        <th>Prestador</th><th>Especialidade</th><th>Carga</th>
                        <th>Atend.</th><th>Produção</th><th>Custo</th><th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painelRows.map(r => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.specialty}</td>
                          <td style={{ textAlign: "center" }}>{r.cargaHoraria}</td>
                          <td style={{ textAlign: "right" }}>{r.atendimentos}</td>
                          <td style={{ textAlign: "right" }}>{fmt(r.producao)}</td>
                          <td style={{ textAlign: "right" }}>{r.salario != null ? fmt(r.salario) : "—"}</td>
                          <td style={{ textAlign: "right" }}>{r.saldo != null ? (r.saldo >= 0 ? "+" : "") + fmt(r.saldo) : "—"}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: "bold" }}>
                        <td colSpan={3}>TOTAL</td>
                        <td style={{ textAlign: "right" }}>{totais.totalApt}</td>
                        <td style={{ textAlign: "right" }}>{fmt(totais.totalProd)}</td>
                        <td style={{ textAlign: "right" }}>{fmt(totais.totalCusto)}</td>
                        <td style={{ textAlign: "right" }}>{totais.totalSaldo >= 0 ? "+" : ""}{fmt(totais.totalSaldo)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              {/* Rodapé do relatório */}
              <p className="print-only" style={{ display: "none", marginTop: 12, fontSize: 10, color: "#888" }}>
                Contratante: {selectedContractor.name} · Valor por atendimento: R$ {selectedContractor.valorPorAtendimento}
                · Custo: salário cadastrado por prestador · Saldo: Produção − Custo
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

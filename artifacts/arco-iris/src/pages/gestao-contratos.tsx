import { useEffect, useState, useMemo, useRef } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import {
  FileText, Printer, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
  Building2, LayoutList, CheckCircle2, TrendingUp, TrendingDown, DollarSign,
  Loader2, Calculator, Wallet, Users
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button } from "@/components/ui-custom";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Contractor   = { id: number; name: string; valorPorAtendimento: number };
type Appointment  = { id: number; status: string; professionalId: number };
type Colaborador  = { id: number; name: string; cargo: string; salario: number };

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

  const [view, setView] = useState<"contratantes" | "painel" | "fechamento">("contratantes");

  // ── Colaboradores state ────────────────────────────────────────────────────
  const [colaboradores, setColaboradores]     = useState<Colaborador[]>([]);
  const [loadingColab, setLoadingColab]       = useState(true);
  const [showColabForm, setShowColabForm]     = useState(false);
  const [editColabTarget, setEditColabTarget] = useState<Colaborador | null>(null);
  const [colabName, setColabName]             = useState("");
  const [colabCargo, setColabCargo]           = useState("ADM");
  const [colabSalario, setColabSalario]       = useState("0");
  const [savingColab, setSavingColab]         = useState(false);

  useEffect(() => {
    setLoadingColab(true);
    fetch("/api/colaboradores")
      .then(r => r.json())
      .then(setColaboradores)
      .catch(console.error)
      .finally(() => setLoadingColab(false));
  }, []);

  function openColabCreate() {
    setEditColabTarget(null); setColabName(""); setColabCargo("ADM"); setColabSalario("0");
    setShowColabForm(true);
  }
  function openColabEdit(c: Colaborador) {
    setEditColabTarget(c); setColabName(c.name); setColabCargo(c.cargo); setColabSalario(String(c.salario));
    setShowColabForm(true);
  }
  async function handleSaveColab(e: React.FormEvent) {
    e.preventDefault();
    if (!colabName.trim()) return;
    setSavingColab(true);
    try {
      const body = JSON.stringify({ name: colabName.trim(), cargo: colabCargo.trim() || "ADM", salario: Number(colabSalario) || 0 });
      const headers = { "Content-Type": "application/json" };
      let res;
      if (editColabTarget) {
        res = await fetch(`/api/colaboradores/${editColabTarget.id}`, { method: "PUT", headers, body });
      } else {
        res = await fetch("/api/colaboradores", { method: "POST", headers, body });
      }
      const row = await res.json();
      if (editColabTarget) {
        setColaboradores(cs => cs.map(c => c.id === editColabTarget.id ? row : c));
      } else {
        setColaboradores(cs => [...cs, row]);
      }
      setShowColabForm(false);
    } catch { /* ignore */ }
    finally { setSavingColab(false); }
  }
  async function handleDeleteColab(id: number) {
    if (!confirm("Remover este colaborador?")) return;
    await fetch(`/api/colaboradores/${id}`, { method: "DELETE" });
    setColaboradores(cs => cs.filter(c => c.id !== id));
  }

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
    if (view !== "painel" && view !== "fechamento") return;
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
    cargaHoraria: string;
    atendimentos: number;
    repasseEstimado: number;   // teto por carga horária (fixo)
    pagamentoReal: number | null; // salário cadastrado
    margem: number | null;     // repasseEstimado − pagamentoReal
  };

  const painelRows: PainelRow[] = useMemo(() => {
    const countMap: Record<number, number> = {};
    for (const a of appointments) {
      if (CANCELLED.has(a.status)) continue;
      countMap[a.professionalId] = (countMap[a.professionalId] ?? 0) + 1;
    }
    return (professionals as any[]).map((p: any) => {
      const carga            = p.cargaHoraria ?? "30h";
      const atendimentos     = countMap[p.id] ?? 0;
      const repasseEstimado  = getTeto(carga);
      const pagamentoReal    = p.salario ?? null;
      const margem           = pagamentoReal != null ? repasseEstimado - pagamentoReal : null;
      return {
        id: p.id,
        name: p.name,
        specialty: p.specialty ?? "—",
        cargaHoraria: carga,
        atendimentos,
        repasseEstimado,
        pagamentoReal,
        margem,
      };
    }).sort((a, b) => b.atendimentos - a.atendimentos);
  }, [professionals, appointments]);

  const totais = useMemo(() => {
    const totalApt     = painelRows.reduce((s, r) => s + r.atendimentos, 0);
    const comPagamento = painelRows.filter(r => r.pagamentoReal != null);
    const totalRepasse  = comPagamento.reduce((s, r) => s + r.repasseEstimado, 0);
    const totalPagamento = comPagamento.reduce((s, r) => s + (r.pagamentoReal ?? 0), 0);
    const totalMargem   = comPagamento.reduce((s, r) => s + (r.margem ?? 0), 0);
    return { totalApt, totalRepasse, totalPagamento, totalMargem, comPagamento: comPagamento.length };
  }, [painelRows]);

  // ── Fechamento — cálculos financeiros completos ───────────────────────────
  const fechamento = useMemo(() => {
    const valorAte = selectedContractor?.valorPorAtendimento ?? 0;

    const profBreakdown = painelRows
      .filter(r => r.atendimentos > 0)
      .map(r => ({
        id: r.id,
        name: r.name,
        specialty: r.specialty,
        atendimentos: r.atendimentos,
        valor: r.atendimentos * valorAte,
      }));

    const totalAtend   = profBreakdown.reduce((s, r) => s + r.atendimentos, 0);
    const repasseBruto = totalAtend * valorAte;

    const custoTerapeutas = (professionals as any[])
      .filter((p: any) => (p.tipoContrato ?? "Contratado") !== "Concursado")
      .reduce((s: number, p: any) => s + (p.salario ?? 0), 0);

    const custoColaboradores = colaboradores
      .reduce((s, c) => s + c.salario, 0);

    const totalCustos  = custoTerapeutas + custoColaboradores;
    const lucroLiquido = repasseBruto - totalCustos;

    return { totalAtend, repasseBruto, custoTerapeutas, custoColaboradores, totalCustos, lucroLiquido, profBreakdown };
  }, [painelRows, selectedContractor, professionals, colaboradores]);

  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          @page { size: A4; margin: 20mm 18mm 20mm 18mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { background: white !important; color: #111 !important; font-family: Arial, sans-serif; }
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
          .print-table th { background: #222 !important; color: #fff !important; padding: 8px 10px; text-align: left; font-weight: bold; font-size: 10pt; }
          .print-table td { padding: 7px 10px; border-bottom: 1px solid #ddd; font-size: 10pt; }
          .print-table tr:nth-child(even) td { background: #f8f8f8 !important; }
          .print-table .td-right { text-align: right; }
          .print-table .td-center { text-align: center; }
          .print-total-row td { background: #111 !important; color: #fff !important; font-weight: bold; font-size: 11pt; padding: 9px 10px; }
          .print-section { margin-bottom: 14mm; }
          .print-header-line { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
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
          { key: "contratantes", label: "Contratantes",        icon: Building2  },
          { key: "painel",       label: "Painel de Produção",  icon: LayoutList },
          { key: "fechamento",   label: "Fechamento Mensal",   icon: Calculator },
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
                  { label: "Total de Atendimentos",    value: totais.totalApt.toString(),          icon: CheckCircle2,  color: NEON_BLUE },
                  { label: "Repasse Estimado (soma)",  value: fmt(totais.totalRepasse),             icon: TrendingUp,    color: NEON_BLUE },
                  { label: "Pagamento Real (soma)",    value: fmt(totais.totalPagamento),           icon: DollarSign,    color: "rgba(255,255,255,0.5)" },
                  {
                    label: "Margem da Empresa",
                    value: fmt(Math.abs(totais.totalMargem)),
                    icon:  totais.totalMargem >= 0 ? TrendingUp : TrendingDown,
                    color: totais.totalMargem >= 0 ? NEON_GREEN : NEON_RED,
                    sub:   totais.totalMargem >= 0 ? "SUPERÁVIT" : "DÉFICIT",
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
                    <div className="grid grid-cols-12 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground"
                      style={{ background: "rgba(0,212,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="col-span-3">Prestador</span>
                      <span className="col-span-1 text-center">Carga</span>
                      <span className="col-span-1 text-right">Atend.</span>
                      <span className="col-span-3 text-right" title="Faturamento máximo da agenda cheia (por carga horária)">
                        Repasse Estimado
                      </span>
                      <span className="col-span-2 text-right" title="Salário cadastrado do prestador">
                        Pagamento Real
                      </span>
                      <span className="col-span-2 text-right" title="Repasse Estimado − Pagamento Real">
                        Margem da Empresa
                      </span>
                    </div>

                    {painelRows.map((row, i) => {
                      const isPos = row.margem != null && row.margem >= 0;
                      const isNeg = row.margem != null && row.margem < 0;
                      const corMargem = isPos ? NEON_GREEN : isNeg ? NEON_RED : "rgba(255,255,255,0.3)";
                      return (
                        <div key={row.id}
                          className="grid grid-cols-12 px-5 py-3.5 items-center"
                          style={{
                            borderBottom: i < painelRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            background: isNeg ? "rgba(255,32,96,0.03)" : "transparent",
                          }}
                        >
                          {/* Prestador */}
                          <div className="col-span-3">
                            <p className="font-bold text-sm">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.specialty}</p>
                          </div>

                          {/* Carga */}
                          <div className="col-span-1 flex justify-center">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                              style={{
                                background: row.cargaHoraria === "20h" ? "rgba(249,115,22,0.12)" : "rgba(0,212,255,0.1)",
                                color: row.cargaHoraria === "20h" ? "#f97316" : NEON_BLUE,
                                border: `1px solid ${row.cargaHoraria === "20h" ? "rgba(249,115,22,0.3)" : "rgba(0,212,255,0.25)"}`,
                              }}>
                              {row.cargaHoraria}
                            </span>
                          </div>

                          {/* Atendimentos */}
                          <div className="col-span-1 text-right">
                            <span className="text-sm font-semibold"
                              style={{ color: row.atendimentos > 0 ? NEON_BLUE : "rgba(255,255,255,0.25)" }}>
                              {row.atendimentos}
                            </span>
                          </div>

                          {/* Repasse Estimado */}
                          <div className="col-span-3 text-right">
                            <span className="text-sm font-semibold" style={{ color: NEON_BLUE }}>
                              {fmt(row.repasseEstimado)}
                            </span>
                            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                              agenda cheia · {row.cargaHoraria}
                            </p>
                          </div>

                          {/* Pagamento Real */}
                          <div className="col-span-2 text-right">
                            {row.pagamentoReal != null
                              ? <span className="text-sm font-semibold text-foreground/80">{fmt(row.pagamentoReal)}</span>
                              : <span className="text-xs text-muted-foreground/40 italic">não definido</span>
                            }
                          </div>

                          {/* Margem da Empresa */}
                          <div className="col-span-2 text-right">
                            {row.margem != null ? (
                              <div>
                                <span className="text-sm font-bold"
                                  style={{ color: corMargem, textShadow: `0 0 8px ${corMargem}55` }}>
                                  {row.margem >= 0 ? "+" : ""}{fmt(row.margem)}
                                </span>
                                {isNeg && (
                                  <p className="text-[10px] font-black" style={{ color: NEON_RED }}>PREJUÍZO</p>
                                )}
                              </div>
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
                      <span className="col-span-1" />
                      <span className="col-span-1 text-right" style={{ color: NEON_BLUE }}>{totais.totalApt}</span>
                      <span className="col-span-3 text-right" style={{ color: NEON_BLUE }}>{fmt(totais.totalRepasse)}</span>
                      <span className="col-span-2 text-right text-foreground/60">{fmt(totais.totalPagamento)}</span>
                      <span className="col-span-2 text-right"
                        style={{ color: totais.totalMargem >= 0 ? NEON_GREEN : NEON_RED }}>
                        {totais.totalMargem >= 0 ? "+" : ""}{fmt(totais.totalMargem)}
                      </span>
                    </div>
                  </div>

                  {/* Print table */}
                  <table className="print-only w-full" style={{ display: "none" }}>
                    <thead>
                      <tr>
                        <th>Prestador</th><th>Especialidade</th><th>Carga</th>
                        <th>Atend.</th><th>Repasse Estimado</th><th>Pagamento Real</th><th>Margem da Empresa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painelRows.map(r => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.specialty}</td>
                          <td style={{ textAlign: "center" }}>{r.cargaHoraria}</td>
                          <td style={{ textAlign: "right" }}>{r.atendimentos}</td>
                          <td style={{ textAlign: "right" }}>{fmt(r.repasseEstimado)}</td>
                          <td style={{ textAlign: "right" }}>{r.pagamentoReal != null ? fmt(r.pagamentoReal) : "—"}</td>
                          <td style={{ textAlign: "right" }}>{r.margem != null ? (r.margem >= 0 ? "+" : "") + fmt(r.margem) : "—"}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: "bold" }}>
                        <td colSpan={3}>TOTAL</td>
                        <td style={{ textAlign: "right" }}>{totais.totalApt}</td>
                        <td style={{ textAlign: "right" }}>{fmt(totais.totalRepasse)}</td>
                        <td style={{ textAlign: "right" }}>{fmt(totais.totalPagamento)}</td>
                        <td style={{ textAlign: "right" }}>{totais.totalMargem >= 0 ? "+" : ""}{fmt(totais.totalMargem)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              {/* Rodapé do relatório */}
              <p className="print-only" style={{ display: "none", marginTop: 12, fontSize: 10, color: "#888" }}>
                Contratante: {selectedContractor.name}
                · Repasse Estimado: faturamento máximo baseado na carga horária (20h = R$ 3.600 / 30h = R$ 5.400)
                · Pagamento Real: salário cadastrado por prestador
                · Margem da Empresa: Repasse Estimado − Pagamento Real
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ABA — FECHAMENTO MENSAL
      ════════════════════════════════════════════════════════════════════ */}
      {view === "fechamento" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* ── Toolbar: contratante + mês + imprimir ── */}
          <div className="flex flex-wrap gap-3 items-end no-print">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Contratante (fonte do repasse)
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
            {/* Botão Gerar Relatório de Repasse */}
            {selectedContractor && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all self-end shadow-lg"
                style={{ background: "linear-gradient(135deg,rgba(0,255,159,0.18),rgba(0,212,255,0.12))", border: "1.5px solid rgba(0,255,159,0.4)", color: NEON_GREEN, boxShadow: `0 0 18px rgba(0,255,159,0.18)` }}>
                <Printer className="w-4 h-4" />
                Gerar Relatório de Repasse
              </button>
            )}
          </div>

          {/* ── Cards financeiros principais ── */}
          {!selectedContractor ? (
            <div className="rounded-2xl p-10 text-center"
              style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
              <Calculator className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Selecione o contratante para calcular o fechamento.</p>
            </div>
          ) : (
            <>
              {/* Repasse Bruto */}
              <div className="rounded-2xl p-6"
                style={{ background: "rgba(0,212,255,0.05)", border: "2px solid rgba(0,212,255,0.2)" }}>
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-6 h-6" style={{ color: NEON_BLUE, filter: `drop-shadow(0 0 8px ${NEON_BLUE})` }} />
                  <div>
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Total de Repasse — {selectedContractor.name}</p>
                    <p className="text-xs text-muted-foreground/60">{fechamento.totalAtend} atendimentos × {fmt(selectedContractor.valorPorAtendimento)}/atend.</p>
                  </div>
                </div>
                <p className="text-5xl font-black font-display" style={{ color: NEON_BLUE, textShadow: `0 0 32px ${NEON_BLUE}66` }}>
                  {fmt(fechamento.repasseBruto)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Este é o valor que o contratante deve depositar referente a <strong className="text-foreground">{fechamento.totalAtend} atendimentos</strong> realizados em {range.label}.
                </p>
              </div>

              {/* Grid de custos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Terapeutas */}
                <div className="rounded-2xl p-5"
                  style={{ background: "rgba(255,32,96,0.05)", border: "1.5px solid rgba(255,32,96,0.18)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5" style={{ color: NEON_RED }} />
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Folha — Prestadores</p>
                  </div>
                  <p className="text-3xl font-bold font-display" style={{ color: NEON_RED }}>
                    {fmt(fechamento.custoTerapeutas)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Soma dos salários cadastrados em Profissionais
                  </p>
                  {/* Mini lista */}
                  <div className="mt-3 space-y-1 max-h-36 overflow-y-auto">
                    {(professionals as any[]).filter((p: any) => p.salario).map((p: any) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span className="text-foreground/70 truncate">{p.name}</span>
                        <span className="font-semibold text-foreground/80 shrink-0 ml-2">{fmt(p.salario)}</span>
                      </div>
                    ))}
                    {(professionals as any[]).filter((p: any) => p.salario).length === 0 && (
                      <p className="text-xs text-muted-foreground/50 italic">Nenhum salário cadastrado em Profissionais.</p>
                    )}
                  </div>
                </div>

                {/* Colaboradores */}
                <div className="rounded-2xl p-5"
                  style={{ background: "rgba(255,32,96,0.04)", border: "1.5px solid rgba(255,32,96,0.12)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5" style={{ color: "#f97316" }} />
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Folha — Colaboradores</p>
                    </div>
                    <button onClick={openColabCreate}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                      style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316" }}>
                      <Plus className="w-3 h-3" /> Adicionar
                    </button>
                  </div>
                  <p className="text-3xl font-bold font-display" style={{ color: "#f97316" }}>
                    {fmt(fechamento.custoColaboradores)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">ADM, Motoristas e outros</p>

                  {/* Lista + form colaboradores */}
                  <AnimatePresence>
                    {showColabForm && (
                      <motion.form
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-3"
                        onSubmit={handleSaveColab}
                      >
                        <div className="space-y-2 pt-1">
                          <input
                            className="w-full rounded-lg px-3 py-1.5 text-xs bg-background border border-border"
                            placeholder="Nome"
                            value={colabName} onChange={e => setColabName(e.target.value)} required
                          />
                          <div className="flex gap-2">
                            <select
                              className="flex-1 rounded-lg px-2 py-1.5 text-xs bg-background border border-border"
                              value={colabCargo} onChange={e => setColabCargo(e.target.value)}>
                              <option>ADM</option>
                              <option>Motorista</option>
                              <option>Auxiliar</option>
                              <option>Outro</option>
                            </select>
                            <input
                              type="number" min={0}
                              className="flex-1 rounded-lg px-3 py-1.5 text-xs bg-background border border-border"
                              placeholder="Salário R$"
                              value={colabSalario} onChange={e => setColabSalario(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setShowColabForm(false)}
                              className="flex-1 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
                              Cancelar
                            </button>
                            <button type="submit" disabled={savingColab}
                              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={{ background: "#f97316", color: "#000", opacity: savingColab ? 0.6 : 1 }}>
                              {savingColab ? "..." : "Salvar"}
                            </button>
                          </div>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  <div className="mt-3 space-y-1 max-h-36 overflow-y-auto">
                    {loadingColab ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                    ) : colaboradores.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 italic">Nenhum colaborador cadastrado.</p>
                    ) : colaboradores.map(c => (
                      <div key={c.id} className="flex justify-between items-center text-xs group">
                        <span className="text-foreground/70 truncate">{c.name}
                          <span className="ml-1 text-muted-foreground/50">({c.cargo})</span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="font-semibold text-foreground/80">{fmt(c.salario)}</span>
                          <button onClick={() => openColabEdit(c)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-all">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteColab(c.id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-red-400 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Resumo de Caixa — visão interna do Claudinho ── */}
              <div className="rounded-2xl overflow-hidden"
                style={{ border: `2px solid ${fechamento.lucroLiquido >= 0 ? "rgba(0,255,159,0.2)" : "rgba(255,32,96,0.2)"}` }}>
                <div className="px-6 py-4"
                  style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    Resumo de Caixa — {range.label}
                  </p>
                </div>

                <div className="divide-y divide-white/5">
                  {/* (+) Faturamento Bruto */}
                  <div className="flex items-center justify-between px-6 py-4 group">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                        style={{ background: "rgba(0,212,255,0.12)", color: NEON_BLUE }}>+</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Faturamento Bruto</p>
                        <p className="text-xs text-muted-foreground">
                          {fechamento.totalAtend} atendimentos × {fmt(selectedContractor.valorPorAtendimento)} ({selectedContractor.name})
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold font-display" style={{ color: NEON_BLUE }}>
                      {fmt(fechamento.repasseBruto)}
                    </p>
                  </div>

                  {/* (−) Folha Terapeutas */}
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                        style={{ background: "rgba(255,32,96,0.12)", color: NEON_RED }}>−</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Folha de Pagamento — Terapeutas</p>
                        <p className="text-xs text-muted-foreground">
                          {(professionals as any[]).filter((p:any)=>p.salario).length} prestadores com salário cadastrado
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold font-display" style={{ color: NEON_RED }}>
                      − {fmt(fechamento.custoTerapeutas)}
                    </p>
                  </div>

                  {/* (−) Folha Colaboradores */}
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                        style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}>−</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Folha de Pagamento — ADM / Motoristas</p>
                        <p className="text-xs text-muted-foreground">
                          {colaboradores.length} colaborador{colaboradores.length !== 1 ? "es" : ""} cadastrado{colaboradores.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold font-display" style={{ color: "#f97316" }}>
                      − {fmt(fechamento.custoColaboradores)}
                    </p>
                  </div>

                  {/* (=) Lucro Real */}
                  <div className="flex items-center justify-between px-6 py-5"
                    style={{ background: fechamento.lucroLiquido >= 0 ? "rgba(0,255,159,0.05)" : "rgba(255,32,96,0.05)" }}>
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                        style={{
                          background: fechamento.lucroLiquido >= 0 ? "rgba(0,255,159,0.2)" : "rgba(255,32,96,0.2)",
                          color: fechamento.lucroLiquido >= 0 ? NEON_GREEN : NEON_RED,
                        }}>=</span>
                      <div>
                        <p className="text-base font-black text-foreground">
                          {fechamento.lucroLiquido >= 0 ? "Lucro Real da Empresa" : "Déficit do Período"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Folha total: {fmt(fechamento.totalCustos)} | Receita: {fmt(fechamento.repasseBruto)}
                        </p>
                      </div>
                    </div>
                    <p className="text-4xl font-black font-display"
                      style={{
                        color: fechamento.lucroLiquido >= 0 ? NEON_GREEN : NEON_RED,
                        textShadow: `0 0 24px ${fechamento.lucroLiquido >= 0 ? NEON_GREEN : NEON_RED}55`,
                      }}>
                      {fechamento.lucroLiquido >= 0 ? "+" : ""}{fmt(fechamento.lucroLiquido)}
                    </p>
                  </div>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  DOCUMENTO IMPRESSO — Relatório de Produção Mensal
                  Visível apenas ao imprimir. SEM salários, SEM custos internos.
              ═══════════════════════════════════════════════════════════ */}
              <div className="print-only" style={{ display: "none" }}>
                {/* Cabeçalho formal */}
                <div className="print-section print-header-line">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontSize: "9pt", color: "#555", marginBottom: 2 }}>NFS — Gestão Terapêutica</p>
                      <h1 style={{ fontSize: "16pt", fontWeight: "bold", margin: "0 0 2px" }}>
                        Relatório de Produção Mensal
                      </h1>
                      <h2 style={{ fontSize: "12pt", fontWeight: "normal", color: "#333", margin: 0 }}>
                        Prestação de Serviços — {selectedContractor.name}
                      </h2>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "10pt", fontWeight: "bold", margin: "0 0 2px" }}>Período de Referência</p>
                      <p style={{ fontSize: "11pt", color: "#222", margin: 0 }}>{range.label}</p>
                      <p style={{ fontSize: "8pt", color: "#888", marginTop: 4 }}>
                        Emitido em {new Date().toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tabela por profissional */}
                <div className="print-section">
                  <p style={{ fontSize: "10pt", fontWeight: "bold", marginBottom: 6, color: "#333", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Detalhamento por Profissional
                  </p>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "5%" }}>#</th>
                        <th style={{ width: "40%" }}>Nome do Profissional</th>
                        <th style={{ width: "25%" }}>Especialidade</th>
                        <th className="td-center" style={{ width: "15%" }}>Atendimentos</th>
                        <th className="td-right" style={{ width: "15%" }}>Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fechamento.profBreakdown.map((r, i) => (
                        <tr key={r.id}>
                          <td className="td-center" style={{ color: "#888" }}>{i + 1}</td>
                          <td style={{ fontWeight: "500" }}>{r.name}</td>
                          <td style={{ color: "#555" }}>{r.specialty}</td>
                          <td className="td-center" style={{ fontWeight: "bold" }}>{r.atendimentos}</td>
                          <td className="td-right" style={{ fontWeight: "bold" }}>{fmt(r.valor)}</td>
                        </tr>
                      ))}
                      {fechamento.profBreakdown.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign: "center", color: "#888", padding: "14px" }}>
                          Nenhum atendimento registrado no período.
                        </td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="print-total-row">
                        <td colSpan={3} style={{ fontWeight: "bold" }}>TOTAL GERAL</td>
                        <td className="td-center">{fechamento.totalAtend}</td>
                        <td className="td-right">{fmt(fechamento.repasseBruto)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Resumo de valores */}
                <div className="print-section" style={{ display: "flex", gap: "12mm", justifyContent: "flex-end" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "10pt", minWidth: "220pt" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "5px 8px", color: "#555" }}>Valor por Atendimento</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: "500" }}>
                          {fmt(selectedContractor.valorPorAtendimento)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "5px 8px", color: "#555" }}>Total de Atendimentos</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: "500" }}>
                          {fechamento.totalAtend}
                        </td>
                      </tr>
                      <tr style={{ borderTop: "2px solid #111" }}>
                        <td style={{ padding: "8px 8px", fontWeight: "bold", fontSize: "12pt" }}>
                          Total a Repassar
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: "bold", fontSize: "12pt" }}>
                          {fmt(fechamento.repasseBruto)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Rodapé legal */}
                <div style={{ borderTop: "1px solid #ccc", paddingTop: 8, marginTop: 8 }}>
                  <p style={{ fontSize: "8pt", color: "#888", lineHeight: 1.5 }}>
                    Este documento apresenta exclusivamente a produção de atendimentos realizados no período indicado e o respectivo valor de repasse por serviços prestados.
                    Não contém informações sobre estrutura de custos, salários ou margens internas da empresa prestadora.
                    Gerado automaticamente pelo sistema NFS — Gestão Terapêutica.
                  </p>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}

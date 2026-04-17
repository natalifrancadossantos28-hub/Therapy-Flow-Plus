import { useEffect, useState, useMemo, useRef } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import { FileText, Printer, ChevronLeft, ChevronRight, TrendingUp, Users, DollarSign, CheckCircle2, Building2 } from "lucide-react";
import { motion } from "framer-motion";

// ── Constantes fixas ─────────────────────────────────────────────────────────
const VALOR_SESSAO   = 30;    // R$ por atendimento (repasse Prefeitura)
const NOME_EMPRESA   = "Zoe";
const CNPJ_EMPRESA   = "— / —";

const CANCELLED      = new Set(["desmarcado", "remarcado"]);

type Appointment = { id: number; status: string; professionalId: number };
type ProfRow = {
  id: number; name: string; specialty: string;
  count: number; valor: number;
};

function fmtMoney(n: number) {
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
    label:    now.toLocaleString("pt-BR", { month: "long", year: "numeric" }),
    labelCap: now.toLocaleString("pt-BR", { month: "long", year: "numeric" })
              .replace(/^\w/, c => c.toUpperCase()),
    y, m: m + 1,
  };
}

export default function RelatorioRepasse() {
  const { data: professionals = [] } = useGetProfessionals({} as any);
  const [monthOffset, setMonthOffset] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => getMonthRange(monthOffset), [monthOffset]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/appointments?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`)
      .then(r => r.json())
      .then((data: Appointment[]) => setAppointments(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range.dateFrom, range.dateTo]);

  const rows: ProfRow[] = useMemo(() => {
    if (!professionals.length) return [];
    const countMap: Record<number, number> = {};
    for (const a of appointments) {
      if (CANCELLED.has(a.status)) continue;
      countMap[a.professionalId] = (countMap[a.professionalId] || 0) + 1;
    }
    return (professionals as any[])
      .map((p: any) => ({
        id:        p.id,
        name:      p.name,
        specialty: p.specialty || "—",
        count:     countMap[p.id] || 0,
        valor:     (countMap[p.id] || 0) * VALOR_SESSAO,
      }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [professionals, appointments]);

  const totalAtendimentos = rows.reduce((s, r) => s + r.count, 0);
  const totalValor        = totalAtendimentos * VALOR_SESSAO;
  const hoje              = new Date().toLocaleDateString("pt-BR");

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* ── Estilos para impressão ─────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #relatorio-print, #relatorio-print * { visibility: visible !important; }
          #relatorio-print {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important;
            padding: 32px !important;
            background: #fff !important;
            color: #111 !important;
          }
          .no-print { display: none !important; }
          .print-page-break { page-break-after: always; }
          .print-border { border: 1px solid #e5e7eb !important; }
          .print-text-dark { color: #111 !important; }
          .print-header-bg { background: #f8fafc !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* Toolbar – oculto na impressão */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2"
              style={{ color: "#00d4ff", textShadow: "0 0 20px rgba(0,212,255,0.4)" }}>
              <FileText className="w-6 h-6" />
              Relatório de Repasse
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Prestação de contas à Prefeitura de Ibiúna</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Navegação de mês */}
            <div className="flex items-center gap-1 rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(0,212,255,0.2)", background: "rgba(0,212,255,0.05)" }}>
              <button onClick={() => setMonthOffset(o => o - 1)}
                className="px-3 py-2 hover:bg-white/5 transition-colors" title="Mês anterior">
                <ChevronLeft className="w-4 h-4" style={{ color: "#00d4ff" }} />
              </button>
              <span className="px-4 py-2 text-sm font-semibold capitalize" style={{ color: "#00d4ff" }}>
                {range.label}
              </span>
              <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
                disabled={monthOffset === 0}
                className="px-3 py-2 hover:bg-white/5 transition-colors disabled:opacity-30" title="Próximo mês">
                <ChevronRight className="w-4 h-4" style={{ color: "#00d4ff" }} />
              </button>
            </div>

            {/* Gerar PDF */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: "rgba(0,212,255,0.1)",
                border: "1.5px solid rgba(0,212,255,0.4)",
                color: "#00d4ff",
                boxShadow: "0 0 20px rgba(0,212,255,0.1)",
              }}
            >
              <Printer className="w-4 h-4" />
              Gerar PDF / Imprimir
            </button>
          </div>
        </div>

        {/* ── Documento do relatório ──────────────────────────────────── */}
        <div id="relatorio-print" ref={printRef}>

          {/* Cabeçalho do documento */}
          <div className="rounded-2xl p-6 mb-5 print-header-bg"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(0,180,220,0.04) 100%)",
              border: "1.5px solid rgba(0,212,255,0.25)",
            }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}>
                    <Building2 className="w-5 h-5" style={{ color: "#00d4ff" }} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-display" style={{ color: "#00d4ff" }}>
                      Fatura Mensal — Prestação de Serviços {NOME_EMPRESA}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Serviços de Reabilitação e Terapia Ocupacional · Ibiúna – SP
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Competência</p>
                <p className="text-base font-bold capitalize" style={{ color: "#00d4ff" }}>
                  {range.labelCap}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Emitido em {hoje}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Contratante", value: "Prefeitura de Ibiúna" },
                { label: "Contratada", value: `${NOME_EMPRESA} Gestão Terapêutica` },
                { label: "Valor unitário", value: fmtMoney(VALOR_SESSAO) + " / sessão" },
                { label: "Período", value: `${range.dateFrom} a ${range.dateTo}` },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5 print-text-dark">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 rounded-full animate-spin border-2 border-transparent"
                style={{ borderTopColor: "#00d4ff" }} />
              <span className="ml-3 text-sm text-muted-foreground">Carregando agenda...</span>
            </div>
          )}

          {/* Tabela de profissionais */}
          {!loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl overflow-hidden mb-5 print-border"
              style={{ border: "1px solid rgba(0,212,255,0.15)" }}
            >
              {/* Header da tabela */}
              <div className="grid grid-cols-12 gap-2 px-5 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground"
                style={{ background: "rgba(0,212,255,0.06)", borderBottom: "1px solid rgba(0,212,255,0.12)" }}>
                <span className="col-span-1">#</span>
                <span className="col-span-4">Profissional</span>
                <span className="col-span-3">Especialidade</span>
                <span className="col-span-2 text-center">Atendimentos</span>
                <span className="col-span-2 text-right">Valor</span>
              </div>

              {rows.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum atendimento registrado neste período.</p>
                </div>
              ) : (
                rows.map((row, i) => (
                  <div key={row.id}
                    className="grid grid-cols-12 gap-2 px-5 py-4 items-center transition-colors"
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}
                  >
                    <span className="col-span-1 text-sm font-bold text-muted-foreground/50">{i + 1}</span>
                    <div className="col-span-4">
                      <p className="font-bold text-sm">{row.name}</p>
                    </div>
                    <span className="col-span-3 text-sm text-muted-foreground">{row.specialty}</span>
                    <div className="col-span-2 flex items-center justify-center gap-1.5">
                      <span className="text-base font-bold font-display" style={{ color: "#00d4ff" }}>
                        {row.count}
                      </span>
                      <span className="text-[11px] text-muted-foreground">sessões</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-base font-bold font-display" style={{ color: "#00ff9f" }}>
                        {fmtMoney(row.valor)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* Totalizador */}
          {!loading && rows.length > 0 && (
            <div className="rounded-2xl p-6 mb-5 print-border"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.07) 0%, rgba(0,255,159,0.04) 100%)",
                border: "1.5px solid rgba(0,212,255,0.3)",
              }}>
              <div className="flex flex-wrap items-center justify-between gap-6">
                {/* Estatísticas */}
                <div className="flex gap-8">
                  {[
                    { icon: Users, label: "Profissionais ativos", value: rows.length },
                    { icon: TrendingUp, label: "Total de atendimentos", value: totalAtendimentos },
                    { icon: DollarSign, label: "Valor unitário", value: fmtMoney(VALOR_SESSAO) },
                  ].map(stat => (
                    <div key={stat.label}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <stat.icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{stat.label}</p>
                      </div>
                      <p className="text-xl font-bold font-display" style={{ color: "#00d4ff" }}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Total em destaque */}
                <div className="text-right">
                  <p className="text-xs font-black uppercase tracking-[0.2em] mb-1 text-muted-foreground">
                    VALOR TOTAL DO REPASSE
                  </p>
                  <p className="text-4xl font-bold font-display"
                    style={{
                      color: "#00d4ff",
                      textShadow: "0 0 30px rgba(0,212,255,0.6)",
                    }}>
                    {fmtMoney(totalValor)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalAtendimentos} atendimentos × {fmtMoney(VALOR_SESSAO)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Rodapé do documento */}
          {!loading && (
            <div className="pt-4 border-t text-xs text-muted-foreground flex flex-wrap justify-between gap-3"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <span>
                Relatório gerado automaticamente pelo sistema NFS Gestão Terapêutica · {hoje}
              </span>
              <span className="font-mono">
                Competência: {range.labelCap} · {range.dateFrom} a {range.dateTo}
              </span>
            </div>
          )}
        </div>

        {/* Dica de PDF – oculto na impressão */}
        {!loading && (
          <div className="no-print flex items-start gap-3 rounded-2xl px-5 py-4"
            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}>
            <Printer className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#00d4ff" }} />
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">Como salvar em PDF:</strong>{" "}
              Clique em "Gerar PDF / Imprimir", selecione <em>"Salvar como PDF"</em> como destino de impressão e ajuste o papel para A4. O relatório será formatado automaticamente para impressão.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useState, useCallback } from "react";
import {
  getAIFullAnalysis,
  getAIWaitingListOptimization,
  getAIChurnAlerts,
  getAIAgeLimitReport,
  getAISystemHealth,
  type AIAnalysis,
} from "@/lib/arco-rpc";
import { Card } from "@/components/ui-custom";
import {
  Brain,
  ListTodo,
  AlertTriangle,
  CalendarClock,
  HeartPulse,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type TabKey = "resumo" | "fila" | "churn" | "idade" | "saude";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Brain; description: string }> = [
  { key: "resumo", label: "Visão Geral", icon: Sparkles, description: "Resumo executivo do sistema" },
  { key: "fila", label: "Fila de Espera", icon: ListTodo, description: "Otimização e sugestões da fila" },
  { key: "churn", label: "Evasão", icon: AlertTriangle, description: "Risco de abandono de pacientes" },
  { key: "idade", label: "Limite de Idade", icon: CalendarClock, description: "Pacientes próximos do limite" },
  { key: "saude", label: "Saúde do Sistema", icon: HeartPulse, description: "Inconsistências e auto-correção" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    otimo: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    bom: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    atencao: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    critico: "bg-red-500/20 text-red-400 border-red-500/30",
    alto: "bg-red-500/20 text-red-400 border-red-500/30",
    medio: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    baixo: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  const cls = colors[status] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${cls} uppercase`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critico: "bg-red-500/20 text-red-400",
    urgente: "bg-red-500/20 text-red-400",
    alerta: "bg-amber-500/20 text-amber-400",
    atencao: "bg-amber-500/20 text-amber-400",
    info: "bg-sky-500/20 text-sky-400",
  };
  const cls = colors[severity] ?? "bg-zinc-500/20 text-zinc-400";
  return <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${cls} uppercase`}>{severity}</span>;
}

// ── Resumo Tab ─────────────────────────────────────────────────────────────
function ResumoTab({ data }: { data: Record<string, unknown> }) {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  const summary = data.summary as Record<string, number> | undefined;
  if (!analysis) return <p className="text-zinc-400">Sem dados</p>;

  const insights = (analysis.insights ?? []) as Array<{ icone: string; titulo: string; descricao: string }>;
  const acoes = (analysis.acoesPrioritarias ?? []) as string[];
  const indicadores = analysis.indicadores as Record<string, string> | undefined;

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
        <Brain className="w-6 h-6 text-violet-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-zinc-200">{analysis.saudacao as string}</p>
          {analysis.statusGeral && (
            <div className="mt-2"><StatusBadge status={analysis.statusGeral as string} /></div>
          )}
        </div>
      </div>

      {/* Indicadores rápidos */}
      {(summary || indicadores) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary?.totalPacientes != null && (
            <MiniCard icon={Users} label="Pacientes" value={String(summary.totalPacientes)} />
          )}
          {summary?.filaDeEspera != null && (
            <MiniCard icon={ListTodo} label="Na Fila" value={String(summary.filaDeEspera)} />
          )}
          {summary?.taxaPresenca != null && (
            <MiniCard icon={TrendingUp} label="Presença" value={`${summary.taxaPresenca}%`} />
          )}
          {indicadores?.risco && (
            <MiniCard icon={AlertTriangle} label="Risco" value={indicadores.risco} />
          )}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Insights da IA</h3>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <span className="text-lg">{ins.icone}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{ins.titulo}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{ins.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações prioritárias */}
      {acoes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Ações Prioritárias</h3>
          <ol className="space-y-2">
            {acoes.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="shrink-0 w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Fila Tab ───────────────────────────────────────────────────────────────
function FilaTab({ data }: { data: Record<string, unknown> }) {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  if (!analysis) return <p className="text-zinc-400">Sem dados</p>;

  const alertas = (analysis.alertas ?? []) as Array<{ tipo: string; mensagem: string }>;
  const sugestoes = (analysis.sugestoes ?? []) as Array<{ paciente: string; acao: string; motivo: string }>;
  const metricas = analysis.metricas as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-300">{analysis.resumo as string}</p>

      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          {metricas.tempoMedioEspera && <MiniCard icon={CalendarClock} label="Tempo Médio" value={String(metricas.tempoMedioEspera)} />}
          {metricas.especialidadeMaisDemandada && <MiniCard icon={Zap} label="Mais Demandada" value={String(metricas.especialidadeMaisDemandada)} />}
          {metricas.pacientesUrgentes != null && <MiniCard icon={AlertTriangle} label="Urgentes" value={String(metricas.pacientesUrgentes)} />}
        </div>
      )}

      {alertas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Alertas</h3>
          {alertas.map((a, i) => (
            <div key={i} className="flex items-start gap-2 p-3 mb-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <SeverityBadge severity={a.tipo} />
              <span className="text-xs text-zinc-300">{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      {sugestoes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Sugestões de Otimização</h3>
          {sugestoes.map((s, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-sm font-medium text-violet-400">{s.paciente}</p>
              <p className="text-xs text-zinc-300 mt-1">{s.acao}</p>
              <p className="text-[10px] text-zinc-500 mt-1 italic">{s.motivo}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Churn Tab ──────────────────────────────────────────────────────────────
function ChurnTab({ data }: { data: Record<string, unknown> }) {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  if (!analysis) return <p className="text-zinc-400">Sem dados</p>;

  const riscoAlto = (analysis.riscoAlto ?? []) as Array<{ paciente: string; motivo: string; sugestao: string; indicadores?: string }>;
  const riscoModerado = (analysis.riscoModerado ?? []) as Array<{ paciente: string; motivo: string; sugestao: string }>;
  const metricas = analysis.metricas as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-300">{analysis.resumo as string}</p>

      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          {metricas.taxaPresencaMedia && <MiniCard icon={TrendingUp} label="Presença Média" value={String(metricas.taxaPresencaMedia)} />}
          {metricas.pacientesEmRisco != null && <MiniCard icon={AlertTriangle} label="Em Risco" value={String(metricas.pacientesEmRisco)} />}
          {metricas.pacientesSemAgendamento30dias != null && <MiniCard icon={CalendarClock} label="Sem Agenda 30d" value={String(metricas.pacientesSemAgendamento30dias)} />}
        </div>
      )}

      {riscoAlto.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-3">Risco Alto</h3>
          {riscoAlto.map((r, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-2">
                <SeverityBadge severity="critico" />
                <span className="text-sm font-medium text-zinc-200">{r.paciente}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">{r.motivo}</p>
              {r.indicadores && <p className="text-[10px] text-zinc-500 mt-0.5">{r.indicadores}</p>}
              <p className="text-xs text-emerald-400 mt-1">Sugestão: {r.sugestao}</p>
            </div>
          ))}
        </div>
      )}

      {riscoModerado.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-3">Risco Moderado</h3>
          {riscoModerado.map((r, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <SeverityBadge severity="atencao" />
                <span className="text-sm font-medium text-zinc-200">{r.paciente}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">{r.motivo}</p>
              <p className="text-xs text-emerald-400 mt-1">Sugestão: {r.sugestao}</p>
            </div>
          ))}
        </div>
      )}

      {riscoAlto.length === 0 && riscoModerado.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-300">Nenhum paciente em risco de evasão detectado!</span>
        </div>
      )}
    </div>
  );
}

// ── Idade Tab ──────────────────────────────────────────────────────────────
function IdadeTab({ data }: { data: Record<string, unknown> }) {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  if (!analysis) return <p className="text-zinc-400">Sem dados</p>;

  const proximosDoLimite = (analysis.proximosDoLimite ?? []) as Array<{
    paciente: string; idade: number; mesesRestantes: number; especialidades: string[]; recomendacao: string;
  }>;
  const foraDoLimite = (analysis.foraDoLimite ?? []) as Array<{ paciente: string; idade: number; recomendacao: string }>;
  const alertas = (analysis.alertas ?? []) as Array<{ tipo: string; mensagem: string }>;
  const faixas = analysis.faixasEtarias as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-300">{analysis.resumo as string}</p>

      {faixas && (
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(faixas).map(([key, val]) => {
            const labels: Record<string, string> = {
              bebes_0_2: "0-2",
              infancia1_3_6: "3-6",
              infancia2_7_10: "7-10",
              adolescentes_11_17: "11-17",
              adultos_18_mais: "18+",
            };
            return <MiniCard key={key} icon={Users} label={labels[key] ?? key} value={String(val)} />;
          })}
        </div>
      )}

      {foraDoLimite.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-3">Fora do Limite (18+)</h3>
          {foraDoLimite.map((p, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-2">
                <SeverityBadge severity="urgente" />
                <span className="text-sm font-medium text-zinc-200">{p.paciente} ({p.idade} anos)</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">{p.recomendacao}</p>
            </div>
          ))}
        </div>
      )}

      {proximosDoLimite.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-3">Próximos do Limite</h3>
          {proximosDoLimite.map((p, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">{p.paciente} ({p.idade} anos)</span>
                <span className="text-[10px] text-amber-400 font-bold">{p.mesesRestantes} meses restantes</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">Especialidades: {p.especialidades?.join(", ") ?? "—"}</p>
              <p className="text-xs text-zinc-400 mt-1">{p.recomendacao}</p>
            </div>
          ))}
        </div>
      )}

      {alertas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Alertas</h3>
          {alertas.map((a, i) => (
            <div key={i} className="flex items-start gap-2 p-3 mb-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <SeverityBadge severity={a.tipo} />
              <span className="text-xs text-zinc-300">{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Saúde Tab ──────────────────────────────────────────────────────────────
function SaudeTab({ data }: { data: Record<string, unknown> }) {
  const analysis = data.analysis as Record<string, unknown> | undefined;
  if (!analysis) return <p className="text-zinc-400">Sem dados</p>;

  const problemas = (analysis.problemas ?? []) as Array<{
    severidade: string; categoria: string; descricao: string; correcao: string; paciente?: string;
  }>;
  const recomendacoes = (analysis.recomendacoes ?? []) as string[];
  const metricas = analysis.metricas as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        <HeartPulse className="w-6 h-6 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-zinc-200">{analysis.resumo as string}</p>
          {analysis.saude && <div className="mt-2"><StatusBadge status={analysis.saude as string} /></div>}
        </div>
      </div>

      {metricas && (
        <div className="grid grid-cols-4 gap-3">
          <MiniCard icon={ListTodo} label="Total" value={String(metricas.totalProblemas ?? 0)} />
          <MiniCard icon={AlertTriangle} label="Críticos" value={String(metricas.criticos ?? 0)} />
          <MiniCard icon={AlertTriangle} label="Alertas" value={String(metricas.alertas ?? 0)} />
          <MiniCard icon={ShieldCheck} label="Infos" value={String(metricas.infos ?? 0)} />
        </div>
      )}

      {problemas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Problemas Detectados</h3>
          {problemas.map((p, i) => (
            <div key={i} className="p-3 mb-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-1">
                <SeverityBadge severity={p.severidade} />
                <span className="text-[10px] text-zinc-500 uppercase">{p.categoria}</span>
                {p.paciente && <span className="text-xs text-violet-400">{p.paciente}</span>}
              </div>
              <p className="text-xs text-zinc-300">{p.descricao}</p>
              <p className="text-xs text-emerald-400 mt-1">Correção: {p.correcao}</p>
            </div>
          ))}
        </div>
      )}

      {problemas.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-300">Sistema saudável! Nenhuma inconsistência detectada.</span>
        </div>
      )}

      {recomendacoes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Recomendações</h3>
          <ol className="space-y-2">
            {recomendacoes.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                {r}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Mini Card ──────────────────────────────────────────────────────────────
function MiniCard({ icon: Icon, label, value }: { icon: typeof Brain; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
      <Icon className="w-4 h-4 text-violet-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-zinc-500 uppercase truncate">{label}</p>
        <p className="text-sm font-bold text-zinc-200 truncate">{value}</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════
export default function AIBrainPage() {
  useDocumentTitle("Cérebro IA");

  const [activeTab, setActiveTab] = useState<TabKey>("resumo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<TabKey, Record<string, unknown>>>>({});

  const fetchTab = useCallback(async (tab: TabKey) => {
    setLoading(true);
    setError(null);
    try {
      const fetchers: Record<TabKey, () => Promise<AIAnalysis>> = {
        resumo: getAIFullAnalysis,
        fila: getAIWaitingListOptimization,
        churn: getAIChurnAlerts,
        idade: getAIAgeLimitReport,
        saude: getAISystemHealth,
      };
      const result = await fetchers[tab]();
      setResults((prev) => ({ ...prev, [tab]: result as unknown as Record<string, unknown> }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTabClick = (tab: TabKey) => {
    setActiveTab(tab);
    if (!results[tab]) fetchTab(tab);
  };

  const tabData = results[activeTab];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Cérebro do Sistema</h1>
            <p className="text-xs text-zinc-500">Powered by Gemini AI</p>
          </div>
        </div>
        <button
          onClick={() => fetchTab(activeTab)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Analisar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition
                ${isActive
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <Card className="p-6 bg-zinc-900/50 border-zinc-800/50">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="relative">
              <Brain className="w-12 h-12 text-violet-500/30" />
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin absolute -top-1 -right-1" />
            </div>
            <p className="text-sm text-zinc-400">Analisando dados com Gemini AI...</p>
            <p className="text-[10px] text-zinc-600">Isso pode levar alguns segundos</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">Erro na análise</p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
              <button
                onClick={() => fetchTab(activeTab)}
                className="mt-2 text-xs text-violet-400 hover:text-violet-300"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!loading && !error && !tabData && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Sparkles className="w-10 h-10 text-violet-500/30" />
            <p className="text-sm text-zinc-400">
              Clique em <strong className="text-violet-400">Analisar</strong> para ativar o cérebro da IA
            </p>
            <p className="text-[10px] text-zinc-600">
              {TABS.find((t) => t.key === activeTab)?.description}
            </p>
          </div>
        )}

        {!loading && !error && tabData && (
          <>
            {activeTab === "resumo" && <ResumoTab data={tabData} />}
            {activeTab === "fila" && <FilaTab data={tabData} />}
            {activeTab === "churn" && <ChurnTab data={tabData} />}
            {activeTab === "idade" && <IdadeTab data={tabData} />}
            {activeTab === "saude" && <SaudeTab data={tabData} />}
          </>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard } from "@/components/ui-custom";
import { Cake, Copy, Check, PartyPopper, MessageSquareHeart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listProfessionals, type Professional } from "@/lib/arco-rpc";
import {
  BIRTHDAY_TEMPLATES,
  CATEGORY_TEMPLATES,
  CATEGORY_DAYS,
  categoryDayFor,
  copyToClipboard,
  dateLabel,
  daysUntil,
  fillTemplate,
  firstName,
  todayISO,
  type CategoryDay,
} from "@/lib/datas-profissionais";

type Celebration = {
  key: string;
  kind: "aniversario" | "categoria";
  professional: Professional;
  month: number;
  day: number;
  /** Título da data da categoria (vazio em aniversário). */
  categoryDay: CategoryDay | null;
  daysAway: number;
};

/** Modelos preenchidos para a celebração, para a equipe escolher e copiar. */
function templatesFor(c: Celebration): string[] {
  const nome = firstName(c.professional.name);
  if (c.kind === "aniversario") {
    return BIRTHDAY_TEMPLATES.map((t) => fillTemplate(t, { nome }));
  }
  return CATEGORY_TEMPLATES.map((t) =>
    fillTemplate(t, {
      nome,
      categoria: c.categoryDay?.role ?? "profissional",
      titulo: c.categoryDay?.title ?? "seu dia",
    }),
  );
}

function CelebrationCard({ celebration }: { celebration: Celebration }) {
  const { toast } = useToast();
  const modelos = useMemo(() => templatesFor(celebration), [celebration]);
  const [index, setIndex] = useState(0);
  const [copiado, setCopiado] = useState(false);

  const texto = modelos[index] ?? "";
  const aniversario = celebration.kind === "aniversario";
  const cor = aniversario ? "#f472b6" : "#c084fc";

  const copiar = async () => {
    const ok = await copyToClipboard(texto);
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      toast({ title: "Mensagem copiada", description: "É só colar no WhatsApp." });
    } else {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione o texto e copie manualmente (Ctrl+C).",
        variant: "destructive",
      });
    }
  };

  return (
    <MotionCard
      className="p-4"
      style={{ border: `1px solid ${cor}55`, background: `${cor}14` }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {aniversario ? (
            <Cake className="w-5 h-5" style={{ color: cor }} />
          ) : (
            <PartyPopper className="w-5 h-5" style={{ color: cor }} />
          )}
          <div>
            <p className="font-bold text-foreground">{celebration.professional.name}</p>
            <p className="text-xs text-foreground/60">
              {aniversario
                ? `Aniversário · ${dateLabel(celebration.month, celebration.day)}`
                : `${celebration.categoryDay?.title} · ${dateLabel(celebration.month, celebration.day)}`}
              {celebration.professional.specialty ? ` · ${celebration.professional.specialty}` : ""}
            </p>
          </div>
        </div>
        <span
          className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
          style={{ color: cor, border: `1px solid ${cor}55` }}
        >
          {celebration.daysAway === 0
            ? "Hoje"
            : celebration.daysAway === 1
              ? "Amanhã"
              : `Em ${celebration.daysAway} dias`}
        </span>
      </div>

      <textarea
        readOnly
        value={texto}
        rows={4}
        className="mt-3 w-full text-sm rounded-xl bg-background/60 border border-border p-3 text-foreground resize-none"
      />

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={copiar}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors"
          style={{ color: cor, borderColor: `${cor}66` }}
        >
          {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copiado ? "Copiado!" : "Copiar mensagem"}
        </button>
        <div className="flex items-center gap-1">
          {modelos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className="w-7 h-7 text-[11px] font-bold rounded-lg border transition-colors"
              style={
                i === index
                  ? { color: cor, borderColor: `${cor}88`, background: `${cor}1f` }
                  : { color: "var(--muted-foreground)", borderColor: "var(--border)" }
              }
              title={`Modelo ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-foreground/50">
          {modelos.length} modelos — troque para não repetir
        </span>
      </div>
    </MotionCard>
  );
}

export default function CentralMensagensPage() {
  useDocumentTitle("Central de Mensagens");
  const { toast } = useToast();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [janela, setJanela] = useState<7 | 30 | 365>(30);

  useEffect(() => {
    listProfessionals()
      .then(setProfessionals)
      .catch((err: unknown) =>
        toast({
          title: "Erro ao carregar profissionais",
          description: err instanceof Error ? err.message : "Falha inesperada.",
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, [toast]);

  const hoje = todayISO();

  const celebrations = useMemo<Celebration[]>(() => {
    const list: Celebration[] = [];
    for (const p of professionals) {
      if (p.birthDate) {
        const month = Number(p.birthDate.slice(5, 7));
        const day = Number(p.birthDate.slice(8, 10));
        if (month && day) {
          list.push({
            key: `b-${p.id}`,
            kind: "aniversario",
            professional: p,
            month,
            day,
            categoryDay: null,
            daysAway: daysUntil(month, day, hoje),
          });
        }
      }
      const cat = categoryDayFor(p.specialty);
      if (cat) {
        list.push({
          key: `c-${p.id}`,
          kind: "categoria",
          professional: p,
          month: cat.month,
          day: cat.day,
          categoryDay: cat,
          daysAway: daysUntil(cat.month, cat.day, hoje),
        });
      }
    }
    return list.sort((a, b) => a.daysAway - b.daysAway || a.professional.name.localeCompare(b.professional.name));
  }, [professionals, hoje]);

  const hojeList = celebrations.filter((c) => c.daysAway === 0);
  const proximas = celebrations.filter((c) => c.daysAway > 0 && c.daysAway <= janela);
  const semNascimento = professionals.filter((p) => !p.birthDate);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquareHeart className="w-6 h-6 text-primary" />
          Central de Mensagens
        </h1>
        <p className="text-sm text-foreground/60 mt-1">
          Aniversários e datas comemorativas dos profissionais, com vários modelos de mensagem
          prontos para copiar e enviar.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-foreground/60">Carregando profissionais…</p>
      ) : (
        <>
          <MotionCard className="p-5" style={{ border: "1px solid rgba(236,72,153,0.45)", background: "rgba(236,72,153,0.08)" }}>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3" style={{ color: "#f472b6" }}>
              <Cake className="w-5 h-5" /> Hoje
            </h2>
            {hojeList.length === 0 ? (
              <p className="text-sm text-foreground/60">Nenhuma comemoração hoje.</p>
            ) : (
              <div className="space-y-3">
                {hojeList.map((c) => (
                  <CelebrationCard key={c.key} celebration={c} />
                ))}
              </div>
            )}
          </MotionCard>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground/70">Próximas:</span>
            {([7, 30, 365] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setJanela(d)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors"
                style={
                  janela === d
                    ? { color: "#c084fc", borderColor: "rgba(168,85,247,0.6)", background: "rgba(168,85,247,0.12)" }
                    : { color: "var(--muted-foreground)", borderColor: "var(--border)" }
                }
              >
                {d === 7 ? "7 dias" : d === 30 ? "30 dias" : "Ano todo"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {proximas.length === 0 ? (
              <p className="text-sm text-foreground/60">Nenhuma data no período selecionado.</p>
            ) : (
              proximas.map((c) => <CelebrationCard key={c.key} celebration={c} />)
            )}
          </div>

          {semNascimento.length > 0 && (
            <MotionCard className="p-4">
              <h3 className="font-bold text-foreground mb-1">Sem data de nascimento cadastrada</h3>
              <p className="text-sm text-foreground/60">
                {semNascimento.map((p) => p.name).join(", ")} — cadastre a data de nascimento na
                tela de Profissionais para que o aniversário apareça aqui e na agenda.
              </p>
            </MotionCard>
          )}

          <MotionCard className="p-4">
            <h3 className="font-bold text-foreground mb-2">Datas das categorias</h3>
            <ul className="text-sm text-foreground/70 space-y-1">
              {[...CATEGORY_DAYS]
                .filter((d, i, arr) => arr.findIndex((x) => x.title === d.title) === i)
                .sort((a, b) => a.month - b.month || a.day - b.day)
                .map((d) => (
                  <li key={d.title}>
                    <span className="font-semibold text-foreground">{dateLabel(d.month, d.day)}</span> — {d.title}
                  </li>
                ))}
            </ul>
          </MotionCard>
        </>
      )}
    </div>
  );
}

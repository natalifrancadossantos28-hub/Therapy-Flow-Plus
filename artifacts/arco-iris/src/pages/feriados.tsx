import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard, Button, Input, Label, Select } from "@/components/ui-custom";
import { CalendarOff, Plus, Trash2, Plane, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listFeriados,
  upsertFeriado,
  deleteFeriado,
  listAusencias,
  addAusencia,
  deleteAusencia,
  listProfessionals,
  type Feriado,
  type Ausencia,
  type Professional,
} from "@/lib/arco-rpc";
import { feriadosNacionais } from "@/lib/blocked-dates";

function fmt(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

export default function FeriadosPage() {
  useDocumentTitle("Feriados & Ausências");
  const { toast } = useToast();

  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  const profName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of professionals) map.set(p.id, p.name);
    return map;
  }, [professionals]);

  const reload = useCallback(() => {
    Promise.all([listFeriados(), listAusencias(), listProfessionals()])
      .then(([f, a, p]) => {
        setFeriados(f);
        setAusencias(a);
        setProfessionals(p);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
        toast({ title: "Erro ao carregar", description: String(e?.message ?? e), variant: "destructive" });
      });
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Feriados ────────────────────────────────────────────────────────────────
  const [novaData, setNovaData] = useState("");
  const [novaDesc, setNovaDesc] = useState("");
  const [savingFer, setSavingFer] = useState(false);

  const addFeriado = async () => {
    if (!novaData) {
      toast({ title: "Escolha a data do feriado.", variant: "destructive" });
      return;
    }
    setSavingFer(true);
    try {
      await upsertFeriado(novaData, novaDesc.trim());
      setNovaData("");
      setNovaDesc("");
      const f = await listFeriados();
      setFeriados(f);
      toast({ title: "Feriado adicionado." });
    } catch (e) {
      toast({ title: "Erro ao salvar feriado", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setSavingFer(false);
    }
  };

  const [seeding, setSeeding] = useState(false);
  const seedNacionais = async (year: number) => {
    setSeeding(true);
    try {
      const existentes = new Set(feriados.map((f) => f.data));
      const novos = feriadosNacionais(year).filter((f) => !existentes.has(f.data));
      for (const f of novos) {
        await upsertFeriado(f.data, f.descricao);
      }
      const f = await listFeriados();
      setFeriados(f);
      toast({ title: `Feriados nacionais de ${year} adicionados`, description: `${novos.length} novo(s).` });
    } catch (e) {
      toast({ title: "Erro ao adicionar feriados nacionais", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const removeFeriado = async (id: number) => {
    try {
      await deleteFeriado(id);
      setFeriados((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      toast({ title: "Erro ao remover", description: String((e as Error)?.message ?? e), variant: "destructive" });
    }
  };

  // ── Ausências ─────────────────────────────────────────────────────────────
  const [ausProf, setAusProf] = useState("");
  const [ausIni, setAusIni] = useState("");
  const [ausFim, setAusFim] = useState("");
  const [ausMotivo, setAusMotivo] = useState("");
  const [savingAus, setSavingAus] = useState(false);

  const addAusenciaHandler = async () => {
    if (!ausProf) {
      toast({ title: "Escolha o profissional.", variant: "destructive" });
      return;
    }
    if (!ausIni) {
      toast({ title: "Escolha a data inicial.", variant: "destructive" });
      return;
    }
    setSavingAus(true);
    try {
      await addAusencia(parseInt(ausProf), ausIni, ausFim || ausIni, ausMotivo.trim());
      setAusIni("");
      setAusFim("");
      setAusMotivo("");
      const a = await listAusencias();
      setAusencias(a);
      toast({ title: "Ausência registrada." });
    } catch (e) {
      toast({ title: "Erro ao salvar ausência", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setSavingAus(false);
    }
  };

  const removeAusencia = async (id: number) => {
    try {
      await deleteAusencia(id);
      setAusencias((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      toast({ title: "Erro ao remover", description: String((e as Error)?.message ?? e), variant: "destructive" });
    }
  };

  const anoAtual = new Date().getFullYear();

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarOff className="w-6 h-6 text-primary" />
          Feriados & Ausências
        </h1>
        <p className="text-sm text-foreground/60 mt-1">
          Nos feriados e nos períodos de ausência (férias/folga/falta), os atendimentos deixam de aparecer na
          Recepção, na Agenda e no Portal — as recorrências voltam sozinhas depois.
        </p>
      </div>

      {/* ── Feriados ─────────────────────────────────────────────────────── */}
      <MotionCard className="p-5">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
          <CalendarOff className="w-5 h-5 text-primary" />
          Feriados da clínica
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
          <div>
            <Label>Data</Label>
            <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              placeholder="Ex.: Aniversário da cidade / ponto facultativo"
              value={novaDesc}
              onChange={(e) => setNovaDesc(e.target.value)}
            />
          </div>
          <Button onClick={addFeriado} disabled={savingFer}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => seedNacionais(anoAtual)} disabled={seeding}>
            <Sparkles className="w-4 h-4 mr-1" /> Feriados nacionais {anoAtual}
          </Button>
          <Button variant="outline" size="sm" onClick={() => seedNacionais(anoAtual + 1)} disabled={seeding}>
            <Sparkles className="w-4 h-4 mr-1" /> Feriados nacionais {anoAtual + 1}
          </Button>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-foreground/50">Carregando…</p>
          ) : feriados.length === 0 ? (
            <p className="text-sm text-foreground/50">Nenhum feriado cadastrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {feriados.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-semibold text-foreground">{fmt(f.data)}</span>
                    {f.descricao && <span className="text-foreground/60"> — {f.descricao}</span>}
                  </div>
                  <button
                    className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remover feriado"
                    onClick={() => removeFeriado(f.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </MotionCard>

      {/* ── Ausências ────────────────────────────────────────────────────── */}
      <MotionCard className="p-5">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
          <Plane className="w-5 h-5 text-primary" />
          Ausências de profissionais (férias / folga / falta)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2">
            <Label>Profissional</Label>
            <Select value={ausProf} onChange={(e) => setAusProf(e.target.value)}>
              <option value="">Selecione…</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.specialty ? ` — ${p.specialty}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={ausIni} onChange={(e) => setAusIni(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={ausFim} onChange={(e) => setAusFim(e.target.value)} />
          </div>
          <Button onClick={addAusenciaHandler} disabled={savingAus}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="mt-3">
          <Label>Motivo (opcional)</Label>
          <Input
            placeholder="Ex.: Férias / atestado / folga"
            value={ausMotivo}
            onChange={(e) => setAusMotivo(e.target.value)}
          />
        </div>
        <p className="text-xs text-foreground/50 mt-2">
          Deixe "Até" vazio para marcar um único dia. Use datas iguais para uma falta pontual.
        </p>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-foreground/50">Carregando…</p>
          ) : ausencias.length === 0 ? (
            <p className="text-sm text-foreground/50">Nenhuma ausência cadastrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {ausencias.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-semibold text-foreground">
                      {profName.get(a.professionalId) ?? `Profissional #${a.professionalId}`}
                    </span>
                    <span className="text-foreground/60">
                      {" "}
                      — {fmt(a.dataInicio)}
                      {a.dataFim !== a.dataInicio ? ` a ${fmt(a.dataFim)}` : ""}
                      {a.motivo ? ` · ${a.motivo}` : ""}
                    </span>
                  </div>
                  <button
                    className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remover ausência"
                    onClick={() => removeAusencia(a.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </MotionCard>
    </div>
  );
}

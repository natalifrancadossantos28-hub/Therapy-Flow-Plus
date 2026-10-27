import { useCallback, useEffect, useState } from "react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Bell, Check, Pencil, Trash2, MapPin, RotateCcw, Smartphone } from "lucide-react";
import { Card, Button, Input, Label, Select } from "@/components/ui-custom";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/lib/utils";
import {
  listCompromissos, saveCompromisso, setCompromissoConcluido, deleteCompromisso, migracaoPendente, type Compromisso,
} from "@/lib/agenda-admin-rpc";
import { COMPROMISSOS_EVENTO, inicioDe, faltaTexto } from "@/components/LembretesAviso";
import { baixarIcs, linkGoogleAgenda } from "@/lib/compromisso-celular";

const ANTECEDENCIAS: [number, string][] = [
  [0, "Na hora"], [10, "10 minutos antes"], [30, "30 minutos antes"],
  [60, "1 hora antes"], [120, "2 horas antes"], [1440, "1 dia antes"],
];
const rotulo = (m: number) => ANTECEDENCIAS.find(([v]) => v === m)?.[1] ?? `${m} min antes`;
const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const vazio = () => ({ id: null as number | null, titulo: "", data: ISO(new Date()), hora: "09:00", local: "", observacao: "", antecedenciaMin: 30 });
const diaLabel = (d: string) => {
  if (d === ISO(new Date())) return "Hoje";
  if (d === ISO(addDays(new Date(), 1))) return "Amanhã";
  return format(parseISO(d), "EEEE, dd 'de' MMMM", { locale: ptBR });
};

export default function AgendaAdministrativa() {
  useDocumentTitle("Agenda Administrativa");
  const { toast } = useToast();
  const [lista, setLista] = useState<Compromisso[] | null>(null);
  const [pendente, setPendente] = useState(false);
  const [form, setForm] = useState(vazio);
  const [saving, setSaving] = useState(false);
  const [verPassados, setVerPassados] = useState(false);
  const [perm, setPerm] = useState<string>(() => ("Notification" in window ? Notification.permission : "unsupported"));

  const carregar = useCallback(() => {
    const h = new Date();
    listCompromissos(ISO(subDays(h, 60)), ISO(addDays(h, 400)))
      .then((l) => { setLista(l); setPendente(false); })
      .catch((e) => {
        setLista([]);
        if (migracaoPendente(e)) setPendente(true);
        else toast({ title: "Erro ao carregar a agenda", description: e?.message, variant: "destructive" });
      });
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);
  const mudou = () => { window.dispatchEvent(new Event(COMPROMISSOS_EVENTO)); carregar(); };

  const erro = (e: unknown, titulo: string) => toast({
    title: titulo, variant: "destructive",
    description: migracaoPendente(e) ? "A migração 0130 ainda não foi rodada no Supabase." : (e as Error)?.message,
  });

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.titulo.trim()) { toast({ title: "Informe o título do compromisso" }); return; }
    setSaving(true);
    try {
      await saveCompromisso({ ...form, titulo: form.titulo.trim(), local: form.local.trim() || null, observacao: form.observacao.trim() || null });
      toast({ title: form.id ? "Compromisso atualizado" : "Compromisso salvo", description: `Aviso: ${rotulo(form.antecedenciaMin).toLowerCase()}.` });
      setForm(vazio());
      mudou();
    } catch (e) { erro(e, "Não foi possível salvar"); } finally { setSaving(false); }
  };
  const concluir = async (c: Compromisso, v: boolean) => {
    try { await setCompromissoConcluido(c.id, v); mudou(); } catch (e) { erro(e, "Não foi possível atualizar"); }
  };
  const excluir = async (c: Compromisso) => {
    if (!window.confirm(`Excluir "${c.titulo}"?`)) return;
    try { await deleteCompromisso(c.id); if (form.id === c.id) setForm(vazio()); mudou(); } catch (e) { erro(e, "Não foi possível excluir"); }
  };
  const editar = (c: Compromisso) => {
    setForm({ id: c.id, titulo: c.titulo, data: c.data, hora: c.hora, local: c.local ?? "", observacao: c.observacao ?? "", antecedenciaMin: c.antecedenciaMin });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const agora = Date.now();
  const todos = lista ?? [];
  const proximos = todos.filter((c) => !c.concluido && inicioDe(c).getTime() >= agora - 60 * 60_000)
    .sort((a, b) => inicioDe(a).getTime() - inicioDe(b).getTime());
  const passados = todos.filter((c) => !proximos.includes(c)).sort((a, b) => inicioDe(b).getTime() - inicioDe(a).getTime());
  const grupos = proximos.reduce<[string, Compromisso[]][]>((acc, c) => {
    const g = acc.find(([d]) => d === c.data);
    if (g) g[1].push(c); else acc.push([c.data, [c]]);
    return acc;
  }, []);

  const Linha = ({ c, passado }: { c: Compromisso; passado?: boolean }) => {
    const min = Math.round((inicioDe(c).getTime() - agora) / 60_000);
    return (
      <div className={cn("flex items-start gap-3 rounded-xl border border-border p-3", passado && "opacity-70", form.id === c.id && "border-primary")}>
        <div className="text-center shrink-0 w-14">
          <p className="text-lg font-black leading-none">{c.hora}</p>
          {passado && <p className="text-[10px] text-muted-foreground mt-1">{format(parseISO(c.data), "dd/MM")}</p>}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-bold", c.concluido && "line-through")}>{c.titulo}</p>
          {c.local && <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{c.local}</p>}
          {c.observacao && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.observacao}</p>}
          {!passado && (
            <p className="text-[11px] mt-1 flex items-center gap-1 text-primary"><Bell className="w-3 h-3" />
              Aviso {rotulo(c.antecedenciaMin).toLowerCase()} · {faltaTexto(min)}</p>
          )}
          {!passado && !c.concluido && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => baixarIcs(c)}>
                <Smartphone className="w-4 h-4" /> Adicionar no iPhone
              </Button>
              <a href={linkGoogleAgenda(c)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary">
                <Smartphone className="w-4 h-4" /> Adicionar no Google Agenda (Android)
              </a>
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {c.concluido
            ? <Button size="icon" variant="ghost" title="Reabrir" onClick={() => void concluir(c, false)}><RotateCcw className="w-4 h-4" /></Button>
            : <Button size="icon" variant="ghost" title="Concluído" onClick={() => void concluir(c, true)}><Check className="w-4 h-4" /></Button>}
          <Button size="icon" variant="ghost" title="Editar" onClick={() => editar(c)}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" title="Excluir" onClick={() => void excluir(c)}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2"><CalendarClock className="w-7 h-7 text-primary" /> Agenda Administrativa</h1>
        <p className="text-muted-foreground mt-1">Reuniões e compromissos da Administração. O sistema avisa na tela antes do horário.</p>
      </div>

      {pendente && (
        <Card className="p-4 border-amber-500/50 bg-amber-500/10 text-sm">
          Falta rodar a migração <b>0130_agenda_administrativa.sql</b> no Supabase para salvar os compromissos.
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-lg">{form.id ? "Editar compromisso" : "Novo compromisso"}</h2>
          <form onSubmit={salvar} className="space-y-3">
            <div className="space-y-1"><Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Reunião na Secretaria de Saúde" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Data *</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required /></div>
              <div className="space-y-1"><Label>Hora *</Label>
                <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} required /></div>
            </div>
            <div className="space-y-1"><Label>Local</Label>
              <Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} placeholder="Ex.: Prefeitura, sala 3" /></div>
            <div className="space-y-1"><Label>Me avisar</Label>
              <Select value={String(form.antecedenciaMin)} onChange={(e) => setForm({ ...form, antecedenciaMin: Number(e.target.value) })}>
                {ANTECEDENCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select></div>
            <div className="space-y-1"><Label>Observação</Label>
              <textarea className="w-full min-h-[70px] rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
                value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Levar documentos, pauta…" /></div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : form.id ? "Salvar alterações" : "Salvar compromisso"}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setForm(vazio())}>Cancelar</Button>}
            </div>
          </form>
          <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-2">
            {perm === "default" && (
              <Button type="button" size="sm" variant="outline" className="gap-2"
                onClick={() => void Notification.requestPermission().then(setPerm)}><Bell className="w-4 h-4" /> Ativar avisos do navegador</Button>
            )}
            {perm === "granted" && <p>Avisos do navegador ativados neste computador.</p>}
            {perm === "denied" && <p>Avisos do navegador bloqueados nas configurações. Os avisos na tela do sistema continuam.</p>}
            <p>O aviso aparece com o sistema aberto (em qualquer tela), com som. “Lembrar em 10 min” adia o aviso.</p>
            <p><b>Para o celular avisar mesmo com o sistema fechado:</b> toque em “Adicionar no iPhone” ou “Adicionar no Google Agenda” no compromisso. Se mudar o horário aqui, toque de novo.</p>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-lg">Próximos compromissos</h2>
          {lista == null ? <p className="text-sm text-muted-foreground">Carregando…</p>
            : grupos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum compromisso marcado.</p>
            : grupos.map(([d, cs]) => (
              <div key={d} className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">{diaLabel(d)}</p>
                {cs.map((c) => <Linha key={c.id} c={c} />)}
              </div>
            ))}
          {passados.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setVerPassados((v) => !v)}>
                {verPassados ? "Esconder" : "Ver"} concluídos e passados ({passados.length})
              </button>
              {verPassados && passados.map((c) => <Linha key={c.id} c={c} passado />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// DeclaracaoModal — emite Declaração de Comparecimento ou de Acompanhamento
// Terapêutico em PDF (janela de impressão) a partir do card da Recepção.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Printer, X, Loader2 } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getPatient,
  listAppointments,
  listProfessionals,
  type Patient,
} from "@/lib/arco-rpc";
import { isTransportSpecialty } from "@/lib/specialty-colors";

const MotionCard = motion(Card);

export type DeclaracaoTarget = {
  patientId: number;
  patientName: string;
  prontuario: string | null;
  date?: string;
  time?: string;
};

type Tipo = "comparecimento" | "acompanhamento";
type Periodo = "matutino" | "vespertino" | "noturno" | "personalizado";

const WEEKDAYS = [
  { key: 1, label: "Segunda-feira", short: "Seg" },
  { key: 2, label: "Terça-feira", short: "Ter" },
  { key: 3, label: "Quarta-feira", short: "Qua" },
  { key: 4, label: "Quinta-feira", short: "Qui" },
  { key: 5, label: "Sexta-feira", short: "Sex" },
  { key: 6, label: "Sábado", short: "Sáb" },
];

const PERIODOS: { key: Periodo; label: string; texto: string }[] = [
  { key: "matutino", label: "Matutino", texto: "matutino" },
  { key: "vespertino", label: "Vespertino", texto: "vespertino" },
  { key: "noturno", label: "Noturno", texto: "noturno" },
  { key: "personalizado", label: "Horário personalizado", texto: "" },
];

const LS_ATENDENTE = "nfs.declaracao.atendente";
const LS_CARGO = "nfs.declaracao.cargo";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function listaPt(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function formatCpf(cpf: string | null | undefined): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return (cpf ?? "").trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function dataExtenso(iso: string): string {
  try {
    return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function abrirPdf(opts: { titulo: string; corpo: string; dataIso: string; atendente: string; cargo: string }) {
  const { titulo, corpo, dataIso, atendente, cargo } = opts;
  const logo = `${window.location.origin}/nfs-logo.png`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  @page{size:A4 portrait;margin:20mm;}
  *{box-sizing:border-box;}
  body{font-family:'Times New Roman',Georgia,serif;color:#111;margin:0;padding:24px;background:#fff;}
  .page{max-width:720px;margin:0 auto;}
  .head{display:flex;align-items:center;gap:18px;border-bottom:3px double #0e7490;padding-bottom:14px;margin-bottom:40px;}
  .head img{width:88px;height:88px;object-fit:contain;}
  .head .id{flex:1;text-align:center;line-height:1.35;}
  .head .id .l1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#334155;}
  .head .id .l2{font-size:17px;font-weight:700;color:#0e7490;margin-top:2px;}
  .head .id .l3{font-size:12px;color:#475569;}
  .head .sus{font-size:11px;font-weight:700;color:#1d4ed8;border:2px solid #1d4ed8;border-radius:6px;padding:4px 8px;text-align:center;line-height:1.1;}
  h1{text-align:center;font-size:20px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 42px;}
  .corpo{font-size:16px;line-height:2;text-align:justify;text-indent:3em;}
  .fim{font-size:15px;line-height:2;text-indent:3em;margin-top:10px;text-align:justify;}
  .data{text-align:right;font-size:15px;margin-top:48px;}
  .ass{margin:80px auto 0;width:340px;text-align:center;font-size:14px;line-height:1.5;}
  .ass .linha{border-top:1px solid #111;margin-bottom:6px;}
  .ass .nome{font-weight:700;}
  .foot{margin-top:70px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:10px;color:#64748b;text-align:center;line-height:1.4;}
  .no-print{display:flex;gap:10px;margin-bottom:18px;}
  .no-print button{padding:8px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-family:system-ui,sans-serif;}
  .no-print button.p{background:#0891b2;color:#fff;border-color:#0891b2;}
  @media print{.no-print{display:none!important;}body{padding:0;}}
</style></head><body>
<div class="no-print">
  <button onclick="window.close()">← Voltar</button>
  <button class="p" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
</div>
<div class="page">
  <div class="head">
    <img src="${logo}" alt="Logo" onerror="this.style.display='none'">
    <div class="id">
      <div class="l1">Prefeitura Municipal de Ibiúna · Secretaria Municipal de Saúde</div>
      <div class="l2">Núcleo Integrado Novo Arco-Íris</div>
      <div class="l3">Núcleo de Fisioterapia e Saúde — Atendimento Multiprofissional · Ibiúna - SP</div>
    </div>
    <div class="sus">SUS<br><span style="font-weight:400;font-size:9px">Sistema Único<br>de Saúde</span></div>
  </div>
  <h1>${esc(titulo)}</h1>
  <p class="corpo">${esc(corpo)}</p>
  <p class="fim">Por ser expressão da verdade, firmo a presente declaração para que produza os devidos efeitos legais.</p>
  <div class="data">Ibiúna - SP, ${esc(dataExtenso(dataIso))}.</div>
  <div class="ass">
    <div class="linha"></div>
    <div class="nome">${esc(atendente || "________________________________")}</div>
    <div>${esc(cargo || "")}</div>
    <div style="font-size:12px;color:#475569">Núcleo Integrado Novo Arco-Íris</div>
  </div>
  <div class="foot">Documento emitido pelo NFS Gestão Terapêutica em ${esc(format(new Date(), "dd/MM/yyyy 'às' HH:mm"))}.</div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function DeclaracaoModal({ target, onClose }: { target: DeclaracaoTarget; onClose: () => void }) {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [tipo, setTipo] = useState<Tipo>("comparecimento");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  const [cpf, setCpf] = useState("");
  const [data, setData] = useState(target.date ?? hoje);
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const h = parseInt((target.time ?? "").slice(0, 2), 10);
    if (Number.isNaN(h)) return "matutino";
    return h < 12 ? "matutino" : h < 18 ? "vespertino" : "noturno";
  });
  const [de, setDe] = useState(target.time ?? "");
  const [ate, setAte] = useState("");
  const [acompNome, setAcompNome] = useState("");
  const [acompCpf, setAcompCpf] = useState("");

  const [dias, setDias] = useState<Set<number>>(new Set());
  const [horaIni, setHoraIni] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [especialidades, setEspecialidades] = useState("");

  const [atendente, setAtendente] = useState(() => localStorage.getItem(LS_ATENDENTE) ?? "");
  const [cargo, setCargo] = useState(() => localStorage.getItem(LS_CARGO) ?? "Recepção");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, apts, profs] = await Promise.all([
          getPatient(target.patientId),
          listAppointments({ patientId: target.patientId, dateFrom: hoje, dateTo: format(addDays(new Date(), 34), "yyyy-MM-dd") }),
          listProfessionals(),
        ]);
        if (!alive) return;
        setPatient(p);
        setCpf(formatCpf(p?.cpf));
        if (p?.guardianName) setAcompNome(p.guardianName);

        const specByProf = new Map(profs.map((x) => [x.id, x.specialty ?? ""]));
        const ativos = apts.filter((a) => {
          const st = (a.status ?? "").toLowerCase();
          return !["cancelado", "desmarcado", "remarcado"].includes(st) && !isTransportSpecialty(specByProf.get(a.professionalId));
        });
        const ds = new Set<number>();
        const times: string[] = [];
        const specs = new Set<string>();
        for (const a of ativos) {
          ds.add(parseISO(a.date).getDay());
          times.push(a.time);
          const s = specByProf.get(a.professionalId);
          if (s) specs.add(s);
        }
        if (ds.size) setDias(ds);
        if (times.length) {
          times.sort();
          setHoraIni(times[0]);
          setHoraFim(times[times.length - 1]);
        }
        setEspecialidades(Array.from(specs).join(", "));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [target.patientId, hoje]);

  const prontuario = patient?.prontuario ?? target.prontuario;
  const nome = patient?.name ?? target.patientName;
  const identificacao = `${cpf ? `CPF ${cpf}` : ""}${cpf && prontuario ? ", " : ""}${prontuario ? `prontuário nº ${prontuario}` : ""}`;

  const textoPeriodo = useMemo(() => {
    if (periodo !== "personalizado") return `período ${PERIODOS.find((p) => p.key === periodo)!.texto}`;
    if (de && ate) return `horário das ${de} às ${ate}`;
    if (de) return `horário das ${de}`;
    return "período ______";
  }, [periodo, de, ate]);

  const corpo = useMemo(() => {
    if (tipo === "comparecimento") {
      const acomp = acompNome.trim()
        ? `, acompanhado(a) por ${acompNome.trim()}${acompCpf.trim() ? `, CPF ${formatCpf(acompCpf)}` : ""}`
        : "";
      return `Declaro que ${nome}, ${identificacao || "CPF ______"}, esteve presente no Núcleo Integrado Novo Arco-Íris no dia ${format(parseISO(data), "dd/MM/yyyy")} no ${textoPeriodo}${acomp}.`;
    }
    const diasTxt = listaPt(WEEKDAYS.filter((w) => dias.has(w.key)).map((w) => w.label.toLowerCase())) || "______";
    const horas = horaIni && horaFim && horaIni !== horaFim ? `das ${horaIni} às ${horaFim}` : horaIni ? `às ${horaIni}` : "das ______ às ______";
    return `Declaro, para os devidos fins, que ${nome}, ${identificacao || "CPF ______"}, encontra-se em acompanhamento multiprofissional contínuo nesta unidade de saúde no(s) dia(s) ${diasTxt}, ${horas}, na(s) especialidade(s) ${especialidades.trim() || "______"}.`;
  }, [tipo, nome, identificacao, data, textoPeriodo, acompNome, acompCpf, dias, horaIni, horaFim, especialidades]);

  const gerar = () => {
    localStorage.setItem(LS_ATENDENTE, atendente);
    localStorage.setItem(LS_CARGO, cargo);
    abrirPdf({
      titulo: tipo === "comparecimento" ? "Declaração de Comparecimento" : "Declaração de Acompanhamento Terapêutico",
      corpo,
      dataIso: tipo === "comparecimento" ? data : hoje,
      atendente,
      cargo,
    });
  };

  const toggleDia = (k: number) =>
    setDias((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <MotionCard
        className="w-full max-w-2xl p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto"
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(8,145,178,0.15)", color: "#0891b2" }}>
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">Emitir Declaração</h2>
            <p className="text-sm text-muted-foreground truncate">
              {nome}{prontuario ? ` — Pront. ${prontuario}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-2">
          {([
            ["comparecimento", "Comparecimento / Horas"],
            ["acompanhamento", "Acompanhamento Terapêutico"],
          ] as [Tipo, string][]).map(([k, label]) => (
            <button
              key={k}
              className={cn(
                "flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors border",
                tipo === k ? "bg-cyan-500/10 border-cyan-400 text-cyan-400" : "border-border/40 text-muted-foreground hover:border-border",
              )}
              onClick={() => setTipo(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">CPF do paciente</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder={loading ? "Carregando…" : "000.000.000-00"} />
          </div>
          <div>
            <Label className="text-xs">Prontuário</Label>
            <Input value={prontuario ?? ""} readOnly className="opacity-70" />
          </div>
        </div>

        {tipo === "comparecimento" ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="max-w-[200px]" />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Período</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PERIODOS.map((p) => (
                  <label key={p.key} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer",
                    periodo === p.key ? "border-cyan-400 bg-cyan-500/10" : "border-border/40 hover:border-border",
                  )}>
                    <input type="radio" name="periodo" checked={periodo === p.key} onChange={() => setPeriodo(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
              {periodo === "personalizado" && (
                <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
                  <div><Label className="text-xs">De</Label><Input type="time" value={de} onChange={(e) => setDe(e.target.value)} /></div>
                  <div><Label className="text-xs">Até</Label><Input type="time" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Acompanhante (opcional)</Label>
                <Input value={acompNome} onChange={(e) => setAcompNome(e.target.value)} placeholder="Nome do acompanhante" />
              </div>
              <div>
                <Label className="text-xs">CPF do acompanhante</Label>
                <Input value={acompCpf} onChange={(e) => setAcompCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-2 block">Dias da semana {loading ? "(carregando agenda…)" : "(pré-preenchido pela agenda)"}</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleDia(w.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-semibold",
                      dias.has(w.key) ? "bg-cyan-500/10 border-cyan-400 text-cyan-400" : "border-border/40 text-muted-foreground hover:border-border",
                    )}
                  >
                    {w.short}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <div><Label className="text-xs">Horário início</Label><Input type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} /></div>
              <div><Label className="text-xs">Horário fim</Label><Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} /></div>
            </div>
            <div>
              <Label className="text-xs">Especialidades</Label>
              <Input value={especialidades} onChange={(e) => setEspecialidades(e.target.value)} placeholder="Ex.: Terapia Ocupacional, Psicologia" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-4">
          <div>
            <Label className="text-xs">Atendente / profissional</Label>
            <Input value={atendente} onChange={(e) => setAtendente(e.target.value)} placeholder="Nome de quem assina" />
          </div>
          <div>
            <Label className="text-xs">Cargo</Label>
            <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Recepção" />
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">Prévia: </span>{corpo}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={gerar} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Gerar PDF
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}

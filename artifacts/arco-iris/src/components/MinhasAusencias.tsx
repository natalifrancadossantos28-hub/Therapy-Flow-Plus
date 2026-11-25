import { useCallback, useEffect, useRef, useState } from "react";
import { Plane, Pencil, Trash2, Loader2, Lock } from "lucide-react";
import { glass, neon } from "@/components/AgendaNeon";
import { useToast } from "@/hooks/use-toast";
import { listMinhasAusencias, salvarMinhaAusencia, cancelarMinhaAusencia, verifyProfessionalPin, type Ausencia } from "@/lib/arco-rpc";

const MOTIVOS = ["Férias", "Folga", "Falta", "Atestado", "Outro"] as const;
const chavePin = (id: number) => `nfs_prof_pin_${id}`;
/** Guarda o PIN verificado nesta aba, para as RPCs de "Minhas Ausências". */
export const lembrarPinProfissional = (id: number, pin: string) => sessionStorage.setItem(chavePin(id), pin);

const fmt = (d: string) => d.split("-").reverse().join("/");
const campo = "w-full rounded-2xl border border-violet-200 bg-white px-3 py-2.5 text-lg text-[#1e1b4b] focus:outline-none focus:ring-2 focus:ring-violet-400";

function separar(texto: string): { tipo: (typeof MOTIVOS)[number]; detalhe: string } {
  const t = MOTIVOS.find(m => texto === m || texto.startsWith(`${m} — `));
  if (!t) return { tipo: "Outro", detalhe: texto };
  return { tipo: t, detalhe: texto.slice(t.length).replace(/^ — /, "") };
}

/** Ausências do próprio profissional: grava em "Feriados & Ausências" e bloqueia a agenda dele. */
export type AusenciaVoz = { motivo: string | null; inicio: string | null; fim: string | null; observacao: string | null; chave?: number };

export function MinhasAusencias({ professionalId, voz }: { professionalId: number; voz?: AusenciaVoz | null }) {
  const { toast } = useToast();
  const [pin, setPin] = useState(() => sessionStorage.getItem(chavePin(professionalId)) ?? "");
  const [pinOk, setPinOk] = useState(!!sessionStorage.getItem(chavePin(professionalId)));
  const [pinDigitado, setPinDigitado] = useState("");
  const [lista, setLista] = useState<Ausencia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [tipo, setTipo] = useState<(typeof MOTIVOS)[number]>("Férias");
  const [detalhe, setDetalhe] = useState("");

  const iniAtual = ini, fimAtual = fim, tipoAtual = tipo, detalheAtual = detalhe;
  const erro = (e: any) => toast({ title: "Não foi possível", description: e?.message ?? String(e), variant: "destructive" });

  const carregar = useCallback(() => {
    if (!pinOk) return;
    setCarregando(true);
    listMinhasAusencias(professionalId, pin)
      .then(setLista)
      .catch((e) => { if (String(e?.message).includes("PIN")) { setPinOk(false); sessionStorage.removeItem(chavePin(professionalId)); } else erro(e); })
      .finally(() => setCarregando(false));
  }, [professionalId, pin, pinOk]);

  useEffect(() => { carregar(); }, [carregar]);

  const confirmarPin = async () => {
    try {
      const ok = await verifyProfessionalPin(professionalId, pinDigitado);
      if (!ok) { toast({ title: "PIN incorreto", variant: "destructive" }); return; }
      lembrarPinProfissional(professionalId, pinDigitado);
      setPin(pinDigitado); setPinOk(true); setPinDigitado("");
    } catch (e) { erro(e); }
  };

  const limpar = () => { setEditId(null); setIni(""); setFim(""); setTipo("Férias"); setDetalhe(""); };

  const salvar = async (v?: { ini: string; fim: string; tipo: (typeof MOTIVOS)[number]; detalhe: string }) => {
    const { ini, fim, tipo, detalhe } = v ?? { ini: iniAtual, fim: fimAtual, tipo: tipoAtual, detalhe: detalheAtual };
    if (!ini) { toast({ title: "Escolha a data inicial", variant: "destructive" }); return; }
    if (fim && fim < ini) { toast({ title: "A data final não pode ser antes da inicial", variant: "destructive" }); return; }
    const motivo = detalhe.trim() ? `${tipo} — ${detalhe.trim()}` : tipo;
    setSalvando(true);
    try {
      await salvarMinhaAusencia(professionalId, pin, { id: editId ?? undefined, dataInicio: ini, dataFim: fim || ini, motivo });
      toast({ title: editId ? "Ausência atualizada" : "Ausência registrada", description: "A agenda desse período fica bloqueada." });
      limpar(); carregar();
      window.dispatchEvent(new Event("ausencias-mudaram"));
    } catch (e) { erro(e); } finally { setSalvando(false); }
  };

  // Pedido por voz (já confirmado na janela do microfone): preenche e registra; sem PIN, só preenche.
  const vozFeita = useRef<number | null>(null);
  useEffect(() => {
    if (!voz?.inicio || vozFeita.current === (voz.chave ?? 0)) return;
    vozFeita.current = voz.chave ?? 0;
    const v = { ini: voz.inicio, fim: voz.fim ?? "", tipo: (MOTIVOS.find(m => m === voz.motivo) ?? "Outro") as (typeof MOTIVOS)[number], detalhe: voz.observacao ?? "" };
    setEditId(null); setIni(v.ini); setFim(v.fim); setTipo(v.tipo); setDetalhe(v.detalhe);
    if (pinOk) void salvar(v);
    else toast({ title: "Digite seu PIN", description: "Depois toque em Registrar Ausência." });
  }, [voz?.chave, pinOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const editar = (a: Ausencia) => {
    const s = separar(a.motivo);
    setEditId(a.id); setIni(a.dataInicio); setFim(a.dataFim); setTipo(s.tipo); setDetalhe(s.detalhe);
  };

  const cancelar = async (a: Ausencia) => {
    if (!window.confirm(`Cancelar a ausência de ${fmt(a.dataInicio)}${a.dataFim !== a.dataInicio ? ` a ${fmt(a.dataFim)}` : ""}?`)) return;
    try {
      await cancelarMinhaAusencia(professionalId, pin, a.id);
      if (editId === a.id) limpar();
      carregar();
      window.dispatchEvent(new Event("ausencias-mudaram"));
    } catch (e) { erro(e); }
  };

  return (
    <div className="agenda-neon space-y-4">
      <div className={`${glass} space-y-4`} style={neon("#a855f7")}>
        <p className="flex items-center gap-2 text-xl font-bold text-[#1e1b4b]"><Plane className="text-violet-600" /> Minhas Ausências</p>
        {!pinOk ? (
          <div className="space-y-3">
            <p className="text-base text-[#3b3561] flex items-center gap-2"><Lock size={18} /> Digite seu PIN para ver e registrar suas ausências.</p>
            <div className="flex gap-2">
              <input type="password" inputMode="numeric" maxLength={4} value={pinDigitado} onChange={e => setPinDigitado(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && pinDigitado.length === 4 && confirmarPin()} className={campo} placeholder="PIN (4 dígitos)" aria-label="PIN" />
              <button type="button" disabled={pinDigitado.length !== 4} onClick={confirmarPin}
                className="rounded-2xl px-5 text-lg font-semibold text-white bg-gradient-to-br from-violet-500 to-violet-700 disabled:opacity-50">Entrar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-base font-semibold text-[#1e1b4b]">Data inicial</span>
                <input type="date" value={ini} onChange={e => setIni(e.target.value)} className={campo} /></label>
              <label className="block"><span className="text-base font-semibold text-[#1e1b4b]">Data final</span>
                <input type="date" value={fim} min={ini || undefined} onChange={e => setFim(e.target.value)} className={campo} /></label>
            </div>
            <div>
              <span className="text-base font-semibold text-[#1e1b4b]">Motivo</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {MOTIVOS.map(m => (
                  <button key={m} type="button" onClick={() => setTipo(m)} aria-pressed={tipo === m}
                    className={`rounded-2xl border px-4 py-2 text-base font-semibold ${tipo === m ? "border-violet-600 text-white bg-gradient-to-br from-violet-500 to-violet-700" : "border-violet-200 bg-white text-[#1e1b4b]"}`}>{m}</button>
                ))}
              </div>
            </div>
            <input value={detalhe} onChange={e => setDetalhe(e.target.value)} className={campo}
              placeholder={tipo === "Outro" ? "Escreva o motivo" : "Observação (opcional)"} aria-label="Observação" />
            <p className="text-sm text-[#3b3561]">Deixe a data final vazia para um dia só. Nesse período a sua agenda fica bloqueada para novos agendamentos.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => salvar()} disabled={salvando}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-lg font-bold text-white bg-gradient-to-br from-violet-500 to-violet-700 shadow-[0_10px_24px_-8px_rgba(109,40,217,.7)] disabled:opacity-60">
                {salvando && <Loader2 className="animate-spin" size={20} />} {editId ? "Salvar alteração" : "Registrar Ausência"}
              </button>
              {editId && <button type="button" onClick={limpar} className="rounded-2xl border border-violet-200 bg-white px-4 text-base font-semibold text-[#1e1b4b]">Cancelar edição</button>}
            </div>
          </>
        )}
      </div>

      {pinOk && (
        <div className={`${glass} space-y-2`} style={neon("#38bdf8")}>
          <p className="text-lg font-bold text-[#1e1b4b]">Ausências registradas</p>
          {carregando ? <p className="text-base text-[#3b3561]">Carregando…</p> : lista.length === 0 ? (
            <p className="text-base text-[#3b3561]">Nenhuma ausência registrada.</p>
          ) : (
            <ul className="divide-y divide-violet-100">
              {lista.map(a => (
                <li key={a.id} className="flex items-center gap-2 py-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-lg font-semibold text-[#1e1b4b]">{fmt(a.dataInicio)}{a.dataFim !== a.dataInicio && ` a ${fmt(a.dataFim)}`}</span>
                    {a.motivo && <span className="block text-base text-[#3b3561] break-words">{a.motivo}</span>}
                  </span>
                  <button type="button" onClick={() => editar(a)} aria-label="Editar" className="p-2 rounded-xl text-violet-700 hover:bg-violet-50"><Pencil size={20} /></button>
                  <button type="button" onClick={() => cancelar(a)} aria-label="Cancelar ausência" className="p-2 rounded-xl text-rose-600 hover:bg-rose-50"><Trash2 size={20} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

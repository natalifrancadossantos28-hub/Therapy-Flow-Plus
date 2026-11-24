import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mic, X, Check, RotateCcw } from "lucide-react";
import { interpretarComandoClinico, NOME_ACAO, type ComandoClinico, type PacienteVoz } from "@/lib/agenda-clinica-voz";

type Reconhecedor = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

function bipe() {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.15); o.onended = () => ctx.close();
  } catch { /* sem som */ }
}

export type ListaDia = { time: string; nome: string; status: string }[];

/** Janela do microfone da agenda clínica: ouve, mostra o que entendeu e só age depois de confirmar. */
export function VozClinica({ pacientes, listarDia, onConfirmar, onFechar }: {
  pacientes: PacienteVoz[];
  listarDia: (data: string) => ListaDia;
  onConfirmar: (cmd: ComandoClinico) => void;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState("");
  const [cmd, setCmd] = useState<ComandoClinico | null>(null);
  const rec = useRef<Reconhecedor | null>(null);
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;

  const entender = (t: string) => { if (t.trim()) setCmd(interpretarComandoClinico(t, pacientes)); };

  const ouvir = () => {
    setErro(""); setCmd(null);
    if (!Rec) { setErro("Este aparelho não reconhece voz aqui. Escreva ou use o microfone do teclado."); return; }
    try {
      const r = new Rec(); rec.current = r;
      r.lang = "pt-BR"; r.interimResults = true; r.continuous = false;
      let final = "";
      r.onresult = (e) => {
        let parcial = ""; final = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) final += res[0].transcript; else parcial += res[0].transcript;
        }
        setTexto((final || parcial).trim());
      };
      r.onerror = (e) => { setErro(e.error === "not-allowed" ? "O microfone está bloqueado. Libere o microfone nas configurações." : "Não consegui ouvir. Tente de novo ou escreva."); };
      r.onend = () => { setOuvindo(false); if (final.trim()) entender(final); };
      bipe(); r.start(); setOuvindo(true);
    } catch { setOuvindo(false); setErro("Não consegui abrir o microfone. Escreva o comando."); }
  };

  useEffect(() => { ouvir(); return () => rec.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dataTxt = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "EEEE, dd/MM", { locale: ptBR }) : null;
  const precisaPaciente = cmd && cmd.acao && cmd.acao !== "consultar" && cmd.acao !== "agendar";
  const pode = !!cmd?.acao && (!precisaPaciente || !!cmd.paciente);
  const lista = cmd?.acao === "consultar" ? listarDia(cmd.data ?? format(new Date(), "yyyy-MM-dd")) : null;

  return (
    <div className="agenda-neon fixed inset-0 overflow-y-auto z-[60] flex items-end-safe sm:items-center-safe justify-center p-3 bg-black/40 backdrop-blur-sm" role="dialog" aria-label="Comando de voz">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-[#1e1b4b]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={ouvindo ? () => rec.current?.stop() : ouvir} aria-label={ouvindo ? "Parar de ouvir" : "Falar"}
            className={`grid place-items-center w-16 h-16 rounded-full text-white bg-gradient-to-br from-violet-500 to-violet-700 shrink-0 ${ouvindo ? "animate-pulse neon-mic" : "neon-brilho"}`}>
            <Mic size={30} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-extrabold">{ouvindo ? "Pode falar…" : "Comando de voz"}</p>
            <p className="text-sm text-[#3b3561]">Ex.: “falta justificada do João hoje”, “remarcar a Maria pra sexta às 9h”, “quais pacientes eu tenho hoje?”</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid place-items-center w-10 h-10 rounded-full bg-violet-50 text-violet-800 shrink-0"><X size={20} /></button>
        </div>

        <div className="flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entender(texto)}
            placeholder="Ou escreva aqui o comando" className="flex-1 min-w-0 rounded-2xl border border-violet-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <button type="button" onClick={() => entender(texto)} className="rounded-2xl bg-violet-100 text-violet-800 font-semibold px-4">Entender</button>
        </div>
        {erro && <p className="text-rose-600 font-medium">{erro}</p>}

        {cmd && (
          <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4 space-y-1.5 text-lg">
            {!cmd.acao ? (
              <p className="font-semibold text-rose-600">Não entendi o que fazer. Fale de novo, por exemplo: “presença do João”.</p>
            ) : (
              <>
                <p><span className="text-[#3b3561]">O que fazer:</span> <b>{NOME_ACAO[cmd.acao]}</b></p>
                {precisaPaciente && (
                  <p><span className="text-[#3b3561]">Paciente:</span> {cmd.paciente ? <b>{cmd.paciente.prontuario ? `[${cmd.paciente.prontuario}] ` : ""}{cmd.paciente.patientName}</b> : <b className="text-rose-600">não achei na agenda desta semana</b>}</p>
                )}
                {(cmd.data || cmd.hora) && cmd.acao !== "consultar" && (
                  <p><span className="text-[#3b3561]">{cmd.acao === "remanejar" || cmd.acao === "remarcar" ? "Novo dia/horário:" : "Dia/horário:"}</span> <b className="inline-block first-letter:uppercase">{[dataTxt(cmd.data), cmd.hora].filter(Boolean).join(" às ")}</b></p>
                )}
                {lista && (
                  <div className="pt-1">
                    <p className="font-bold first-letter:uppercase">{dataTxt(cmd.data ?? format(new Date(), "yyyy-MM-dd"))}: {lista.length} atendimento(s)</p>
                    <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">
                      {lista.map((l, i) => <li key={i} className="flex gap-2"><b className="tabular-nums text-violet-700">{l.time}</b> <span className="flex-1">{l.nome}</span> <span className="text-sm text-[#3b3561]">{l.status}</span></li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={ouvir} className="flex-1 rounded-2xl border border-violet-200 py-3 font-semibold flex items-center justify-center gap-2"><RotateCcw size={18} /> Falar de novo</button>
          {cmd?.acao !== "consultar" && (
            <button type="button" disabled={!pode} onClick={() => cmd && onConfirmar(cmd)}
              className="flex-1 rounded-2xl py-3 font-bold text-white bg-gradient-to-br from-violet-500 to-violet-700 disabled:opacity-40 flex items-center justify-center gap-2"><Check size={20} /> Confirmar</button>
          )}
        </div>
      </div>
    </div>
  );
}

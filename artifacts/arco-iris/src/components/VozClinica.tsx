import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mic, X, Check, RotateCcw, ListX } from "lucide-react";
import {
  interpretarComandoClinico, proximaPergunta, responder, respostaSim, respostaNao, dataCurta,
  NOME_ACAO, DESTRUTIVA, MOVER, PRECISA_PACIENTE, EXEMPLOS,
  type ComandoClinico, type Contexto, type PacienteVoz,
} from "@/lib/agenda-clinica-voz";
import { registrarNaoEntendido, lerNaoEntendidos, normalizar } from "@/lib/voz-regras";

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
/** Atendimento que vai ser mexido (para mostrar "terça 24/11 às 10:30"). */
export type AlvoVoz = { date: string; time: string } | null;

const nomeCurto = (n: string) => n.trim();

function resumo(cmd: ComandoClinico, alvo: AlvoVoz): string {
  if (!cmd.acao) return "";
  const nome = cmd.paciente ? nomeCurto(cmd.paciente.patientName) : "";
  const quando = alvo ? `${dataCurta(alvo.date)} às ${alvo.time}` : cmd.data ? dataCurta(cmd.data) : "";
  const para = [cmd.novaData ? dataCurta(cmd.novaData) : null, cmd.novaHora ? `às ${cmd.novaHora}` : null].filter(Boolean).join(" ");
  const esc = cmd.escopo === "sempre" ? "todas as semanas daqui pra frente" : cmd.escopo === "dia" ? "só neste dia" : "";
  switch (cmd.acao) {
    case "ausencia": {
      const a = cmd.ausencia!;
      const fim = a.fim && a.fim !== a.inicio ? ` a ${dataCurta(a.fim)}` : "";
      return `Registrar ausência: ${a.motivo ?? "?"}, ${a.inicio ? dataCurta(a.inicio) : "?"}${fim}${a.observacao ? ` (obs.: ${a.observacao})` : ""}`;
    }
    case "navegar": return `Abrir: ${cmd.destino?.replace("_", " ")}`;
    case "imprimir": return `Imprimir agenda ${cmd.impressao === "semana" ? "da semana" : cmd.impressao === "mes" ? "do mês" : cmd.impressao === "rascunho" ? "em branco" : "do dia"}`;
    case "fonte_maior": case "fonte_menor": case "consultar": return NOME_ACAO[cmd.acao];
    case "agendar": return `Novo atendimento${para ? `: ${para}` : ""}`;
  }
  if (MOVER.has(cmd.acao) || cmd.acao === "trocar_horario") {
    return `${NOME_ACAO[cmd.acao]} ${nome}${quando ? `, de ${quando}` : ""}${para ? ` para ${para}` : ""}${esc ? ` — ${esc}` : ""}`;
  }
  return `${NOME_ACAO[cmd.acao]} ${nome}${quando ? `, ${quando}` : ""}`;
}

/** Janela do microfone da agenda: ouve, mostra o que entendeu, pergunta o que falta e só age depois de confirmar. */
export function VozClinica({ pacientes, listarDia, contexto, alvo, onConfirmar, onFechar, tela, professionalId, mostrarLog, exemplos }: {
  pacientes: PacienteVoz[];
  listarDia: (data: string) => ListaDia;
  contexto: Contexto;
  alvo?: (cmd: ComandoClinico) => AlvoVoz;
  onConfirmar: (cmd: ComandoClinico) => void;
  onFechar: () => void;
  tela: string;
  professionalId?: number | null;
  mostrarLog?: boolean;
  exemplos?: string[];
}) {
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState("");
  const [cmd, setCmd] = useState<ComandoClinico | null>(null);
  const [naoEntendi, setNaoEntendi] = useState(false);
  const [verLog, setVerLog] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const ex = exemplos ?? EXEMPLOS;

  const pergunta = useMemo(() => (cmd ? proximaPergunta(cmd, contexto) : null), [cmd, contexto]);
  const pronto = !!cmd?.acao && !pergunta;
  const alvoAtual = cmd && pronto ? alvo?.(cmd) ?? null : null;

  const confirmar = (c: ComandoClinico) => {
    if (c.acao === "obito" && c.confirmacoes < 1) { setCmd({ ...c, confirmacoes: 1 }); return; }
    onConfirmar(c);
  };

  const entender = (t: string) => {
    const frase = t.trim();
    if (!frase) return;
    setErro(""); setNaoEntendi(false);
    const curto = normalizar(frase).split(" ").length <= 3;
    if (cmd && pronto && curto && respostaSim(frase)) { confirmar(cmd); return; }
    if (cmd && curto && respostaNao(frase) && !/\bcancelar\s+\S/.test(normalizar(frase))) { setCmd(null); setTexto(""); return; }
    if (cmd && pergunta && pergunta.chave !== "bloqueio") {
      const novo = responder(cmd, pergunta, frase, pacientes, contexto);
      if (novo !== cmd) { setCmd(novo); return; }
    }
    const c = interpretarComandoClinico(frase, pacientes, { grade: contexto.grade, hoje: contexto.hoje });
    if (!c.acao && !c.opcoesAcao.length) {
      registrarNaoEntendido(frase, tela, professionalId);
      setNaoEntendi(true); setCmd(null); return;
    }
    setCmd(c);
  };

  const ouvir = () => {
    setErro("");
    if (!Rec) { setErro("Este aparelho não ouve voz direto aqui. Toque na caixa abaixo e use o microfone do teclado."); return; }
    try {
      rec.current?.abort();
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
      r.onerror = (e) => { if (e.error !== "aborted" && e.error !== "no-speech") setErro(e.error === "not-allowed" ? "O microfone está bloqueado. Libere o microfone nas configurações." : "Não consegui ouvir. Tente de novo ou escreva."); };
      r.onend = () => { setOuvindo(false); if (final.trim()) entenderRef.current(final); };
      bipe(); r.start(); setOuvindo(true);
    } catch { setOuvindo(false); setErro("Não consegui abrir o microfone. Escreva o comando."); }
  };
  // entender usa o estado atual: o reconhecedor chama a versão mais nova.
  const entenderRef = useRef(entender); entenderRef.current = entender;

  useEffect(() => { ouvir(); return () => rec.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dataTxt = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "EEEE, dd/MM", { locale: ptBR }) : null;
  const lista = cmd?.acao === "consultar" && pronto ? listarDia(cmd.data ?? format(new Date(), "yyyy-MM-dd")) : null;
  const destrutiva = !!cmd?.acao && DESTRUTIVA.has(cmd.acao);
  const log = verLog ? lerNaoEntendidos() : [];

  return (
    <div className="agenda-neon fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/40 backdrop-blur-sm" role="dialog" aria-label="Comando de voz">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-[#1e1b4b]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={ouvindo ? () => rec.current?.stop() : ouvir} aria-label={ouvindo ? "Parar de ouvir" : "Falar"}
            className={`grid place-items-center w-16 h-16 rounded-full text-white bg-gradient-to-br from-violet-500 to-violet-700 shrink-0 ${ouvindo ? "animate-pulse neon-mic" : "neon-brilho"}`}>
            <Mic size={30} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-extrabold">{ouvindo ? "Pode falar…" : pergunta ? "Responda" : "Comando de voz"}</p>
            <p className="text-sm text-[#3b3561]">{pergunta ? "Toque numa opção ou fale a resposta." : `Ex.: “${ex[0]}”, “${ex[1]}”`}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid place-items-center w-10 h-10 rounded-full bg-violet-50 text-violet-800 shrink-0"><X size={20} /></button>
        </div>

        <div className="flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entenderRef.current(texto)}
            placeholder="Ou escreva aqui o comando" className="flex-1 min-w-0 rounded-2xl border border-violet-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <button type="button" onClick={() => entender(texto)} className="rounded-2xl bg-violet-100 text-violet-800 font-semibold px-4">Entender</button>
        </div>
        {erro && <p className="text-rose-600 font-medium">{erro}</p>}

        {naoEntendi && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-1.5">
            <p className="font-bold text-rose-700 text-lg">Não entendi. Tente: “desmarcar [nome] hoje”</p>
            {ex.slice(0, 3).map((e) => (
              <button key={e} type="button" onClick={() => { setTexto(e); entender(e); }} className="block w-full text-left rounded-xl bg-white border border-rose-100 px-3 py-2 text-base">“{e}”</button>
            ))}
          </div>
        )}

        {cmd && (cmd.acao || cmd.opcoesAcao.length > 0) && (
          <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4 space-y-2 text-lg">
            {cmd.acao && (
              <p><span className="text-[#3b3561]">Entendi:</span> <b>{resumo(cmd, alvoAtual)}</b></p>
            )}
            {cmd.acao && PRECISA_PACIENTE.has(cmd.acao) && cmd.paciente?.prontuario && (
              <p className="text-base text-[#3b3561]">Prontuário {cmd.paciente.prontuario}</p>
            )}
            {pronto && cmd.mesAssumido && cmd.novaData && <p className="text-base text-amber-700">Confira o mês: entendi {dataCurta(cmd.novaData)}.</p>}
            {pergunta && (
              <div className="space-y-2 pt-1">
                <p className={`font-semibold ${pergunta.erro ? "text-rose-600" : "text-violet-800"}`}>{pergunta.texto}</p>
                {pergunta.opcoes.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {pergunta.opcoes.map((o) => (
                      <button key={o.rotulo} type="button" onClick={() => setCmd({ ...cmd, ...o.aplicar })}
                        className="text-left rounded-2xl border border-violet-200 bg-white px-3 py-2 hover:border-violet-600">
                        <span className="block font-bold first-letter:uppercase">{o.rotulo}</span>
                        {o.detalhe && <span className="block text-sm text-[#3b3561] leading-snug line-clamp-2">{o.detalhe}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {pronto && destrutiva && (
              <p className="font-semibold text-rose-700">
                {cmd.acao === "obito" && cmd.confirmacoes >= 1
                  ? "Atenção: o óbito tira o paciente de todas as agendas. Toque em Confirmar de novo para continuar."
                  : `Confirma ${NOME_ACAO[cmd.acao!].toLowerCase()} ${cmd.paciente?.patientName ?? ""}${alvoAtual ? `, ${dataCurta(alvoAtual.date)} às ${alvoAtual.time}` : ""}?`}
              </p>
            )}
            {lista && (
              <div className="pt-1">
                <p className="font-bold first-letter:uppercase">{dataTxt(cmd.data ?? format(new Date(), "yyyy-MM-dd"))}: {lista.length} atendimento(s)</p>
                <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">
                  {lista.map((l, i) => <li key={i} className="flex gap-2"><b className="tabular-nums text-violet-700">{l.time}</b> <span className="flex-1">{l.nome}</span> <span className="text-sm text-[#3b3561]">{l.status}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={ouvir} className="flex-1 rounded-2xl border border-violet-200 py-3 font-semibold flex items-center justify-center gap-2"><RotateCcw size={18} /> {pergunta ? "Responder falando" : "Falar de novo"}</button>
          {cmd && cmd.acao !== "consultar" && (
            <button type="button" onClick={() => { setCmd(null); setTexto(""); }} className="rounded-2xl border border-violet-200 px-4 py-3 font-semibold">Cancelar</button>
          )}
          {cmd?.acao !== "consultar" && (
            <button type="button" disabled={!pronto} onClick={() => cmd && confirmar(cmd)}
              className={`flex-1 rounded-2xl py-3 font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2 ${destrutiva ? "bg-gradient-to-br from-rose-500 to-rose-700" : "bg-gradient-to-br from-violet-500 to-violet-700"}`}><Check size={20} /> Confirmar</button>
          )}
        </div>

        {mostrarLog && (
          <div className="pt-1">
            <button type="button" onClick={() => setVerLog((v) => !v)} className="text-sm font-semibold text-violet-700 flex items-center gap-1.5"><ListX size={16} /> Comandos não entendidos neste aparelho</button>
            {verLog && (log.length === 0 ? <p className="text-sm text-[#3b3561] mt-1">Nenhum por enquanto.</p> : (
              <ul className="mt-1 max-h-40 overflow-y-auto text-sm space-y-0.5">
                {log.slice(0, 50).map((l, i) => <li key={i}><span className="text-[#3b3561]">{format(new Date(l.quando), "dd/MM HH:mm")}</span> · “{l.frase}”</li>)}
              </ul>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

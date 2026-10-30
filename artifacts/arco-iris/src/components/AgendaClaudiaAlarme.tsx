import { useCallback, useEffect, useRef, useState } from "react";
import { alarmesDevidos, tocarMelodia, pararMelodia, type AlarmeDevido, type CompromissoAlarme } from "@/lib/agenda-exec-alarmes";

export function AgendaClaudiaAlarme({ donaId, compromissos }: { donaId: number; compromissos: CompromissoAlarme[] }) {
  const pref=`nfs_agenda_som_${donaId}`, historico=`nfs_agenda_alarm_vistos_${donaId}`;
  const [ligado,setLigado]=useState(() => { try{return localStorage.getItem(pref)==="sim";}catch{return false;} });
  const [pronto,setPronto]=useState(false),[erro,setErro]=useState("");
  const [tocando,setTocando]=useState<AlarmeDevido[]>([]);
  const ctx=useRef<AudioContext|null>(null);
  const vistos=useRef<Set<string>>(new Set());
  useEffect(() => {
    try { const v=JSON.parse(localStorage.getItem(historico)||"[]"); vistos.current=new Set(Array.isArray(v)?v.filter(x=>typeof x==="string"):[]); }
    catch { vistos.current=new Set(); }
  },[historico]);
  const liberar=useCallback(async () => {
    const Audio=window.AudioContext ?? (window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if (!Audio) throw new Error("Este navegador não toca o lembrete. Use o Chrome ou Safari atualizado.");
    ctx.current ??= new Audio();
    await ctx.current.resume();
    if(ctx.current.state!=="running") throw new Error("Toque novamente para liberar o som neste aparelho.");
    setPronto(true);setErro("");return ctx.current;
  },[]);
  useEffect(() => {
    if(!ligado||pronto)return;
    const tocar=()=>{void liberar().catch(()=>{});};
    window.addEventListener("pointerdown",tocar,{once:true});
    return ()=>window.removeEventListener("pointerdown",tocar);
  },[ligado,pronto,liberar]);
  useEffect(()=>()=>{void ctx.current?.close();ctx.current=null;},[]);
  const testar=async()=>{
    try { const c=await liberar();if(!tocarMelodia(c))throw new Error("Não foi possível tocar. Tente novamente.");setLigado(true);try{localStorage.setItem(pref,"sim");}catch{/* preferência opcional */} }
    catch(e){setErro(e instanceof Error?e.message:"Não foi possível liberar o som.");}
  };
  const parar=useCallback(()=>{setTocando([]);if(ctx.current)pararMelodia(ctx.current);try{navigator.vibrate?.(0);}catch{/* opcional */}},[]);
  useEffect(()=>{
    if(!ligado||!pronto)return;
    const conferir=()=>{
      if(document.visibilityState!=="visible")return;
      const devidos=alarmesDevidos(compromissos,Date.now(),vistos.current);
      if(!devidos.length)return;
      for(const a of devidos)vistos.current.add(a.chave);
      try{localStorage.setItem(historico,JSON.stringify([...vistos.current].slice(-200)));}catch{/* sem duplicar nesta sessão */}
      setTocando(antes=>[...antes,...devidos]);
    };
    conferir();const id=window.setInterval(conferir,1000);
    document.addEventListener("visibilitychange",conferir);
    return ()=>{window.clearInterval(id);document.removeEventListener("visibilitychange",conferir);};
  },[ligado,pronto,compromissos,historico]);
  useEffect(()=>{
    if(!tocando.length||!ligado)return;
    const tocar=()=>{if(ctx.current&&!tocarMelodia(ctx.current)){setPronto(false);setErro("Toque em Testar som para liberar o áudio novamente.");}};
    tocar();const repetir=window.setInterval(tocar,12000);
    return ()=>{window.clearInterval(repetir);};
  },[tocando,ligado]);
  return <>
    <section className="rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-500/10 to-indigo-500/10 p-5 space-y-3">
      <h2 className="text-2xl font-black">⏰ Som e vibração da agenda</h2>
      <p className="text-lg text-white/80">Com a agenda aberta, o aviso fica na tela e a melodia repete até você tocar em Parar aviso · Já vi.</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={testar} className="rounded-2xl px-5 py-3 bg-amber-300 text-slate-950 font-extrabold text-lg">{ligado?"♪ Testar som":"♪ Ativar e testar som"}</button>
        {ligado&&<button onClick={()=>{parar();setLigado(false);try{localStorage.setItem(pref,"nao");}catch{/* opcional */}}} className="rounded-2xl px-5 py-3 border border-white/20 font-bold">Desligar som</button>}
      </div>
      <p role="status" className="font-semibold">{ligado?(pronto?"✅ Som liberado nesta sessão":"Toque em Testar som para liberar o áudio"):"Som ainda não ativado neste aparelho"}</p>
      {erro&&<p role="alert" className="text-amber-200">{erro}</p>}
      <p className="text-base text-white/65">Com o app fechado ou a tela bloqueada, ative os lembretes no celular abaixo. O som segue o volume e as permissões do aparelho.</p>
    </section>
    {tocando.length>0&&<div className="fixed inset-0 z-[80] bg-slate-950 flex items-center justify-center p-3 sm:p-6 overflow-y-auto" role="alertdialog" aria-modal="true" aria-labelledby="agenda-alarme-titulo" aria-describedby="agenda-alarme-eventos">
      <div className="w-full max-w-4xl rounded-3xl border-4 border-amber-300 bg-slate-900 text-white p-5 sm:p-10 shadow-2xl space-y-6 max-h-[95dvh] overflow-y-auto">
        <div className="text-7xl sm:text-8xl" aria-hidden="true">⏰</div><h2 id="agenda-alarme-titulo" className="text-4xl sm:text-6xl font-black leading-tight">{tocando.some(a=>a.naHora)?"Hora do compromisso!":"Lembrete da agenda!"}</h2>
        <div id="agenda-alarme-eventos" className="space-y-6">{tocando.map(a=><div key={a.chave} className="border-t border-white/15 pt-3"><p className="text-3xl sm:text-5xl font-extrabold leading-tight break-words">{a.naHora?"Agora: ":"Lembrete: "}{a.compromisso.titulo}</p><p className="text-3xl sm:text-4xl font-bold text-white mt-3 break-words">{a.compromisso.hora}{a.compromisso.local?` · ${a.compromisso.local}`:""}</p></div>)}</div>
        <button onClick={parar} autoFocus className="w-full rounded-2xl bg-amber-300 text-slate-950 text-3xl sm:text-4xl font-black px-4 py-6 min-h-24 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white">Parar aviso · Já vi</button>
      </div>
    </div>}
  </>;
}

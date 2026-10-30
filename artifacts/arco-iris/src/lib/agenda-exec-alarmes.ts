export type CompromissoAlarme = {
  id: number; titulo: string; data: string; hora: string | null;
  local: string | null; antecedenciaMin: number | null; concluido: boolean;
};
export type AlarmeDevido = { chave: string; compromisso: CompromissoAlarme; naHora: boolean };

/** Só alerta eventos devidos agora; não toca uma agenda inteira ao voltar de vários dias. */
export function alarmesDevidos(compromissos: CompromissoAlarme[], agora: number, vistos: ReadonlySet<string>): AlarmeDevido[] {
  const out: AlarmeDevido[] = [];
  for (const c of compromissos) {
    if (c.concluido || c.antecedenciaMin == null || !c.hora) continue;
    const inicio = Date.parse(`${c.data}T${c.hora}:00-03:00`);
    if (!Number.isFinite(inicio)) continue;
    const planos = [{ tipo: "hora", em: inicio, naHora: true },
      ...(c.antecedenciaMin > 0 ? [{ tipo: `antes-${c.antecedenciaMin}`, em: inicio-c.antecedenciaMin*60000, naHora: false }] : [])];
    for (const p of planos) {
      const chave = `${c.id}:${c.data}:${c.hora}:${p.tipo}`;
      if (!vistos.has(chave) && agora >= p.em && agora-p.em < 120000) out.push({ chave, compromisso: c, naHora: p.naHora });
    }
  }
  return out.sort((a,b) => Number(b.naHora)-Number(a.naHora) || a.chave.localeCompare(b.chave));
}

const osciladores = new WeakMap<AudioContext, Set<OscillatorNode>>();
export function pararMelodia(ctx: AudioContext) {
  for (const osc of osciladores.get(ctx) ?? []) { try { osc.stop(); osc.disconnect(); } catch { /* já encerrado */ } }
  osciladores.get(ctx)?.clear();
}

/** Melodia curta, gerada no aparelho. O navegador exige um toque para liberar áudio. */
export function tocarMelodia(ctx: AudioContext): boolean {
  if (ctx.state !== "running") return false;
  const ativos=osciladores.get(ctx)??new Set<OscillatorNode>();osciladores.set(ctx,ativos);
  [523.25,659.25,783.99,1046.5,783.99,659.25].forEach((freq,i) => {
    const osc=ctx.createOscillator(), ganho=ctx.createGain();
    const t=ctx.currentTime+i*.22;
    ativos.add(osc);osc.onended=()=>{ativos.delete(osc);osc.disconnect();ganho.disconnect();};
    osc.type="sine"; osc.frequency.value=freq;
    ganho.gain.setValueAtTime(0,t);
    ganho.gain.linearRampToValueAtTime(.16,t+.025);
    ganho.gain.exponentialRampToValueAtTime(.001,t+.19);
    osc.connect(ganho);ganho.connect(ctx.destination);
    osc.start(t);osc.stop(t+.21);
  });
  try { navigator.vibrate?.([250,100,250,100,500]); } catch { /* opcional no aparelho */ }
  return true;
}

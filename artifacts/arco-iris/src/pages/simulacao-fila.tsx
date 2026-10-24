import { useEffect, useMemo, useState } from "react";
import { Card, Button, Input } from "@/components/ui-custom";
import { listWaitingList, type WaitingListEntry } from "@/lib/arco-rpc";
import {
  listTriagens86Resumo, listFilaRegras, saveFilaRegras, PESOS_NEUTROS,
  type PesosFila, type Triagem86Resumo, type FilaRegras,
} from "@/lib/triagem-86-rpc";

// Compara a ordem ATUAL (vinda do servidor) com uma proposta usando pesos
// configuráveis. Nada aqui muda a fila real: ativar exige nova aprovação.

type Linha = { e: WaitingListEntry; atual: number; proposta: number; extra: number };

function simular(lista: WaitingListEntry[], resumo: Record<string, Triagem86Resumo>, p: PesosFila): Record<string, Linha[]> {
  const porEsp: Record<string, WaitingListEntry[]> = {};
  for (const e of lista) (porEsp[e.specialty ?? "—"] ??= []).push(e);
  const out: Record<string, Linha[]> = {};
  for (const [esp, itens] of Object.entries(porEsp)) {
    const pe = p.porEspecialidade[esp] ?? {};
    const wPr = pe.porSinalPrioridade ?? p.porSinalPrioridade;
    const wSo = pe.porSinalSocial ?? p.porSinalSocial;
    const linhas = itens.map((e, i) => {
      const r = resumo[String(e.patientId)];
      const meses = Math.min(Math.floor((e.waitDays ?? 0) / 30), p.limiteMesesEspera);
      const extra = wPr * (r?.prioridades.length ?? 0) + wSo * (r?.social.length ?? 0) + p.porMesEspera * meses;
      return { e, atual: i + 1, proposta: 0, extra };
    });
    // Mantém as categorias de hoje (Prioridade Máxima, demanda por CID) na
    // frente; dentro de cada categoria a proposta soma os pesos à pontuação.
    const cat = (e: WaitingListEntry) => (e.prioridadeMaxima ? 0 : e.demandaPrioritaria ? 1 : 2);
    const base = (l: Linha) => (l.e.ordenacao === "chegada" ? 0 : (l.e.scoreEspecialidade ?? 0));
    const ord = [...linhas].sort((a, b) => cat(a.e) - cat(b.e) || (base(b) + b.extra) - (base(a) + a.extra) || a.atual - b.atual);
    ord.forEach((l, i) => { l.proposta = i + 1; });
    out[esp] = linhas;
  }
  return out;
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));

export default function SimulacaoFila() {
  const [lista, setLista] = useState<WaitingListEntry[]>([]);
  const [resumo, setResumo] = useState<Record<string, Triagem86Resumo>>({});
  const [regras, setRegras] = useState<FilaRegras[]>([]);
  const [pesos, setPesos] = useState<PesosFila>(PESOS_NEUTROS);
  const [esp, setEsp] = useState<string>("");
  const [senha, setSenha] = useState("");
  const [resp, setResp] = useState("");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listWaitingList().then(setLista).catch(() => setLista([]));
    listTriagens86Resumo().then(setResumo).catch(() => {});
    listFilaRegras().then((r) => { setRegras(r); if (r[0]) setPesos({ ...PESOS_NEUTROS, ...r[0].pesos }); }).catch(() => {});
  }, []);

  const sim = useMemo(() => simular(lista, resumo, pesos), [lista, resumo, pesos]);
  const esps = Object.keys(sim).sort();
  const sel = esp || esps[0] || "";
  const linhas = [...(sim[sel] ?? [])].sort((a, b) => a.proposta - b.proposta);
  const mudam = linhas.filter((l) => l.atual !== l.proposta).length;

  const salvar = async (status: "rascunho" | "validada") => {
    setMsg(null);
    try {
      const r = await saveFilaRegras({ senha, pesos, status, responsavel: resp, observacoes: obs });
      setRegras((p) => [r, ...p]); setSenha("");
      setMsg(status === "validada" ? "Pesos registrados como validados. A fila real continua igual até a ativação ser autorizada." : "Rascunho salvo.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro ao salvar"); }
  };

  const campo = (label: string, k: "porSinalPrioridade" | "porSinalSocial" | "porMesEspera" | "limiteMesesEspera") => (
    <label className="text-xs space-y-1">
      <span className="block font-semibold">{label}</span>
      <Input type="number" min={0} value={pesos[k]} onChange={(e) => setPesos((p) => ({ ...p, [k]: num(e.target.value) }))} />
    </label>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold font-display">Simulação da fila</h1>
        <p className="text-sm text-muted-foreground">Compare a ordem atual com uma proposta. <b>A fila real não muda</b>: os pesos precisam de validação institucional e de autorização para ativar.</p>
      </div>
      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold">Pesos da proposta (todos em zero = ordem de hoje)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {campo("Pontos por sinal de prioridade (PR)", "porSinalPrioridade")}
          {campo("Pontos por barreira social (S03–S06)", "porSinalSocial")}
          {campo("Pontos por mês de espera", "porMesEspera")}
          {campo("Limite de meses contados", "limiteMesesEspera")}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <Input className="max-w-[200px]" placeholder="Responsável" value={resp} onChange={(e) => setResp(e.target.value)} />
          <Input className="max-w-[260px]" placeholder="Observações / ata da validação" value={obs} onChange={(e) => setObs(e.target.value)} />
          <Input className="max-w-[200px]" type="password" placeholder="Senha de administrador" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Button variant="outline" onClick={() => salvar("rascunho")} disabled={!senha}>Salvar rascunho</Button>
          <Button onClick={() => salvar("validada")} disabled={!senha || !resp}>Registrar como validado</Button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
        {regras.length > 0 && <p className="text-[11px] text-muted-foreground">Última versão: {regras[0].status === "validada" ? "validada" : "rascunho"} em {new Date(regras[0].createdAt).toLocaleString("pt-BR")}{regras[0].responsavel ? ` por ${regras[0].responsavel}` : ""}.</p>}
      </Card>
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <select className="rounded-lg border border-border bg-background px-2 py-1 text-sm" value={sel} onChange={(e) => setEsp(e.target.value)}>
            {esps.map((s) => <option key={s} value={s}>{s} ({sim[s].length})</option>)}
          </select>
          <span className="text-sm text-muted-foreground">{mudam} criança(s) mudariam de posição</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Proposta</th><th className="p-2">Atual</th><th className="p-2">Criança</th><th className="p-2">Pontos atuais</th><th className="p-2">Pontos extras</th><th className="p-2">Espera</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.e.id} className="border-t border-border">
                  <td className="p-2 font-bold">{l.proposta}º</td>
                  <td className="p-2">{l.atual}º {l.atual !== l.proposta && <span className={l.proposta < l.atual ? "text-emerald-500" : "text-red-400"}>({l.proposta < l.atual ? "▲" : "▼"}{Math.abs(l.atual - l.proposta)})</span>}</td>
                  <td className="p-2">{l.e.patientName}</td>
                  <td className="p-2">{l.e.ordenacao === "chegada" ? "ordem de chegada" : (l.e.scoreEspecialidade ?? 0)}</td>
                  <td className="p-2">{l.extra || "—"}</td>
                  <td className="p-2">{Math.floor((l.e.waitDays ?? 0) / 30)} meses</td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Fila vazia</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

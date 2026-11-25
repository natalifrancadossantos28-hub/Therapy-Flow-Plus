// Comandos de voz da agenda clínica (profissional, administração e recepção), só por regras.
import {
  DICIONARIO as DIC, normalizar, acharFrase, temFrase, acharData, acharPeriodo, acharHora, encaixarGrade,
  acharPaciente, hojeBrasilia, isoData, GRADE, type PacienteVoz,
} from "@/lib/voz-regras";

export { semAcento } from "@/lib/voz-regras";
export type { PacienteVoz } from "@/lib/voz-regras";

/** Ações do menu do atendimento (e da tela) que podem ser chamadas pela voz. */
export type AcaoVoz =
  | "presente" | "em_atendimento" | "avaliacao_entrada" | "falta" | "falta_justificada" | "falta_nao_justificada"
  | "desmarcar" | "remanejar" | "remarcar" | "trocar_horario" | "semanal" | "quinzenal" | "mensal"
  | "pausar" | "busca_ativa" | "alta" | "desistencia" | "obito"
  | "encaminhamento" | "multi" | "transporte" | "excluir"
  | "agendar" | "consultar" | "ausencia" | "navegar" | "imprimir" | "fonte_maior" | "fonte_menor";

export const NOME_ACAO: Record<AcaoVoz, string> = {
  presente: "Presente", em_atendimento: "Em Atendimento", avaliacao_entrada: "Avaliação de Entrada",
  falta: "Falta", falta_justificada: "Falta Justificada", falta_nao_justificada: "Falta Não Justificada",
  desmarcar: "Desmarcar", remanejar: "Remanejar", remarcar: "Remarcar", trocar_horario: "Trocar horário (mesmo dia)",
  semanal: "Mudar para Semanal", quinzenal: "Mudar para Quinzenal", mensal: "Mudar para Mensal",
  pausar: "Pausar atendimento", busca_ativa: "Encaminhar p/ Busca Ativa",
  alta: "Dar Alta", desistencia: "Desistência", obito: "Óbito",
  encaminhamento: "Encaminhamento Interno", multi: "Atendimento Multi", transporte: "Transporte (Motorista)",
  excluir: "Excluir Agendamento", agendar: "Novo atendimento", consultar: "Ver atendimentos",
  ausencia: "Registrar Ausência", navegar: "Abrir tela", imprimir: "Imprimir agenda",
  fonte_maior: "Aumentar letra (A+)", fonte_menor: "Diminuir letra (A−)",
};

/** Ações que mexem no paciente: precisam saber quem é. */
export const PRECISA_PACIENTE = new Set<AcaoVoz>([
  "presente", "em_atendimento", "avaliacao_entrada", "falta", "falta_justificada", "falta_nao_justificada",
  "desmarcar", "remanejar", "remarcar", "trocar_horario", "semanal", "quinzenal", "mensal", "pausar", "busca_ativa",
  "alta", "desistencia", "obito", "encaminhamento", "multi", "transporte", "excluir",
]);
/** Sempre pedem confirmação antes. */
export const DESTRUTIVA = new Set<AcaoVoz>(["desmarcar", "excluir", "obito", "desistencia", "alta"]);
export const MOVER = new Set<AcaoVoz>(["remanejar", "remarcar"]);

export type Escopo = "dia" | "sempre";
export type Destino = "inicio" | "agenda" | "ausencias" | "perfil" | "dia" | "semana" | "mes" | "hoje" | "proximo_dia" | "dia_anterior" | "proxima_semana" | "semana_anterior";
export type ModoImpressao = "dia" | "semana" | "mes" | "rascunho";

export type ComandoClinico = {
  acao: AcaoVoz | null;
  /** Mais de uma ação possível (cor "laranja", "falta" sozinha): perguntar. */
  opcoesAcao: AcaoVoz[];
  paciente: PacienteVoz | null;
  opcoesPaciente: PacienteVoz[];
  falouNome: boolean;
  /** Dia do atendimento que vai ser mexido. */
  data: string | null;
  hora: string | null;
  /** Remanejar/Remarcar/Trocar horário/Agendar: para onde vai. */
  novaData: string | null;
  novaHora: string | null;
  /** Horário falado que não existe na grade (ex.: 07:50) e os vizinhos para escolher. */
  horaFora: { falada: string; antes: string | null; depois: string | null } | null;
  semanaCitada: string | null;
  escopo: Escopo | null;
  mesAssumido: boolean;
  fimDeSemana: boolean;
  destino: Destino | null;
  impressao: ModoImpressao | null;
  ausencia: { motivo: string | null; inicio: string | null; fim: string | null; observacao: string | null } | null;
  /** Óbito pede duas confirmações. */
  confirmacoes: number;
  frase: string;
};

const MOTIVOS = DIC.motivosAusencia as Record<string, string[]>;

export function interpretarComandoClinico(
  frase: string,
  pacientes: PacienteVoz[],
  opts: { hoje?: Date; grade?: string[]; temAtendimento?: (p: PacienteVoz, data: string | null) => boolean } = {},
): ComandoClinico {
  const hoje = opts.hoje ?? hojeBrasilia();
  const grade = opts.grade ?? GRADE.filter((g) => g !== "12:10");
  const t = normalizar(frase);
  const vazio: ComandoClinico = {
    acao: null, opcoesAcao: [], paciente: null, opcoesPaciente: [], falouNome: false, data: null, hora: null,
    novaData: null, novaHora: null, horaFora: null, semanaCitada: null, escopo: null, mesAssumido: false, fimDeSemana: false,
    destino: null, impressao: null, ausencia: null, confirmacoes: 0, frase,
  };
  if (!t) return vazio;

  // 2) Ação (a frase mais comprida vence) — ou a cor do botão.
  const achou = acharFrase(t, DIC.acoes as Record<string, string[]>);
  let acao = (achou?.chave as AcaoVoz | undefined) ?? null;
  if (acao === "navegar" && temFrase(t, (DIC.acoes as Record<string, string[]>).imprimir)) acao = "imprimir";
  let opcoesAcao: AcaoVoz[] = [];
  if (!acao || acao === "navegar") {
    const cor = acharFrase(t, DIC.cores as Record<string, string[]>);
    if (cor && (!acao || /\b(?:marcar|marca|botao|o|a)\b/.test(t))) {
      const lista = cor.chave.split("|") as AcaoVoz[];
      if (lista.length === 1) acao = lista[0]; else { acao = null; opcoesAcao = lista; }
    }
  }

  // Escopo e periodicidade saem do texto antes de procurar datas/horas/nomes.
  let resto = t;
  const esc = acharFrase(resto, DIC.escopo as Record<string, string[]>);
  let escopo: Escopo | null = (esc?.chave as Escopo | undefined) ?? null;
  if (esc) resto = resto.slice(0, esc.inicio) + " ".repeat(esc.fim - esc.inicio) + resto.slice(esc.fim);
  if (acao && ["semanal", "quinzenal", "mensal"].includes(acao)) escopo = null;

  // "atestado" sem paciente = ausência do profissional; com paciente = falta justificada.
  const cmd: ComandoClinico = { ...vazio, acao, opcoesAcao, escopo };

  if (acao === "ausencia" || (acao === "falta_justificada" && /\batestado\b/.test(t) && !/\bfalt/.test(t))) {
    const p = acharPaciente(resto, pacientes);
    if (acao === "ausencia" || !p.paciente) {
      cmd.acao = "ausencia";
      const per = acharPeriodo(resto, hoje);
      const d = per ? null : acharData(resto, hoje);
      const obs = /\b(?:observa[çc][ãa]o|obs)\b\s*(?:é|e|:)?\s*(.+)$/i.exec(frase);
      const motivo = acharFrase(t.replace(/\bvou faltar\b/, "falta"), MOTIVOS)?.chave ?? null;
      cmd.ausencia = {
        motivo,
        inicio: per?.inicio ?? d?.data ?? null,
        fim: per?.fim ?? null,
        observacao: obs ? obs[1].trim().replace(/[.]$/, "") || null : null,
      };
      cmd.fimDeSemana = !!d?.fimDeSemana;
      return cmd;
    }
  }

  if (acao === "navegar") {
    const dst = acharFrase(t.replace(/^(?:ir|vai|abrir|abre|mostrar|mostra|voltar)\s+(?:para|pra)?\s*/, ""), DIC.destinos as Record<string, string[]>);
    cmd.destino = (dst?.chave as Destino | undefined) ?? null;
    if (!cmd.destino) cmd.acao = null;
    return cmd;
  }
  if (acao === "imprimir") {
    cmd.impressao = (acharFrase(t, DIC.impressao as Record<string, string[]>)?.chave as ModoImpressao | undefined) ?? null;
    return cmd;
  }
  if (acao === "fonte_maior" || acao === "fonte_menor") return cmd;

  // Remanejar/Remarcar/Trocar: o que vem depois de "para/pra" é o destino.
  const move = !!acao && (MOVER.has(acao) || acao === "trocar_horario" || acao === "agendar");
  let origemTxt = resto, destinoTxt = "";
  if (move && acao !== "agendar") {
    const m = /\s(?:para|pra|pro|pras)\s/.exec(` ${resto} `);
    if (m) { origemTxt = ` ${resto} `.slice(0, m.index); destinoTxt = ` ${resto} `.slice(m.index); }
  }
  if (acao === "agendar") { destinoTxt = resto; origemTxt = ""; }

  const dO = acharData(origemTxt, hoje);
  const hO = acharHora(dO.resto);
  const dD = destinoTxt ? acharData(destinoTxt, hoje) : null;
  const hD = dD ? acharHora(dD.resto) : null;
  cmd.data = dO.data;
  cmd.hora = hO.hora;
  cmd.novaData = dD?.data ?? null;
  cmd.novaHora = hD?.hora ?? null;
  // "remanejar a Lauany quinta às 11:20" (sem "para"): a data/hora falada é o destino.
  if (move && acao !== "agendar" && !destinoTxt && (cmd.data || cmd.hora)) {
    cmd.novaData = cmd.data; cmd.novaHora = cmd.hora; cmd.data = null; cmd.hora = null;
  }
  cmd.semanaCitada = dD?.semana ?? dO.semana;
  cmd.mesAssumido = !!(dD?.mesAssumido || dO.mesAssumido);
  cmd.fimDeSemana = move ? !!dD?.fimDeSemana || (!destinoTxt && dO.fimDeSemana) : dO.fimDeSemana;

  // "trocar ... para as 10:45" sem dia novo e fora da grade = trocar horário no mesmo dia.
  if (acao && MOVER.has(acao) && !cmd.novaData && cmd.novaHora && !grade.includes(cmd.novaHora) && !/\bdia\b/.test(t) && achou && /^(?:troc|mud)/.test(t.slice(achou.inicio))) {
    cmd.acao = "trocar_horario";
  }
  if (cmd.acao && MOVER.has(cmd.acao) && cmd.novaHora && !grade.includes(cmd.novaHora)) {
    const g = encaixarGrade(cmd.novaHora, grade);
    if (!g.ok) cmd.horaFora = { falada: cmd.novaHora, antes: g.antes, depois: g.depois };
  }
  if (cmd.acao === "agendar" && cmd.novaHora && !grade.includes(cmd.novaHora)) {
    const g = encaixarGrade(cmd.novaHora, grade);
    if (!g.ok) cmd.horaFora = { falada: cmd.novaHora, antes: g.antes, depois: g.depois };
  }
  // Escopo implícito: Remarcar é sempre só neste dia.
  if (cmd.acao === "remarcar" && !cmd.escopo) cmd.escopo = "dia";
  if (cmd.acao && MOVER.has(cmd.acao) && cmd.escopo) cmd.acao = cmd.escopo === "dia" ? "remarcar" : "remanejar";

  // 1) Paciente.
  if (!cmd.acao || PRECISA_PACIENTE.has(cmd.acao) || cmd.opcoesAcao.length) {
    const nomeTxt = (hD?.resto ?? "") + " " + hO.resto;
    const p = acharPaciente(nomeTxt.replace(/\s+/g, " ").trim(), pacientes, opts.temAtendimento ? (x) => opts.temAtendimento!(x, cmd.data) : undefined);
    cmd.paciente = p.paciente; cmd.opcoesPaciente = p.opcoes; cmd.falouNome = p.falouNome;
  }
  if (cmd.acao === "falta") { cmd.acao = null; cmd.opcoesAcao = ["falta_justificada", "falta_nao_justificada"]; }
  return cmd;
}

// ── Perguntas: o que ainda falta ───────────────────────────────────────────
export type Opcao = { rotulo: string; detalhe?: string; aplicar: Partial<ComandoClinico> };
export type Pergunta = { chave: string; texto: string; opcoes: Opcao[]; erro?: boolean };

export type Contexto = {
  grade: string[];
  hoje?: Date;
  /** Situação do horário na agenda ("Livre", "Grupo: Ana, João"); null = não sei. */
  situacao?: (data: string, hora: string) => string | null;
  /** Motivo para não deixar (permissão etc.); null = pode. */
  bloqueio?: (cmd: ComandoClinico) => string | null;
};

const dd = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const DIAS_TXT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const dataCurta = (iso: string) => { const d = dd(iso); return `${DIAS_TXT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

function proximosDiasUteis(de: Date, n: number): string[] {
  const out: string[] = []; const x = new Date(de);
  while (out.length < n) { if (x.getDay() !== 0 && x.getDay() !== 6) out.push(isoData(x)); x.setDate(x.getDate() + 1); }
  return out;
}

export function proximaPergunta(cmd: ComandoClinico, ctx: Contexto): Pergunta | null {
  const hoje = ctx.hoje ?? hojeBrasilia();
  if (!cmd.acao && cmd.opcoesAcao.length) {
    const falta = cmd.opcoesAcao.includes("falta_justificada") && cmd.opcoesAcao.includes("falta_nao_justificada") && cmd.opcoesAcao.length === 2;
    return { chave: "acao", texto: falta ? "Foi falta justificada ou não justificada?" : "Qual destas opções?", opcoes: cmd.opcoesAcao.map((a) => ({ rotulo: NOME_ACAO[a], aplicar: { acao: a, opcoesAcao: [] } })) };
  }
  if (!cmd.acao) return null;
  const bloq = ctx.bloqueio?.(cmd);
  if (bloq) return { chave: "bloqueio", texto: bloq, opcoes: [], erro: true };
  if (PRECISA_PACIENTE.has(cmd.acao) && !cmd.paciente) {
    if (cmd.opcoesPaciente.length) return { chave: "paciente", texto: "Achei mais de um paciente parecido. Qual deles?", opcoes: cmd.opcoesPaciente.map((p) => ({ rotulo: p.patientName, detalhe: p.prontuario ? `Prontuário ${p.prontuario}` : undefined, aplicar: { paciente: p, opcoesPaciente: [] } })) };
    return { chave: "paciente", texto: cmd.falouNome ? "Não encontrei esse paciente na sua agenda. Fale o nome de novo ou o prontuário." : "De qual paciente? Fale o nome ou o prontuário.", opcoes: [], erro: cmd.falouNome };
  }
  if (cmd.acao === "ausencia") {
    const a = cmd.ausencia ?? { motivo: null, inicio: null, fim: null, observacao: null };
    if (!a.motivo) return { chave: "motivo", texto: "Qual o motivo da ausência?", opcoes: Object.keys(MOTIVOS).map((m) => ({ rotulo: m, aplicar: { ausencia: { ...a, motivo: m } } })) };
    if (!a.inicio) return { chave: "inicio", texto: "Qual dia começa? (Se não falar o dia final, vale um dia só.)", opcoes: proximosDiasUteis(hoje, 5).map((d) => ({ rotulo: dataCurta(d), aplicar: { ausencia: { ...a, inicio: d } } })) };
    return null;
  }
  const mexe = MOVER.has(cmd.acao) || cmd.acao === "trocar_horario";
  if (mexe || cmd.acao === "agendar") {
    if (cmd.fimDeSemana && cmd.acao !== "trocar_horario") {
      return { chave: "data", texto: "A agenda é de segunda a sexta. Para qual dia?", erro: true, opcoes: proximosDiasUteis(hoje, 10).map((d) => ({ rotulo: dataCurta(d), aplicar: { novaData: d, fimDeSemana: false } })) };
    }
    if (cmd.acao !== "trocar_horario" && !cmd.novaData) {
      const base = cmd.semanaCitada ? dd(cmd.semanaCitada) : hoje;
      return { chave: "data", texto: "Para qual dia?", opcoes: proximosDiasUteis(base < hoje ? hoje : base, cmd.semanaCitada ? 5 : 10).map((d) => ({ rotulo: dataCurta(d), aplicar: { novaData: d } })) };
    }
    if (cmd.horaFora) {
      const { falada, antes, depois } = cmd.horaFora;
      const ops = [antes, depois].filter(Boolean) as string[];
      return { chave: "hora", texto: `Não existe horário ${falada}. Você quis ${ops.join(" ou ")}?`, opcoes: ops.map((h) => ({ rotulo: h, detalhe: cmd.novaData ? ctx.situacao?.(cmd.novaData, h) ?? undefined : undefined, aplicar: { novaHora: h, horaFora: null } })) };
    }
    if (!cmd.novaHora) {
      if (cmd.acao === "trocar_horario") return { chave: "hora", texto: "Para qual horário? (Ex.: “trocar para as 10:45”.)", opcoes: [] };
      return { chave: "hora", texto: "Qual horário?", opcoes: ctx.grade.map((h) => ({ rotulo: h, detalhe: cmd.novaData ? ctx.situacao?.(cmd.novaData, h) ?? undefined : undefined, aplicar: { novaHora: h } })) };
    }
    if (mexe && !cmd.escopo) {
      return { chave: "escopo", texto: "Só neste dia ou todas as semanas daqui pra frente?", opcoes: [
        { rotulo: "Só neste dia", aplicar: { escopo: "dia", ...(MOVER.has(cmd.acao) ? { acao: "remarcar" as AcaoVoz } : {}) } },
        { rotulo: "Todas as semanas daqui pra frente", aplicar: { escopo: "sempre", ...(MOVER.has(cmd.acao) ? { acao: "remanejar" as AcaoVoz } : {}) } },
      ] };
    }
  }
  return null;
}

/** A pessoa respondeu falando: completa só o que estava faltando. */
export function responder(cmd: ComandoClinico, pergunta: Pergunta, frase: string, pacientes: PacienteVoz[], ctx: Contexto): ComandoClinico {
  const t = normalizar(frase);
  const hoje = ctx.hoje ?? hojeBrasilia();
  const porRotulo = pergunta.opcoes.find((o) => normalizar(o.rotulo) === t || (t.length >= 3 && normalizar(o.rotulo).includes(t)));
  if (porRotulo) return { ...cmd, ...porRotulo.aplicar };
  switch (pergunta.chave) {
    case "acao": {
      if (/\bnao\b/.test(t) && /\bjustific/.test(t)) return { ...cmd, acao: "falta_nao_justificada", opcoesAcao: [] };
      if (/\bjustific|\batestado\b|\bsim\b/.test(t)) return { ...cmd, acao: "falta_justificada", opcoesAcao: [] };
      const a = acharFrase(t, DIC.acoes as Record<string, string[]>)?.chave as AcaoVoz | undefined;
      return a && cmd.opcoesAcao.includes(a) ? { ...cmd, acao: a, opcoesAcao: [] } : cmd;
    }
    case "paciente": {
      const lista = cmd.opcoesPaciente.length ? cmd.opcoesPaciente : pacientes;
      const p = acharPaciente(t, lista);
      return { ...cmd, paciente: p.paciente, opcoesPaciente: p.paciente ? [] : p.opcoes.length ? p.opcoes : cmd.opcoesPaciente, falouNome: true };
    }
    case "motivo": {
      const m = acharFrase(t, MOTIVOS)?.chave;
      return m ? { ...cmd, ausencia: { ...(cmd.ausencia ?? { inicio: null, fim: null, observacao: null }), motivo: m } } : cmd;
    }
    case "inicio": {
      const per = acharPeriodo(t, hoje); const d = per ? null : acharData(t, hoje);
      const a = cmd.ausencia ?? { motivo: null, inicio: null, fim: null, observacao: null };
      return { ...cmd, ausencia: { ...a, inicio: per?.inicio ?? d?.data ?? null, fim: per?.fim ?? a.fim } };
    }
    case "data": {
      const d = acharData(t, hoje); const h = acharHora(d.resto);
      if (!d.data) return cmd;
      const novo = { ...cmd, novaData: d.data, fimDeSemana: d.fimDeSemana, novaHora: h.hora ?? cmd.novaHora };
      return ajustarHora(novo, ctx.grade);
    }
    case "hora": {
      const h = acharHora(t.replace(/^(\d{1,2})$/, "as $1").replace(/^(\d{1,2}) (\d{2})$/, "$1:$2"));
      return h.hora ? ajustarHora({ ...cmd, novaHora: h.hora, horaFora: null }, ctx.grade) : cmd;
    }
    case "escopo": {
      const e = acharFrase(t, DIC.escopo as Record<string, string[]>)?.chave as Escopo | undefined;
      if (!e) return cmd;
      return { ...cmd, escopo: e, acao: cmd.acao && MOVER.has(cmd.acao) ? (e === "dia" ? "remarcar" : "remanejar") : cmd.acao };
    }
  }
  return cmd;
}

function ajustarHora(cmd: ComandoClinico, grade: string[]): ComandoClinico {
  if (!cmd.novaHora || cmd.acao === "trocar_horario" || grade.includes(cmd.novaHora)) return { ...cmd, horaFora: null };
  const g = encaixarGrade(cmd.novaHora, grade);
  return g.ok ? cmd : { ...cmd, horaFora: { falada: cmd.novaHora, antes: g.antes, depois: g.depois } };
}

export const respostaSim = (frase: string) => temFrase(normalizar(frase), DIC.sim);
export const respostaNao = (frase: string) => temFrase(normalizar(frase), DIC.nao);
export const EXEMPLOS: string[] = DIC.exemplos;

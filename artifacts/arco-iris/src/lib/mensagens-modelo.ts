/** Modelos editáveis das mensagens do Assistente da recepção (salvos neste computador). */

export type ModeloId = "lembrete" | "avaliacao" | "van" | "faltaVan" | "buscaAtiva" | "buscaFalta" | "encaixe";
export type Campo = { tag: string; desc: string; exemplo: string };

const UNIDADE: Campo = { tag: "unidade", desc: "nome da unidade", exemplo: "Núcleo de Atendimento Novo Arco-íris 🌈" };
const NOME: Campo = { tag: "nome", desc: "primeiro nome do paciente", exemplo: "Davi" };
const PACIENTE: Campo = { tag: "paciente", desc: "nome completo do paciente", exemplo: "Davi Santana Rocha" };
const RESPONSAVEL: Campo = { tag: "responsavel", desc: "primeiro nome do responsável", exemplo: "Maria" };
const DIA: Campo = { tag: "dia", desc: "dia do atendimento", exemplo: "amanhã, terça-feira (24/11)" };
const HORARIOS: Campo = { tag: "horarios", desc: "lista de horários, especialidades e profissionais", exemplo: "• 08:00 — Fonoaudiologia com Bruna\n• 08:50 — Psicologia com Isabela" };
const AVISO_VAN: Campo = { tag: "aviso_van", desc: "aviso da van (só aparece para quem vem de van)", exemplo: "🚐 A van vai buscar Davi para o horário das 08:00 (motorista João)." };
const MOTORISTA: Campo = { tag: "motorista", desc: "nome do motorista", exemplo: "João" };
const HORA_VAN: Campo = { tag: "hora_van", desc: "horário da van", exemplo: "08:00" };
const HORA: Campo = { tag: "hora", desc: "horário", exemplo: "08:00" };
const ESPECIALIDADE: Campo = { tag: "especialidade", desc: "especialidade", exemplo: "Fonoaudiologia" };
const PROFISSIONAL: Campo = { tag: "profissional", desc: "profissional", exemplo: "Bruna" };

export const MODELOS: Record<ModeloId, { titulo: string; campos: Campo[]; padrao: string }> = {
  lembrete: {
    titulo: "Lembrete de confirmação",
    campos: [NOME, PACIENTE, RESPONSAVEL, DIA, HORARIOS, AVISO_VAN, UNIDADE],
    padrao:
      "Olá! Aqui é da recepção do {unidade}\n\n" +
      "Lembramos que {nome} tem atendimento {dia}:\n{horarios}\n\n" +
      "{aviso_van}\n\n" +
      "Por favor, confirme a presença respondendo esta mensagem. Se não for possível vir, avise com antecedência. Obrigado!",
  },
  avaliacao: {
    titulo: "Lembrete de avaliação",
    campos: [NOME, PACIENTE, RESPONSAVEL, DIA, HORARIOS, AVISO_VAN, UNIDADE],
    padrao:
      "Olá! Aqui é da recepção do {unidade}\n\n" +
      "Lembramos que {nome} tem avaliação marcada {dia}:\n{horarios}\n\n" +
      "{aviso_van}\n\n" +
      "Por favor, confirme a presença respondendo esta mensagem. Se tiver laudos ou relatórios, traga no dia da avaliação. Se não for possível vir, avise com antecedência. Obrigado!",
  },
  van: {
    titulo: "Van — confirmar a busca",
    campos: [NOME, PACIENTE, RESPONSAVEL, DIA, HORA_VAN, MOTORISTA, UNIDADE],
    padrao:
      "Olá! Aqui é da recepção do {unidade}\n\n" +
      "A van (motorista {motorista}) vai buscar {nome} {dia}, para o atendimento das {hora_van}.\n\n" +
      "Por favor, responda esta mensagem confirmando. Se {nome} não puder vir, avise a recepção com antecedência: assim o motorista não faz a viagem sem necessidade e consegue buscar as outras crianças no horário.\n\n" +
      "Obrigado pela colaboração!",
  },
  faltaVan: {
    titulo: "Falta de van sem aviso",
    campos: [NOME, PACIENTE, RESPONSAVEL, HORA, MOTORISTA, UNIDADE],
    padrao:
      "Olá! Aqui é da recepção do {unidade}\n\n" +
      "Hoje {nome} tinha atendimento às {hora}, com transporte pela van, e não compareceu. Não recebemos aviso e esperamos que esteja tudo bem.\n\n" +
      "Pedimos, por gentileza, que sempre que {nome} não puder vir, a recepção seja avisada com antecedência pelo WhatsApp. Assim o motorista não faz a viagem sem necessidade e consegue buscar as outras crianças no horário.\n\n" +
      "Contamos com a colaboração de vocês. Obrigado!",
  },
  buscaAtiva: {
    titulo: "Busca Ativa",
    campos: [RESPONSAVEL, PACIENTE, NOME, UNIDADE],
    padrao:
      "Olá, {responsavel}! Aqui é da administração do {unidade}\n\n" +
      "Estamos entrando em contato a respeito do(a) {paciente}. Pedimos, por gentileza, que compareça à unidade assim que possível para conversar com a administração.\n\n" +
      "Se preferir, responda esta mensagem para combinarmos o melhor dia e horário.\n\n" +
      "Atenciosamente,\nAdministração",
  },
  buscaFalta: {
    titulo: "Busca Ativa — faltas",
    campos: [PACIENTE, NOME, RESPONSAVEL, UNIDADE],
    padrao:
      "Prezada família de {paciente},\n\n" +
      "Identificamos faltas sem apresentação de atestado ou declaração. Pedimos, por gentileza, que compareça à administração do Núcleo para conversarmos sobre a situação.\n\n" +
      "Agradecemos a compreensão!\n\n" +
      "Administração do Núcleo Arco-Íris. 🌈",
  },
  encaixe: {
    titulo: "Encaixe",
    campos: [PACIENTE, NOME, HORA, ESPECIALIDADE, PROFISSIONAL, UNIDADE],
    padrao:
      "Olá! Aqui é da recepção do {unidade}\n\n" +
      "Surgiu um horário hoje, às {hora}, em {especialidade} ({profissional}), e o(a) {paciente} está na nossa fila de espera.\n\n" +
      "Vocês conseguem vir hoje nesse horário? Responda esta mensagem para confirmarmos. Obrigado!",
  },
};

const STORAGE_KEY = "nfs_modelos_mensagem";

export function lerModelos(): Partial<Record<ModeloId, string>> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") ?? {}; } catch { return {}; }
}

export function gravarModelos(m: Partial<Record<ModeloId, string>>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* sem storage */ }
}

/** Troca {campo} pelo valor e limpa sobras de campos vazios ("Olá, !", linhas em branco extras). */
export function preencher(modelo: string, vars: Record<string, string | undefined>): string {
  return modelo
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] ?? "" : m))
    .replace(/,\s*([!?.])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exemploDe(id: ModeloId): Record<string, string> {
  return Object.fromEntries(MODELOS[id].campos.map(c => [c.tag, c.exemplo]));
}

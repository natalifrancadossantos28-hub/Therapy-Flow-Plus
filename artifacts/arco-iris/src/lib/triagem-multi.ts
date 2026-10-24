// Triagem Multidisciplinar — cópia fiel do questionário do app "NFs – Triagem"
// (artifacts/triagem): 9 áreas x 10 perguntas, 0 a 3 pontos por item (0 a 30
// por área). A ordem das áreas define a ordem das respostas salvas — o banco
// (_autolink_triagem_internal) faz o mesmo fatiamento por posição.

export type Pergunta = { area: string; pergunta: string; explicacao: string };

export const AREAS = [
  "Fisioterapia", "Terapia Ocupacional", "Psicomotricidade", "Educação Física",
  "Nutrição", "Fonoaudiologia", "Psicologia", "Psicologia Parental", "Psicopedagogia",
];

export const AREA_ICONS: Record<string, string> = {
  "Psicologia": "🧠", "Psicologia Parental": "👨‍👩‍👧",
  "Psicomotricidade": "🏃", "Fisioterapia": "💪",
  "Terapia Ocupacional": "🤲", "Fonoaudiologia": "💬",
  "Nutrição": "🥗", "Psicopedagogia": "📚", "Educação Física": "⚽",
};

export const SHORT_NAMES: Record<string, string> = {
  "Psicologia": "Psicol.", "Psicologia Parental": "Psic. Parental",
  "Psicomotricidade": "Psicomotr.",
  "Fisioterapia": "Fisio.", "Terapia Ocupacional": "T. Ocup.",
  "Fonoaudiologia": "Fono.", "Nutrição": "Nutrição",
  "Psicopedagogia": "Psicoped.", "Educação Física": "Ed. Física",
};

export const CORES_AREA: Record<string, string> = {
  "Psicologia": "bg-purple-100 text-purple-800 border-purple-300",
  "Psicologia Parental": "bg-violet-100 text-violet-800 border-violet-300",
  "Psicomotricidade": "bg-indigo-100 text-indigo-800 border-indigo-300",
  "Fisioterapia": "bg-orange-100 text-orange-800 border-orange-300",
  "Terapia Ocupacional": "bg-teal-100 text-teal-800 border-teal-300",
  "Fonoaudiologia": "bg-blue-100 text-blue-800 border-blue-300",
  "Nutrição": "bg-green-100 text-green-800 border-green-300",
  "Psicopedagogia": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Educação Física": "bg-rose-100 text-rose-800 border-rose-300",
};

export const ESCALA = [
  { valor: 0, label: "0 – Não acontece" },
  { valor: 1, label: "1 – Raramente acontece" },
  { valor: 2, label: "2 – Acontece com alguma frequência" },
  { valor: 3, label: "3 – Acontece quase sempre" },
];

export const ESCALA_MAX = 30;
export const SCORE_MAX_DISPLAY = 150;

export type Nivel = { label: string; cor: string; bg: string; hex: string };

// Faixas por área (10 itens, 0 a 30 pontos):
//   0 a 8   → baixa sinalização funcional (fluxo regular)
//   9 a 17  → sinalização funcional moderada (atenção ampliada)
//   18 a 30 → alta sinalização funcional (priorização na avaliação)
export function classificarV2(pontos: number): Nivel {
  if (pontos <= 8)  return { label: "Baixa sinalização",    cor: "text-emerald-600", bg: "bg-emerald-50 border-emerald-300", hex: "#10b981" };
  if (pontos <= 17) return { label: "Sinalização moderada", cor: "text-amber-600",   bg: "bg-amber-50 border-amber-300",     hex: "#f59e0b" };
  return              { label: "Alta sinalização",          cor: "text-rose-600",    bg: "bg-rose-50 border-rose-300",       hex: "#f43f5e" };
}

export type ResultadoArea = { area: string; pontos: number; max: number; pct: number; nivel: Nivel };

export type ResultadoTriagem = {
  porArea: ResultadoArea[];
  ranking: ResultadoArea[];
  top3: ResultadoArea[];
  totalPontos: number;
  totalMax: number;
  pctTotal: number;
  scoreDisplayTotal: number;
  vulnBonusPts: number;
  resultadoTexto: string;
};

// Pesos por área (multiplicadores de prioridade) — iguais ao app da Triagem.
function pesoArea(area: string, cognitivoNaoPreservado: boolean): number {
  switch (area) {
    case "Psicomotricidade": return 0.85;
    case "Fisioterapia": return 1.3;
    case "Terapia Ocupacional":
    case "Fonoaudiologia": return cognitivoNaoPreservado ? 1.15 : 1.0;
    case "Psicopedagogia": return cognitivoNaoPreservado ? 0.5 : 1.0;
    case "Educação Física": return 0.9;
    default: return 1.0;
  }
}

// Social: +1 Escola Municipal/Estadual, +1 Trabalho Informal/Roça/Desempregado.
// Apenas desempate — não muda cor/classificação.
export function calcVulnScore(t: { tipoEscola?: string | null; trabalhoPais?: string | null }): number {
  let score = 0;
  if (t.tipoEscola === "Municipal" || t.tipoEscola === "Estadual") score += 1;
  if (t.trabalhoPais === "Informal/Roça" || t.trabalhoPais === "Desempregado") score += 1;
  return score;
}

export function calcularResultado(
  respostas: number[],
  opts: { cognitivoNaoPreservado?: boolean; tipoEscola?: string | null; trabalhoPais?: string | null } = {},
): ResultadoTriagem {
  const cnp = !!opts.cognitivoNaoPreservado;
  const porArea = AREAS.map((area) => {
    const pergs = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === area);
    const pontosRaw = pergs.reduce((a, p) => a + (respostas[p.idx] ?? 0), 0);
    const peso = pesoArea(area, cnp);
    const pontosReal = Math.round(pontosRaw * peso);
    const maxReal = Math.round(pergs.length * 3 * peso);
    const pct = maxReal > 0 ? Math.round((pontosReal / maxReal) * 100) : 0;
    const pontos = maxReal > 0 ? Math.round((pontosReal / maxReal) * ESCALA_MAX) : 0;
    return { area, pontos, max: ESCALA_MAX, pct, nivel: classificarV2(pontos) };
  });
  const ranking = [...porArea].sort((a, b) => b.pontos - a.pontos);
  const top3 = ranking.slice(0, 3).filter((a) => a.pontos > 0);
  const totalPontos = respostas.reduce((a, b) => a + (b ?? 0), 0);
  const totalMax = PERGUNTAS.length * 3;
  const pctTotal = Math.round((totalPontos / totalMax) * 100);
  const vulnBonusPts = calcVulnScore(opts);
  const scoreDisplayTotal = Math.round((totalPontos / totalMax) * SCORE_MAX_DISPLAY) + vulnBonusPts;
  const resultadoTexto = ranking.map(({ area, pontos, nivel }) => `${area}: ${pontos} pontos - ${nivel.label}`).join(" | ");
  return { porArea, ranking, top3, totalPontos, totalMax, pctTotal, scoreDisplayTotal, vulnBonusPts, resultadoTexto };
}

/** Converte o JSON salvo em `triagens.respostas` para o vetor de 90 respostas. */
export function parseRespostas(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== PERGUNTAS.length) return null;
    return parsed.map((v) => Number(v) || 0);
  } catch {
    return null;
  }
}

export function corTotal(pctTotal: number): string {
  return pctTotal >= 65 ? "#f43f5e" : pctTotal >= 45 ? "#f59e0b" : pctTotal >= 25 ? "#3b82f6" : "#10b981";
}

export const PERGUNTAS: Pergunta[] = [
  // ── FISIOTERAPIA (10) — desenvolvimento motor global, marcha, postura
  { area: "Fisioterapia", pergunta: "A criança apresenta alterações no controle postural estático?", explicacao: "Seu filho tem dificuldade para manter o corpo equilibrado quando está sentado ou em pé?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta alterações no padrão de marcha que comprometem sua mobilidade?", explicacao: "Seu filho tem dificuldade para andar ou apresenta alterações importantes na maneira de caminhar?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta dificuldades no equilíbrio durante a movimentação?", explicacao: "Seu filho perde o equilíbrio ou cai frequentemente quando anda ou se movimenta?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta sinais de redução da força muscular funcional?", explicacao: "Seu filho demonstra fraqueza ou muita dificuldade para realizar movimentos que exigem força?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta limitações nas transferências e na mobilidade funcional?", explicacao: "Seu filho tem dificuldade para levantar, sentar, mudar de posição ou se deslocar?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta limitações de amplitude de movimento articular?", explicacao: "Seu filho tem dificuldade para dobrar, esticar ou movimentar alguma parte do corpo?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta alterações posturais que interferem na funcionalidade?", explicacao: "Seu filho apresenta alguma postura do corpo que dificulta ficar sentado, em pé ou realizar atividades?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta dificuldades nas habilidades motoras grossas compatíveis com sua idade?", explicacao: "Seu filho tem dificuldade para correr, pular, subir degraus ou realizar movimentos amplos com o corpo?" },
  { area: "Fisioterapia", pergunta: "A criança apresenta necessidade de recursos assistivos para mobilidade funcional?", explicacao: "Seu filho precisa ou pode precisar de andador, cadeira de rodas, órteses ou outros equipamentos para se movimentar?" },
  { area: "Fisioterapia", pergunta: "A criança apresentou perda de habilidades motoras previamente adquiridas?", explicacao: "Seu filho deixou de conseguir realizar algum movimento que antes fazia, como andar, ficar em pé ou sentar?" },
  // ── TERAPIA OCUPACIONAL (10) — AVDs, motora fina, processamento sensorial
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta dificuldades de coordenação motora fina durante a manipulação de objetos?", explicacao: "Seu filho tem dificuldade para segurar lápis, encaixar peças, pegar objetos pequenos ou usar brinquedos que exigem movimentos das mãos?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta limitações no desempenho da atividade de alimentação?", explicacao: "Seu filho tem dificuldade para comer sozinho, usar colher ou levar alimentos à boca, considerando sua idade?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta dificuldades no desempenho das atividades relacionadas ao vestir-se?", explicacao: "Seu filho tem dificuldade para colocar ou tirar roupas, mesmo considerando a idade e as habilidades dele?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta limitações no desempenho de atividades de higiene pessoal?", explicacao: "Seu filho tem dificuldade para escovar os dentes, lavar as mãos ou participar dos cuidados com a própria higiene?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta respostas sensoriais auditivas que interferem na participação cotidiana?", explicacao: "Seu filho demonstra desconforto muito intenso com barulhos comuns, como liquidificador, secador ou ambientes movimentados?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta respostas sensoriais táteis que interferem nas atividades cotidianas?", explicacao: "Seu filho apresenta desconforto intenso ao tocar determinados materiais, usar certas roupas ou receber contato físico?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta dificuldades de planejamento e execução de ações motoras funcionais?", explicacao: "Seu filho tem dificuldade para organizar os movimentos necessários para realizar tarefas, mesmo quando parece entender o que precisa fazer?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta limitações na participação em atividades lúdicas compatíveis com seu desenvolvimento?", explicacao: "Seu filho tem dificuldade para utilizar brinquedos ou participar de brincadeiras adequadas às habilidades e à idade dele?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta dificuldades na organização e execução de sequências de atividades cotidianas?", explicacao: "Seu filho tem dificuldade para realizar tarefas com várias etapas, como guardar materiais ou seguir uma sequência de atividades?" },
  { area: "Terapia Ocupacional", pergunta: "A criança apresenta restrições significativas de participação nas ocupações infantis?", explicacao: "As dificuldades do seu filho atrapalham bastante sua participação nas atividades de casa, da escola ou nas brincadeiras?" },
  // ── PSICOMOTRICIDADE (10) — esquema corporal, imitação, brincar relacional
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na percepção e organização do esquema corporal?", explicacao: "Seu filho tem dificuldade para reconhecer ou utilizar diferentes partes do corpo durante brincadeiras e movimentos?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades de orientação e organização espacial?", explicacao: "Seu filho tem dificuldade para compreender posições como dentro, fora, em cima, embaixo ou ao lado, considerando sua idade?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na percepção e organização temporal?", explicacao: "Seu filho tem dificuldade para compreender sequências como antes, depois, primeiro e último?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na coordenação motora bilateral?", explicacao: "Seu filho tem dificuldade para usar os dois lados do corpo de maneira coordenada durante as atividades?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades de organização rítmica dos movimentos?", explicacao: "Seu filho tem dificuldade para acompanhar movimentos com ritmo, como bater palmas seguindo uma música?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na elaboração e execução de sequências motoras?", explicacao: "Seu filho tem dificuldade para organizar uma sequência de movimentos durante jogos ou brincadeiras?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades de equilíbrio durante atividades psicomotoras?", explicacao: "Seu filho tem dificuldade para realizar brincadeiras que exigem equilíbrio, como andar sobre uma linha?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na integração visuomotora?", explicacao: "Seu filho tem dificuldade para coordenar o que vê com os movimentos das mãos, como encaixar peças ou acertar um alvo?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta dificuldades na organização de movimentos em atividades estruturadas?", explicacao: "Seu filho tem dificuldade para acompanhar brincadeiras com movimentos em determinada ordem?" },
  { area: "Psicomotricidade", pergunta: "A criança apresenta limitações na participação em atividades lúdicas que exigem habilidades psicomotoras?", explicacao: "Seu filho deixa de participar de brincadeiras por ter dificuldades para coordenar ou organizar os movimentos?" },
  // ── EDUCAÇÃO FÍSICA (10) — prática corporal, condicionamento, sedentarismo
  { area: "Educação Física", pergunta: "A criança apresenta restrições na participação em atividades físicas e recreativas?", explicacao: "Seu filho tem dificuldade para participar de brincadeiras e atividades que envolvem movimento?" },
  { area: "Educação Física", pergunta: "A criança apresenta dificuldades de coordenação motora durante atividades físicas estruturadas?", explicacao: "Seu filho tem dificuldade para realizar movimentos durante jogos, brincadeiras ou atividades esportivas?" },
  { area: "Educação Física", pergunta: "A criança apresenta baixa tolerância funcional à atividade física?", explicacao: "Seu filho apresenta cansaço excessivo ou dificuldade para acompanhar atividades físicas adequadas à sua condição?" },
  { area: "Educação Física", pergunta: "A criança apresenta necessidade de adaptações para participação em atividades esportivas?", explicacao: "Seu filho precisa de mudanças nas regras, nos materiais ou no ambiente para conseguir participar de atividades físicas?" },
  { area: "Educação Física", pergunta: "A criança apresenta dificuldades para participar de jogos e atividades físicas coletivas?", explicacao: "Seu filho tem dificuldade para participar de brincadeiras ou esportes em grupo?" },
  { area: "Educação Física", pergunta: "A criança apresenta dificuldades na execução de habilidades motoras fundamentais?", explicacao: "Seu filho tem dificuldade para correr, saltar, lançar ou receber objetos, considerando suas possibilidades físicas?" },
  { area: "Educação Física", pergunta: "A criança apresenta barreiras de acesso às práticas corporais e esportivas?", explicacao: "Seu filho deixa de participar de atividades físicas porque faltam locais acessíveis, adaptações ou oportunidades?" },
  { area: "Educação Física", pergunta: "A criança necessita de supervisão ou adaptações específicas para participar de atividades físicas com segurança?", explicacao: "Seu filho precisa de cuidados ou adaptações especiais para brincar e praticar exercícios com segurança?" },
  { area: "Educação Física", pergunta: "A criança apresenta restrições de participação em atividades recreativas inclusivas?", explicacao: "Seu filho encontra dificuldades para participar de atividades recreativas com outras crianças?" },
  { area: "Educação Física", pergunta: "A criança demonstra interesse em atividades físicas, mas apresenta dificuldades funcionais ou ambientais que limitam sua participação?", explicacao: "Seu filho demonstra vontade de participar de esportes ou brincadeiras com movimento, mas encontra dificuldades para conseguir?" },
  // ── NUTRIÇÃO (10) — alimentação, estado nutricional, repercussões gastro
  { area: "Nutrição", pergunta: "A criança apresenta repertório alimentar significativamente restrito?", explicacao: "Seu filho aceita poucos tipos de alimentos e recusa muitos outros?" },
  { area: "Nutrição", pergunta: "A criança apresenta dificuldades na aceitação de diferentes consistências alimentares?", explicacao: "Seu filho recusa alimentos por serem pastosos, crocantes, sólidos ou apresentarem determinadas texturas?" },
  { area: "Nutrição", pergunta: "A criança apresenta baixa diversidade alimentar?", explicacao: "Seu filho tem dificuldade para consumir diferentes grupos de alimentos, como frutas, verduras, legumes ou proteínas?" },
  { area: "Nutrição", pergunta: "A criança apresenta episódios persistentes de recusa alimentar?", explicacao: "Seu filho frequentemente se recusa a comer, mesmo quando os alimentos são oferecidos em condições habituais?" },
  { area: "Nutrição", pergunta: "Existem preocupações relacionadas à evolução ponderal e ao crescimento da criança?", explicacao: "Você ou algum profissional percebeu perda de peso, dificuldade para ganhar peso ou alterações preocupantes no crescimento do seu filho?" },
  { area: "Nutrição", pergunta: "A criança apresenta condição clínica que exige acompanhamento nutricional específico?", explicacao: "Seu filho possui alguma doença ou condição de saúde que exige alimentação especial ou acompanhamento com nutricionista?" },
  { area: "Nutrição", pergunta: "A criança apresenta sintomas gastrointestinais frequentes que interferem na alimentação?", explicacao: "Seu filho costuma apresentar vômitos, constipação, diarreia ou desconfortos que prejudicam sua alimentação?" },
  { area: "Nutrição", pergunta: "A criança apresenta dificuldades importantes na organização e manutenção de uma rotina alimentar adequada?", explicacao: "Seu filho tem dificuldades frequentes para realizar as refeições ou manter uma rotina de alimentação?" },
  { area: "Nutrição", pergunta: "A criança necessita de adaptações ou suporte específico para manter alimentação nutricionalmente adequada?", explicacao: "Seu filho precisa de alguma adaptação, orientação ou cuidado especial para conseguir se alimentar adequadamente?" },
  { area: "Nutrição", pergunta: "As dificuldades alimentares da criança apresentam repercussões relevantes na saúde ou no desenvolvimento?", explicacao: "As dificuldades para comer têm prejudicado a saúde, o crescimento ou as atividades diárias do seu filho?" },
  // ── FONOAUDIOLOGIA (10) — comunicação, linguagem, deglutição/disfagia
  { area: "Fonoaudiologia", pergunta: "A criança apresenta dificuldades na expressão da linguagem oral, considerando sua idade e desenvolvimento?", explicacao: "Seu filho tem dificuldade para falar ou expressar o que deseja por meio de palavras ou frases?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta dificuldades na compreensão de comandos verbais compatíveis com seu desenvolvimento?", explicacao: "Seu filho tem dificuldade para entender o que você fala ou seguir orientações simples?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta dificuldades para comunicar suas necessidades utilizando recursos verbais ou não verbais?", explicacao: "Seu filho tem dificuldade para pedir água, comida, ajuda ou mostrar o que deseja, mesmo usando gestos ou figuras?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta alterações articulatórias que comprometem a inteligibilidade da fala?", explicacao: "As pessoas têm dificuldade para entender as palavras que seu filho fala?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta dificuldades para iniciar ou manter interações comunicativas?", explicacao: "Seu filho tem dificuldade para começar ou continuar uma conversa ou outra forma de comunicação com alguém?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta dificuldades para utilizar palavras e frases de forma funcional e contextualizada?", explicacao: "Seu filho repete palavras ou frases, mas tem dificuldade para utilizá-las para se comunicar?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta necessidade de recursos de comunicação aumentativa e alternativa?", explicacao: "Seu filho tem dificuldade para se comunicar e poderia precisar de figuras, símbolos ou algum aparelho para expressar o que deseja?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta alterações nas habilidades motoras orais relacionadas à mastigação?", explicacao: "Seu filho tem dificuldade para mastigar alimentos ou preparar a comida na boca antes de engolir?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresenta sinais sugestivos de alterações na deglutição?", explicacao: "Seu filho costuma tossir, engasgar ou apresentar dificuldade quando come ou bebe?" },
  { area: "Fonoaudiologia", pergunta: "A criança apresentou perda de habilidades comunicativas previamente adquiridas?", explicacao: "Seu filho deixou de falar palavras ou de utilizar formas de comunicação que antes conseguia?" },
  // ── PSICOLOGIA (10) — regulação emocional, comportamento, impacto funcional
  { area: "Psicologia", pergunta: "A criança apresenta dificuldades significativas na regulação das respostas emocionais?", explicacao: "Seu filho tem crises de choro, irritação ou nervosismo difíceis de controlar?" },
  { area: "Psicologia", pergunta: "A criança apresenta comportamentos heteroagressivos recorrentes?", explicacao: "Seu filho costuma bater, morder, empurrar ou machucar outras pessoas?" },
  { area: "Psicologia", pergunta: "A criança apresenta comportamentos autoagressivos?", explicacao: "Seu filho costuma se bater, se morder, bater a cabeça ou se machucar?" },
  { area: "Psicologia", pergunta: "A criança apresenta manifestações de ansiedade que interferem em suas atividades cotidianas?", explicacao: "Seu filho demonstra medo, preocupação ou nervosismo tão intensos que prejudicam sua rotina?" },
  { area: "Psicologia", pergunta: "A criança apresenta dificuldades significativas na tolerância à frustração?", explicacao: "Seu filho apresenta crises intensas quando recebe um não ou quando alguma coisa não acontece como deseja?" },
  { area: "Psicologia", pergunta: "A criança apresenta dificuldades na interação social que comprometem sua participação em atividades cotidianas?", explicacao: "Seu filho tem dificuldades importantes para brincar, conviver ou participar de atividades com outras pessoas?" },
  { area: "Psicologia", pergunta: "A criança apresenta comportamentos que comprometem sua própria segurança ou a de terceiros?", explicacao: "Seu filho costuma correr para locais perigosos, fugir ou fazer coisas que podem colocar alguém em perigo?" },
  { area: "Psicologia", pergunta: "A criança apresenta dificuldades importantes de adaptação a alterações na rotina?", explicacao: "Seu filho apresenta sofrimento intenso ou crises quando acontece alguma mudança nos horários ou nas atividades?" },
  { area: "Psicologia", pergunta: "A criança apresenta sinais persistentes de sofrimento emocional que interferem na participação cotidiana?", explicacao: "Seu filho parece frequentemente triste, angustiado ou emocionalmente abalado, a ponto de deixar de fazer atividades habituais?" },
  { area: "Psicologia", pergunta: "A criança apresenta dificuldades emocionais ou comportamentais que comprometem sua participação no ambiente escolar?", explicacao: "Seu filho apresenta dificuldades de comportamento ou emocionais que atrapalham bastante sua permanência ou participação na escola?" },
  // ── PSICOLOGIA PARENTAL (10) — manejo familiar, orientação e adesão
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para lidar com as crises emocionais ou comportamentais da criança?", explicacao: "Na hora da crise, vocês sabem o que fazer?" },
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para estabelecer limites e combinados com a criança?", explicacao: "É difícil colocar limite e manter o combinado?" },
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para organizar uma rotina previsível para a criança?", explicacao: "A rotina da casa é organizada (hora de comer, dormir, brincar)?" },
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para manter as orientações dadas pelos profissionais de saúde ou educação?", explicacao: "Consegue seguir em casa o que os terapeutas orientam?" },
  { area: "Psicologia Parental", pergunta: "A família sente necessidade de orientação para estimular o desenvolvimento da criança em casa?", explicacao: "Vocês gostariam de aprender a estimular ele em casa?" },
  { area: "Psicologia Parental", pergunta: "Os comportamentos da criança geram desgaste importante para os cuidadores?", explicacao: "Quem cuida está esgotado, com estresse ou adoecendo?" },
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para compreender as necessidades da criança e como ajudá-la?", explicacao: "Vocês entendem o que ele precisa na maior parte do tempo?" },
  { area: "Psicologia Parental", pergunta: "A família apresenta dificuldade para lidar com comportamentos agressivos, desafiadores ou de oposição?", explicacao: "É difícil manejar a agressividade ou a desobediência?" },
  { area: "Psicologia Parental", pergunta: "A família necessita de apoio para favorecer a participação da criança na escola, em casa ou na comunidade?", explicacao: "Precisam de ajuda pra incluir ele nesses espaços?" },
  { area: "Psicologia Parental", pergunta: "A família necessita de acompanhamento psicológico ou orientação para lidar com as demandas do desenvolvimento da criança?", explicacao: "Os cuidadores precisam de apoio psicológico?" },
  // ── PSICOPEDAGOGIA (10) — aprendizagem escolar e articulação com o AEE
  { area: "Psicopedagogia", pergunta: "É aluno da rede municipal, está matriculado entre o 1º e o 5º ano e possui acompanhamento pelo AEE?", explicacao: "Critério de elegibilidade da Psicopedagogia — marque 3 se atende a todos os itens." },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para aprender a ler?", explicacao: "Está lendo do jeito esperado pra série dele?" },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para compreender o que lê?", explicacao: "Lê mas não entende o que leu?" },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para escrever palavras, frases ou textos adequados para sua escolaridade?", explicacao: "A escrita está atrasada em relação à série?" },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para reconhecer letras, números ou símbolos adequados para sua escolaridade?", explicacao: "Reconhece as letras e os números da série dele?" },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para realizar atividades matemáticas adequadas para sua escolaridade?", explicacao: "As continhas da série dele são um problema?" },
  { area: "Psicopedagogia", pergunta: "Necessita de ajuda constante para realizar tarefas escolares em casa ou na escola?", explicacao: "Só consegue fazer a lição com alguém do lado?" },
  { area: "Psicopedagogia", pergunta: "Apresenta dificuldade para acompanhar os conteúdos trabalhados na escola?", explicacao: "Fica pra trás em relação à turma?" },
  { area: "Psicopedagogia", pergunta: "Evita ou demonstra resistência para realizar atividades de leitura, escrita ou matemática?", explicacao: "Foge de atividade de leitura, escrita ou conta?" },
  { area: "Psicopedagogia", pergunta: "A escola ou o AEE relatam dificuldades importantes no processo de aprendizagem?", explicacao: "A escola já sinalizou dificuldade de aprendizagem?" },
];

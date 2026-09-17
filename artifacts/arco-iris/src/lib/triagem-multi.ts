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
  { area: "Fisioterapia", pergunta: "Apresentou atraso para sentar sem apoio (após 8 meses) ou para andar sozinho (após 18 meses)?", explicacao: "Demorou mais que o esperado pra sentar sozinho ou pra começar a andar?" },
  { area: "Fisioterapia", pergunta: "Utiliza órtese, andador, muletas ou algum outro dispositivo para auxiliar a locomoção?", explicacao: "Usa aparelho, andador, muleta ou cadeira pra se locomover?" },
  { area: "Fisioterapia", pergunta: "Anda na ponta dos pés ou apresenta os pés muito planos (\"pé chato\")?", explicacao: "Anda na pontinha do pé ou o pé é bem chato/caído por dentro?" },
  { area: "Fisioterapia", pergunta: "Cai ou tropeça com frequência?", explicacao: "Cai bastante em situações simples do dia a dia?" },
  { area: "Fisioterapia", pergunta: "Reclama de dores nas pernas, pés, costas ou outras partes do corpo?", explicacao: "Costuma reclamar de dor no corpo?" },
  { area: "Fisioterapia", pergunta: "As articulações parecem muito soltas ou ele parece muito \"molinho\" nas atividades do dia a dia?", explicacao: "O corpo dele parece frouxo/molinho demais?" },
  { area: "Fisioterapia", pergunta: "Apresenta dificuldade para subir escadas, andar de bicicleta, pular ou ficar apoiado em um pé só?", explicacao: "Tem dificuldade nessas atividades comparado a outras crianças da idade?" },
  { area: "Fisioterapia", pergunta: "Apresenta movimentos involuntários ou movimentos repetitivos do corpo?", explicacao: "Faz movimentos que ele não controla ou repete o mesmo movimento?" },
  { area: "Fisioterapia", pergunta: "Costuma sentar em posição de \"W\" (joelhos dobrados para frente e pés para trás)?", explicacao: "Senta no chão com as perninhas abertas pra trás, formando um W?" },
  { area: "Fisioterapia", pergunta: "Apresenta escapes de urina ou fezes após a idade esperada para o controle do banheiro?", explicacao: "Faz xixi ou cocô na roupa depois da idade em que já deveria controlar?" },
  // ── TERAPIA OCUPACIONAL (10) — AVDs, motora fina, processamento sensorial
  { area: "Terapia Ocupacional", pergunta: "Apresenta dificuldade para se alimentar ou se vestir sozinho, de acordo com a idade?", explicacao: "Precisa de ajuda pra comer ou se vestir mais do que o esperado pra idade?" },
  { area: "Terapia Ocupacional", pergunta: "Apresenta dificuldade para brincar de forma adequada com os brinquedos?", explicacao: "Dá a função certa ao brinquedo ou só empilha, gira e enfileira?" },
  { area: "Terapia Ocupacional", pergunta: "Apresenta medo excessivo de locais altos, escadas, balanços ou de tirar os pés do chão?", explicacao: "Fica muito inseguro quando os pés saem do chão?" },
  { area: "Terapia Ocupacional", pergunta: "Procura movimento o tempo todo (corre, pula, gira, sobe em móveis, não fica parado)?", explicacao: "Parece não conseguir ficar parado, buscando movimento o tempo todo?" },
  { area: "Terapia Ocupacional", pergunta: "Costuma passar mal em carros, balanços, brinquedos giratórios ou em situações de movimento?", explicacao: "Enjoa ou passa mal com movimento (carro, balanço, roda-gigante)?" },
  { area: "Terapia Ocupacional", pergunta: "Apresenta dificuldade durante o banho, ao lavar a cabeça, cortar as unhas ou escovar os dentes?", explicacao: "Esses momentos de higiene viram briga ou choro?" },
  { area: "Terapia Ocupacional", pergunta: "Evita tocar ou brincar com texturas como areia, grama, tinta, massinha ou slime?", explicacao: "Recusa sujar a mão ou tocar em texturas diferentes?" },
  { area: "Terapia Ocupacional", pergunta: "Se incomoda excessivamente com sons, luzes, cheiros ou determinados tipos de roupa?", explicacao: "Tapa os ouvidos, reclama de etiqueta na roupa, de cheiro ou de luz forte?" },
  { area: "Terapia Ocupacional", pergunta: "Utiliza fraldas além do esperado para a idade?", explicacao: "Ainda usa fralda mesmo já tendo idade pra largar?" },
  { area: "Terapia Ocupacional", pergunta: "Apresenta dificuldade para usar lápis, tesoura, encaixes ou manipular objetos pequenos?", explicacao: "Tem dificuldade com atividades de mão (recortar, escrever, encaixar)?" },
  // ── PSICOMOTRICIDADE (10) — esquema corporal, imitação, brincar relacional
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para imitar gestos, movimentos ou posições demonstradas por outra pessoa?", explicacao: "Ex.: bater palmas, levantar os braços, copiar uma brincadeira ou uma dança." },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para realizar pequenas sequências de movimentos quando solicitado?", explicacao: "Ex.: pular, bater palmas e sentar; pegar um objeto e colocá-lo em outro lugar." },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para identificar ou apontar partes do próprio corpo quando solicitado?", explicacao: "Ex.: nariz, boca, mãos, pés, joelhos." },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para brincar com outras crianças?", explicacao: "Consegue entrar na brincadeira das outras crianças?" },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para participar de brincadeiras em grupo?", explicacao: "Em grupo ele se afasta, se desorganiza ou não participa?" },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para esperar sua vez durante brincadeiras ou jogos?", explicacao: "Consegue esperar a vez sem se irritar?" },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para seguir regras simples durante brincadeiras?", explicacao: "Entende e respeita as regrinhas do jogo?" },
  { area: "Psicomotricidade", pergunta: "Demonstra pouco interesse em explorar brinquedos, espaços ou novas atividades?", explicacao: "Fica sempre na mesma brincadeira e evita novidade?" },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para utilizar a imaginação em brincadeiras de faz de conta?", explicacao: "Ex.: casinha, escolinha, super-herói, médico ou criar histórias brincando." },
  { area: "Psicomotricidade", pergunta: "Apresenta dificuldade para expressar emoções ou sentimentos durante as brincadeiras?", explicacao: "Demonstra alegria, raiva ou frustração brincando?" },
  // ── EDUCAÇÃO FÍSICA (10) — prática corporal, condicionamento, sedentarismo
  { area: "Educação Física", pergunta: "Evita participar de atividades físicas que exigem correr, saltar ou realizar esforços físicos?", explicacao: "Foge de brincadeira que dá canseira?" },
  { area: "Educação Física", pergunta: "Cansa mais rápido que outras crianças da mesma idade durante brincadeiras ou atividades físicas?", explicacao: "Cansa antes dos coleguinhas?" },
  { area: "Educação Física", pergunta: "Passa a maior parte do tempo livre em atividades sedentárias?", explicacao: "Ex.: celular, tablet, televisão ou videogame." },
  { area: "Educação Física", pergunta: "Fica sem praticar atividade física ou esporte regularmente fora da escola?", explicacao: "Fora da escola, ele pratica algum esporte ou atividade física na rotina?" },
  { area: "Educação Física", pergunta: "Apresenta dificuldade para acompanhar as atividades físicas propostas na escola?", explicacao: "Na Educação Física da escola ele consegue acompanhar a turma?" },
  { area: "Educação Física", pergunta: "Evita participar de jogos ou esportes por insegurança ou medo de não acompanhar os colegas?", explicacao: "Deixa de jogar com medo de errar ou de ser o pior?" },
  { area: "Educação Física", pergunta: "Demonstra pouca resistência física para brincar ou se manter ativo por períodos compatíveis com a idade?", explicacao: "Aguenta pouco tempo de brincadeira ativa?" },
  { area: "Educação Física", pergunta: "Apresenta dificuldade para participar de atividades físicas em grupo por limitações físicas ou baixo condicionamento?", explicacao: "O corpo dele limita a participação nas atividades em grupo?" },
  { area: "Educação Física", pergunta: "Apresenta excesso de peso que dificulta a participação em brincadeiras ou atividades físicas?", explicacao: "O peso atrapalha ele de brincar e se movimentar?" },
  { area: "Educação Física", pergunta: "A família gostaria de apoio para aumentar a prática de atividade física e reduzir o sedentarismo?", explicacao: "Vocês querem ajuda pra ele se mexer mais e ficar menos na tela?" },
  // ── NUTRIÇÃO (10) — alimentação, estado nutricional, repercussões gastro
  { area: "Nutrição", pergunta: "Aceita apenas uma quantidade limitada de alimentos?", explicacao: "Ex.: come sempre os mesmos alimentos e recusa experimentar novos." },
  { area: "Nutrição", pergunta: "Recusa alimentos por causa da textura, cor, cheiro, temperatura ou aparência?", explicacao: "Recusa a comida pelo jeito dela, e não pela fome?" },
  { area: "Nutrição", pergunta: "Apresenta ou apresentou dificuldades na amamentação, introdução alimentar ou aceitação dos alimentos?", explicacao: "Ex.: dificuldade de pega, sucção, baixa ingestão de leite, recusa alimentar." },
  { area: "Nutrição", pergunta: "Apresenta alteração de peso (baixo peso, perda de peso, sobrepeso ou ganho excessivo)?", explicacao: "O médico já falou que o peso está fora do esperado?" },
  { area: "Nutrição", pergunta: "Apresenta prisão de ventre (intestino preso) com frequência?", explicacao: "Fica muitos dias sem evacuar ou sofre pra fazer cocô?" },
  { area: "Nutrição", pergunta: "Apresenta diarreia, dores abdominais, gases excessivos ou outros desconfortos gastrointestinais com frequência?", explicacao: "Vive com dor de barriga, gases ou intestino solto?" },
  { area: "Nutrição", pergunta: "Possui alergia alimentar ou restrições alimentares orientadas por profissional de saúde?", explicacao: "Tem alguma comida proibida por orientação médica?" },
  { area: "Nutrição", pergunta: "Já apresentou alterações em exames relacionadas à alimentação ou nutrição?", explicacao: "Ex.: anemia, falta de ferro, vitamina D ou B12." },
  { area: "Nutrição", pergunta: "Apresenta dificuldade para mastigar ou engolir os alimentos?", explicacao: "Engasga, guarda comida na boca ou evita mastigar?" },
  { area: "Nutrição", pergunta: "As dificuldades alimentares interferem na rotina da família ou da escola?", explicacao: "Ex.: precisa preparar refeição separada ou é difícil comer fora de casa." },
  // ── FONOAUDIOLOGIA (10) — comunicação, linguagem, deglutição/disfagia
  { area: "Fonoaudiologia", pergunta: "Apresenta dificuldade para mastigar os alimentos?", explicacao: "Evita comida dura ou mastiga com muita dificuldade?" },
  { area: "Fonoaudiologia", pergunta: "Engasga, tosse ou parece \"afogar\" durante a alimentação ou ao beber líquidos?", explicacao: "Engasga com comida ou com água?" },
  { area: "Fonoaudiologia", pergunta: "Já apresentou pneumonia de repetição, infecções respiratórias frequentes ou suspeita de broncoaspiração?", explicacao: "Já teve pneumonia mais de uma vez ou vive com infecção no pulmão?" },
  { area: "Fonoaudiologia", pergunta: "Apresenta dificuldade para engolir alimentos, líquidos ou medicamentos?", explicacao: "Tem dificuldade pra engolir mesmo comida mole ou remédio?" },
  { area: "Fonoaudiologia", pergunta: "Não fala ou utiliza poucas palavras, quando comparado a crianças da mesma idade?", explicacao: "Fala bem menos que outras crianças da mesma idade?" },
  { area: "Fonoaudiologia", pergunta: "Apresenta dificuldade para expressar necessidades, desejos ou sentimentos pela fala ou outra forma de comunicação?", explicacao: "Consegue pedir o que quer ou só chora e aponta?" },
  { area: "Fonoaudiologia", pergunta: "Apresenta dificuldade para formar frases adequadas para a idade?", explicacao: "Monta frases completas ou fala por palavras soltas?" },
  { area: "Fonoaudiologia", pergunta: "A fala é difícil de ser compreendida por pessoas que não convivem com ele?", explicacao: "Estranhos entendem o que ele fala?" },
  { area: "Fonoaudiologia", pergunta: "Troca sons ou pronuncia palavras de forma diferente do esperado para a idade?", explicacao: "Ex.: troca letras, omite sons ou fala a palavra pela metade." },
  { area: "Fonoaudiologia", pergunta: "Necessita de gestos, figuras, pranchas, aplicativos ou outros recursos para ser compreendido?", explicacao: "Ex.: aponta figuras, usa PECS, prancha de comunicação, tablet ou aplicativo." },
  // ── PSICOLOGIA (10) — regulação emocional, comportamento, impacto funcional
  { area: "Psicologia", pergunta: "Apresenta crises de choro, irritação ou nervosismo que dificultam as atividades do dia a dia?", explicacao: "As crises atrapalham a rotina da casa?" },
  { area: "Psicologia", pergunta: "Fica muito incomodado quando há mudanças na rotina ou quando algo acontece diferente do esperado?", explicacao: "Mudou o plano do dia e ele desmonta?" },
  { area: "Psicologia", pergunta: "Apresenta comportamentos agressivos, como bater, morder, chutar, empurrar ou quebrar objetos?", explicacao: "Machuca outras pessoas ou quebra coisas quando se irrita?" },
  { area: "Psicologia", pergunta: "Tem dificuldade para ouvir \"não\", esperar sua vez ou lidar com frustrações?", explicacao: "Quando contrariam, faz birra grande?" },
  { area: "Psicologia", pergunta: "Apresenta comportamentos repetitivos ou dificuldade para interromper uma atividade quando solicitado?", explicacao: "Custa a parar uma atividade quando você pede?" },
  { area: "Psicologia", pergunta: "Costuma agir sem pensar nas consequências ou se colocar em situações de risco com frequência?", explicacao: "Ex.: correr para a rua, subir em lugar perigoso, mexer no que pode machucar." },
  { area: "Psicologia", pergunta: "Apresenta medos, preocupações ou inseguranças que atrapalham sua rotina?", explicacao: "Ex.: medo excessivo de pessoas, lugares, situações ou de se separar dos pais." },
  { area: "Psicologia", pergunta: "Tem dificuldade para demonstrar ou falar sobre o que está sentindo?", explicacao: "Ex.: tristeza, raiva, medo ou felicidade." },
  { area: "Psicologia", pergunta: "Os comportamentos atrapalham a participação na escola, nas terapias ou em outras atividades do dia a dia?", explicacao: "A escola ou a terapia já reclamaram do comportamento?" },
  { area: "Psicologia", pergunta: "Os comportamentos causam dificuldades importantes na convivência com a família ou outras pessoas?", explicacao: "O comportamento dele desgasta a convivência em casa?" },
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

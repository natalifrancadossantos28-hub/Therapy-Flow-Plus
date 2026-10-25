// Triagem multidisciplinar — 86 perguntas (documento institucional de 24/10/2026).
// 60 itens clínicos (6 especialidades x 10; Educação Física retirada), 6 sociofamiliares e 10 de
// identificação de prioridades. Não substitui o ABC nem a avaliação profissional.

export type TipoItem = "clinica" | "social" | "prioridade";
export type Item86 = { code: string; tipo: TipoItem; grupo: string; titulo: string; tecnica: string; simples: string };

export const AREAS_86 = [
  "Fonoaudiologia", "Psicologia", "Terapia Ocupacional", "Fisioterapia",
  "Psicomotricidade", "Nutrição",
] as const;

export const ITENS_86: Item86[] = [
  { code: "F01", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Linguagem expressiva", tecnica: "A criança apresenta dificuldades na expressão da linguagem oral, considerando sua idade e desenvolvimento?", simples: "Seu filho tem dificuldade para falar ou expressar o que deseja por meio de palavras ou frases?" },
  { code: "F02", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Linguagem receptiva", tecnica: "A criança apresenta dificuldades na compreensão de comandos verbais compatíveis com seu desenvolvimento?", simples: "Seu filho tem dificuldade para entender o que você fala ou seguir orientações simples?" },
  { code: "F03", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Comunicação funcional", tecnica: "A criança apresenta dificuldades para comunicar suas necessidades utilizando recursos verbais ou não verbais?", simples: "Seu filho tem dificuldade para pedir água, comida, ajuda ou mostrar o que deseja, mesmo usando gestos ou figuras?" },
  { code: "F04", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Articulação da fala", tecnica: "A criança apresenta alterações articulatórias que comprometem a inteligibilidade da fala?", simples: "As pessoas têm dificuldade para entender as palavras que seu filho fala?" },
  { code: "F05", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Interação comunicativa", tecnica: "A criança apresenta dificuldades para iniciar ou manter interações comunicativas?", simples: "Seu filho tem dificuldade para começar ou continuar uma conversa ou outra forma de comunicação com alguém?" },
  { code: "F06", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Uso funcional da linguagem", tecnica: "A criança apresenta dificuldades para utilizar palavras e frases de forma funcional e contextualizada?", simples: "Seu filho repete palavras ou frases, mas tem dificuldade para utilizá-las para se comunicar?" },
  { code: "F07", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Comunicação alternativa", tecnica: "A criança apresenta necessidade de recursos de comunicação aumentativa e alternativa?", simples: "Seu filho tem dificuldade para se comunicar e poderia precisar de figuras, símbolos ou algum aparelho para expressar o que deseja?" },
  { code: "F08", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Mastigação", tecnica: "A criança apresenta alterações nas habilidades motoras orais relacionadas à mastigação?", simples: "Seu filho tem dificuldade para mastigar alimentos ou preparar a comida na boca antes de engolir?" },
  { code: "F09", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Deglutição", tecnica: "A criança apresenta sinais sugestivos de alterações na deglutição?", simples: "Seu filho costuma tossir, engasgar ou apresentar dificuldade quando come ou bebe?" },
  { code: "F10", tipo: "clinica", grupo: "Fonoaudiologia", titulo: "Regressão comunicativa", tecnica: "A criança apresentou perda de habilidades comunicativas previamente adquiridas?", simples: "Seu filho deixou de falar palavras ou de utilizar formas de comunicação que antes conseguia?" },
  { code: "P01", tipo: "clinica", grupo: "Psicologia", titulo: "Regulação emocional", tecnica: "A criança apresenta dificuldades significativas na regulação das respostas emocionais?", simples: "Seu filho tem crises de choro, irritação ou nervosismo difíceis de controlar?" },
  { code: "P02", tipo: "clinica", grupo: "Psicologia", titulo: "Agressividade", tecnica: "A criança apresenta comportamentos heteroagressivos recorrentes?", simples: "Seu filho costuma bater, morder, empurrar ou machucar outras pessoas?" },
  { code: "P03", tipo: "clinica", grupo: "Psicologia", titulo: "Autoagressão", tecnica: "A criança apresenta comportamentos autoagressivos?", simples: "Seu filho costuma se bater, se morder, bater a cabeça ou se machucar?" },
  { code: "P04", tipo: "clinica", grupo: "Psicologia", titulo: "Ansiedade", tecnica: "A criança apresenta manifestações de ansiedade que interferem em suas atividades cotidianas?", simples: "Seu filho demonstra medo, preocupação ou nervosismo tão intensos que prejudicam sua rotina?" },
  { code: "P05", tipo: "clinica", grupo: "Psicologia", titulo: "Tolerância à frustração", tecnica: "A criança apresenta dificuldades significativas na tolerância à frustração?", simples: "Seu filho apresenta crises intensas quando recebe um não ou quando alguma coisa não acontece como deseja?" },
  { code: "P06", tipo: "clinica", grupo: "Psicologia", titulo: "Interação social", tecnica: "A criança apresenta dificuldades na interação social que comprometem sua participação em atividades cotidianas?", simples: "Seu filho tem dificuldades importantes para brincar, conviver ou participar de atividades com outras pessoas?" },
  { code: "P07", tipo: "clinica", grupo: "Psicologia", titulo: "Comportamentos de risco", tecnica: "A criança apresenta comportamentos que comprometem sua própria segurança ou a de terceiros?", simples: "Seu filho costuma correr para locais perigosos, fugir ou fazer coisas que podem colocar alguém em perigo?" },
  { code: "P08", tipo: "clinica", grupo: "Psicologia", titulo: "Adaptação às mudanças", tecnica: "A criança apresenta dificuldades importantes de adaptação a alterações na rotina?", simples: "Seu filho apresenta sofrimento intenso ou crises quando acontece alguma mudança nos horários ou nas atividades?" },
  { code: "P09", tipo: "clinica", grupo: "Psicologia", titulo: "Sofrimento emocional", tecnica: "A criança apresenta sinais persistentes de sofrimento emocional que interferem na participação cotidiana?", simples: "Seu filho parece frequentemente triste, angustiado ou emocionalmente abalado, a ponto de deixar de fazer atividades habituais?" },
  { code: "P10", tipo: "clinica", grupo: "Psicologia", titulo: "Comportamento escolar", tecnica: "A criança apresenta dificuldades emocionais ou comportamentais que comprometem sua participação no ambiente escolar?", simples: "Seu filho apresenta dificuldades de comportamento ou emocionais que atrapalham bastante sua permanência ou participação na escola?" },
  { code: "TO01", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Coordenação motora fina", tecnica: "A criança apresenta dificuldades de coordenação motora fina durante a manipulação de objetos?", simples: "Seu filho tem dificuldade para segurar lápis, encaixar peças, pegar objetos pequenos ou usar brinquedos que exigem movimentos das mãos?" },
  { code: "TO02", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Autonomia na alimentação", tecnica: "A criança apresenta limitações no desempenho da atividade de alimentação?", simples: "Seu filho tem dificuldade para comer sozinho, usar colher ou levar alimentos à boca, considerando sua idade?" },
  { code: "TO03", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Autonomia no vestuário", tecnica: "A criança apresenta dificuldades no desempenho das atividades relacionadas ao vestir-se?", simples: "Seu filho tem dificuldade para colocar ou tirar roupas, mesmo considerando a idade e as habilidades dele?" },
  { code: "TO04", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Higiene pessoal", tecnica: "A criança apresenta limitações no desempenho de atividades de higiene pessoal?", simples: "Seu filho tem dificuldade para escovar os dentes, lavar as mãos ou participar dos cuidados com a própria higiene?" },
  { code: "TO05", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Processamento sensorial auditivo", tecnica: "A criança apresenta respostas sensoriais auditivas que interferem na participação cotidiana?", simples: "Seu filho demonstra desconforto muito intenso com barulhos comuns, como liquidificador, secador ou ambientes movimentados?" },
  { code: "TO06", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Processamento sensorial tátil", tecnica: "A criança apresenta respostas sensoriais táteis que interferem nas atividades cotidianas?", simples: "Seu filho apresenta desconforto intenso ao tocar determinados materiais, usar certas roupas ou receber contato físico?" },
  { code: "TO07", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Planejamento motor", tecnica: "A criança apresenta dificuldades de planejamento e execução de ações motoras funcionais?", simples: "Seu filho tem dificuldade para organizar os movimentos necessários para realizar tarefas, mesmo quando parece entender o que precisa fazer?" },
  { code: "TO08", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Brincar funcional", tecnica: "A criança apresenta limitações na participação em atividades lúdicas compatíveis com seu desenvolvimento?", simples: "Seu filho tem dificuldade para utilizar brinquedos ou participar de brincadeiras adequadas às habilidades e à idade dele?" },
  { code: "TO09", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Organização das atividades diárias", tecnica: "A criança apresenta dificuldades na organização e execução de sequências de atividades cotidianas?", simples: "Seu filho tem dificuldade para realizar tarefas com várias etapas, como guardar materiais ou seguir uma sequência de atividades?" },
  { code: "TO10", tipo: "clinica", grupo: "Terapia Ocupacional", titulo: "Participação ocupacional", tecnica: "A criança apresenta restrições significativas de participação nas ocupações infantis?", simples: "As dificuldades do seu filho atrapalham bastante sua participação nas atividades de casa, da escola ou nas brincadeiras?" },
  { code: "FI01", tipo: "clinica", grupo: "Fisioterapia", titulo: "Controle postural", tecnica: "A criança apresenta alterações no controle postural estático?", simples: "Seu filho tem dificuldade para manter o corpo equilibrado quando está sentado ou em pé?" },
  { code: "FI02", tipo: "clinica", grupo: "Fisioterapia", titulo: "Marcha", tecnica: "A criança apresenta alterações no padrão de marcha que comprometem sua mobilidade?", simples: "Seu filho tem dificuldade para andar ou apresenta alterações importantes na maneira de caminhar?" },
  { code: "FI03", tipo: "clinica", grupo: "Fisioterapia", titulo: "Equilíbrio dinâmico", tecnica: "A criança apresenta dificuldades no equilíbrio durante a movimentação?", simples: "Seu filho perde o equilíbrio ou cai frequentemente quando anda ou se movimenta?" },
  { code: "FI04", tipo: "clinica", grupo: "Fisioterapia", titulo: "Força muscular funcional", tecnica: "A criança apresenta sinais de redução da força muscular funcional?", simples: "Seu filho demonstra fraqueza ou muita dificuldade para realizar movimentos que exigem força?" },
  { code: "FI05", tipo: "clinica", grupo: "Fisioterapia", titulo: "Mobilidade funcional", tecnica: "A criança apresenta limitações nas transferências e na mobilidade funcional?", simples: "Seu filho tem dificuldade para levantar, sentar, mudar de posição ou se deslocar?" },
  { code: "FI06", tipo: "clinica", grupo: "Fisioterapia", titulo: "Amplitude de movimento", tecnica: "A criança apresenta limitações de amplitude de movimento articular?", simples: "Seu filho tem dificuldade para dobrar, esticar ou movimentar alguma parte do corpo?" },
  { code: "FI07", tipo: "clinica", grupo: "Fisioterapia", titulo: "Alterações posturais", tecnica: "A criança apresenta alterações posturais que interferem na funcionalidade?", simples: "Seu filho apresenta alguma postura do corpo que dificulta ficar sentado, em pé ou realizar atividades?" },
  { code: "FI08", tipo: "clinica", grupo: "Fisioterapia", titulo: "Coordenação motora grossa", tecnica: "A criança apresenta dificuldades nas habilidades motoras grossas compatíveis com sua idade?", simples: "Seu filho tem dificuldade para correr, pular, subir degraus ou realizar movimentos amplos com o corpo?" },
  { code: "FI09", tipo: "clinica", grupo: "Fisioterapia", titulo: "Dispositivos de mobilidade", tecnica: "A criança apresenta necessidade de recursos assistivos para mobilidade funcional?", simples: "Seu filho precisa ou pode precisar de andador, cadeira de rodas, órteses ou outros equipamentos para se movimentar?" },
  { code: "FI10", tipo: "clinica", grupo: "Fisioterapia", titulo: "Regressão motora", tecnica: "A criança apresentou perda de habilidades motoras previamente adquiridas?", simples: "Seu filho deixou de conseguir realizar algum movimento que antes fazia, como andar, ficar em pé ou sentar?" },
  { code: "PM01", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Esquema corporal", tecnica: "A criança apresenta dificuldades na percepção e organização do esquema corporal?", simples: "Seu filho tem dificuldade para reconhecer ou utilizar diferentes partes do corpo durante brincadeiras e movimentos?" },
  { code: "PM02", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Organização espacial", tecnica: "A criança apresenta dificuldades de orientação e organização espacial?", simples: "Seu filho tem dificuldade para compreender posições como dentro, fora, em cima, embaixo ou ao lado, considerando sua idade?" },
  { code: "PM03", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Organização temporal", tecnica: "A criança apresenta dificuldades na percepção e organização temporal?", simples: "Seu filho tem dificuldade para compreender sequências como antes, depois, primeiro e último?" },
  { code: "PM04", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Coordenação bilateral", tecnica: "A criança apresenta dificuldades na coordenação motora bilateral?", simples: "Seu filho tem dificuldade para usar os dois lados do corpo de maneira coordenada durante as atividades?" },
  { code: "PM05", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Ritmo motor", tecnica: "A criança apresenta dificuldades de organização rítmica dos movimentos?", simples: "Seu filho tem dificuldade para acompanhar movimentos com ritmo, como bater palmas seguindo uma música?" },
  { code: "PM06", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Planejamento motor", tecnica: "A criança apresenta dificuldades na elaboração e execução de sequências motoras?", simples: "Seu filho tem dificuldade para organizar uma sequência de movimentos durante jogos ou brincadeiras?" },
  { code: "PM07", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Equilíbrio psicomotor", tecnica: "A criança apresenta dificuldades de equilíbrio durante atividades psicomotoras?", simples: "Seu filho tem dificuldade para realizar brincadeiras que exigem equilíbrio, como andar sobre uma linha?" },
  { code: "PM08", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Coordenação visuomotora", tecnica: "A criança apresenta dificuldades na integração visuomotora?", simples: "Seu filho tem dificuldade para coordenar o que vê com os movimentos das mãos, como encaixar peças ou acertar um alvo?" },
  { code: "PM09", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Organização motora", tecnica: "A criança apresenta dificuldades na organização de movimentos em atividades estruturadas?", simples: "Seu filho tem dificuldade para acompanhar brincadeiras com movimentos em determinada ordem?" },
  { code: "PM10", tipo: "clinica", grupo: "Psicomotricidade", titulo: "Participação psicomotora", tecnica: "A criança apresenta limitações na participação em atividades lúdicas que exigem habilidades psicomotoras?", simples: "Seu filho deixa de participar de brincadeiras por ter dificuldades para coordenar ou organizar os movimentos?" },
  { code: "N01", tipo: "clinica", grupo: "Nutrição", titulo: "Seletividade alimentar", tecnica: "A criança apresenta repertório alimentar significativamente restrito?", simples: "Seu filho aceita poucos tipos de alimentos e recusa muitos outros?" },
  { code: "N02", tipo: "clinica", grupo: "Nutrição", titulo: "Aceitação de texturas", tecnica: "A criança apresenta dificuldades na aceitação de diferentes consistências alimentares?", simples: "Seu filho recusa alimentos por serem pastosos, crocantes, sólidos ou apresentarem determinadas texturas?" },
  { code: "N03", tipo: "clinica", grupo: "Nutrição", titulo: "Variedade alimentar", tecnica: "A criança apresenta baixa diversidade alimentar?", simples: "Seu filho tem dificuldade para consumir diferentes grupos de alimentos, como frutas, verduras, legumes ou proteínas?" },
  { code: "N04", tipo: "clinica", grupo: "Nutrição", titulo: "Recusa alimentar", tecnica: "A criança apresenta episódios persistentes de recusa alimentar?", simples: "Seu filho frequentemente se recusa a comer, mesmo quando os alimentos são oferecidos em condições habituais?" },
  { code: "N05", tipo: "clinica", grupo: "Nutrição", titulo: "Crescimento e peso", tecnica: "Existem preocupações relacionadas à evolução ponderal e ao crescimento da criança?", simples: "Você ou algum profissional percebeu perda de peso, dificuldade para ganhar peso ou alterações preocupantes no crescimento do seu filho?" },
  { code: "N06", tipo: "clinica", grupo: "Nutrição", titulo: "Condições nutricionais específicas", tecnica: "A criança apresenta condição clínica que exige acompanhamento nutricional específico?", simples: "Seu filho possui alguma doença ou condição de saúde que exige alimentação especial ou acompanhamento com nutricionista?" },
  { code: "N07", tipo: "clinica", grupo: "Nutrição", titulo: "Sintomas gastrointestinais", tecnica: "A criança apresenta sintomas gastrointestinais frequentes que interferem na alimentação?", simples: "Seu filho costuma apresentar vômitos, constipação, diarreia ou desconfortos que prejudicam sua alimentação?" },
  { code: "N08", tipo: "clinica", grupo: "Nutrição", titulo: "Rotina alimentar", tecnica: "A criança apresenta dificuldades importantes na organização e manutenção de uma rotina alimentar adequada?", simples: "Seu filho tem dificuldades frequentes para realizar as refeições ou manter uma rotina de alimentação?" },
  { code: "N09", tipo: "clinica", grupo: "Nutrição", titulo: "Necessidade de suporte alimentar", tecnica: "A criança necessita de adaptações ou suporte específico para manter alimentação nutricionalmente adequada?", simples: "Seu filho precisa de alguma adaptação, orientação ou cuidado especial para conseguir se alimentar adequadamente?" },
  { code: "N10", tipo: "clinica", grupo: "Nutrição", titulo: "Impacto nutricional", tecnica: "As dificuldades alimentares da criança apresentam repercussões relevantes na saúde ou no desenvolvimento?", simples: "As dificuldades para comer têm prejudicado a saúde, o crescimento ou as atividades diárias do seu filho?" },
  { code: "S01", tipo: "social", grupo: "Sociofamiliar", titulo: "Renda familiar", tecnica: "Qual é a condição socioeconômica familiar, considerando renda e composição domiciliar?", simples: "Quantas pessoas moram na sua casa e qual é, aproximadamente, a renda mensal total da família?" },
  { code: "S02", tipo: "social", grupo: "Sociofamiliar", titulo: "Benefícios socioassistenciais", tecnica: "A família possui acesso a benefícios socioassistenciais?", simples: "Sua família recebe Bolsa Família, BPC ou algum outro benefício social?" },
  { code: "S03", tipo: "social", grupo: "Sociofamiliar", titulo: "Transporte e acessibilidade", tecnica: "A família apresenta barreiras de transporte para acesso aos serviços terapêuticos?", simples: "Você tem dificuldade para trazer seu filho às terapias por falta de transporte, dinheiro para passagem ou transporte adaptado?" },
  { code: "S04", tipo: "social", grupo: "Sociofamiliar", titulo: "Interrupção terapêutica", tecnica: "A criança apresentou interrupção ou ausência de tratamento por barreiras socioeconômicas?", simples: "Seu filho já precisou parar ou deixar de fazer terapias por falta de dinheiro, transporte ou outras dificuldades de acesso?" },
  { code: "S05", tipo: "social", grupo: "Sociofamiliar", titulo: "Rede de apoio", tecnica: "A família apresenta insuficiência de rede de apoio para o acompanhamento da criança?", simples: "Quando você precisa de ajuda para levar seu filho às consultas ou cuidar dele, tem alguém com quem possa contar?" },
  { code: "S06", tipo: "social", grupo: "Sociofamiliar", titulo: "Acesso a recursos essenciais", tecnica: "A família apresenta dificuldades financeiras para garantir recursos essenciais relacionados à deficiência?", simples: "Sua família tem dificuldade para conseguir medicamentos, alimentação, fraldas, equipamentos ou outros itens necessários aos cuidados do seu filho?" },
  { code: "PR01", tipo: "prioridade", grupo: "Prioridades", titulo: "Regressão funcional", tecnica: "A criança apresentou perda recente de habilidades funcionais previamente adquiridas?", simples: "Seu filho deixou de fazer alguma coisa importante que antes conseguia, como andar, falar ou realizar atividades sozinho?" },
  { code: "PR02", tipo: "prioridade", grupo: "Prioridades", titulo: "Risco de autoagressão", tecnica: "A criança apresenta comportamentos autoagressivos com risco significativo de lesão?", simples: "Seu filho se machuca de maneira intensa ou frequente, colocando sua segurança em risco?" },
  { code: "PR03", tipo: "prioridade", grupo: "Prioridades", titulo: "Risco de agressão a terceiros", tecnica: "A criança apresenta comportamentos agressivos que oferecem risco significativo de lesão a outras pessoas?", simples: "Seu filho apresenta agressividade intensa que pode machucar seriamente outras pessoas?" },
  { code: "PR04", tipo: "prioridade", grupo: "Prioridades", titulo: "Comprometimento da mobilidade", tecnica: "A criança apresenta limitações motoras graves que comprometem sua mobilidade funcional?", simples: "Seu filho apresenta dificuldade muito importante para se movimentar ou mudar de posição?" },
  { code: "PR05", tipo: "prioridade", grupo: "Prioridades", titulo: "Alterações importantes de alimentação e deglutição", tecnica: "A criança apresenta sinais de comprometimento alimentar ou de deglutição com possível repercussão clínica?", simples: "Seu filho apresenta engasgos importantes, dificuldades graves para engolir ou problemas para conseguir se alimentar?" },
  { code: "PR06", tipo: "prioridade", grupo: "Prioridades", titulo: "Dependência funcional significativa", tecnica: "A criança apresenta elevado grau de dependência funcional para atividades essenciais?", simples: "Seu filho precisa de muita ajuda para realizar atividades essenciais do dia a dia, considerando sua idade?" },
  { code: "PR07", tipo: "prioridade", grupo: "Prioridades", titulo: "Agravamento recente", tecnica: "A criança apresentou piora clínica ou funcional significativa recentemente?", simples: "Você percebeu que a saúde, os movimentos, a comunicação ou as dificuldades do seu filho pioraram bastante nos últimos tempos?" },
  { code: "PR08", tipo: "prioridade", grupo: "Prioridades", titulo: "Desregulação comportamental intensa", tecnica: "A criança apresenta episódios de desregulação comportamental que comprometem significativamente sua segurança ou participação?", simples: "Seu filho apresenta crises muito intensas que impedem atividades importantes ou colocam sua segurança em risco?" },
  { code: "PR09", tipo: "prioridade", grupo: "Prioridades", titulo: "Barreiras graves de acesso", tecnica: "A criança apresenta barreiras importantes que comprometem o acesso a cuidados essenciais?", simples: "Existe alguma dificuldade muito séria que esteja impedindo seu filho de receber os cuidados de saúde de que precisa?" },
  { code: "PR10", tipo: "prioridade", grupo: "Prioridades", titulo: "Prejuízo funcional significativo", tecnica: "A criança apresenta comprometimento funcional relevante que prejudica sua participação nas atividades essenciais?", simples: "As dificuldades do seu filho estão impedindo que ele realize atividades importantes, como se alimentar, se movimentar, se comunicar ou participar da rotina?" },
];

/** `num` = número mostrado no botão (estilo ABC); NS/NA/PNI não têm número e não somam. */
export type Opcao = { valor: string; label: string; pontos?: number; num?: string };

// Escala de frequência dos itens clínicos. "Não sei" e "Não se aplica" não
// contam como ausência de necessidade: ficam fora da soma e são sinalizados.
export const OPCOES_CLINICA: Opcao[] = [
  { valor: "0", label: "Nunca", pontos: 0, num: "0" },
  { valor: "1", label: "Raramente", pontos: 1, num: "1" },
  { valor: "2", label: "Frequentemente", pontos: 2, num: "2" },
  { valor: "3", label: "Sempre", pontos: 3, num: "3" },
  { valor: "ns", label: "Não sei informar", num: "NS" },
  { valor: "na", label: "Não se aplica", num: "NA" },
];

export const OPCOES_PRIORIDADE: Opcao[] = [
  { valor: "nao", label: "Não", num: "0" },
  { valor: "sim", label: "Sim", num: "1" },
  { valor: "ns", label: "Não sei informar", num: "NS" },
];

export const OPCOES_SOCIAL: Opcao[] = [
  { valor: "nao", label: "Não", num: "0" },
  { valor: "as_vezes", label: "Às vezes / em parte", num: "1" },
  { valor: "sim", label: "Sim", num: "2" },
  { valor: "pni", label: "Prefere não informar", num: "PNI" },
];

// S05 é invertida: "tem com quem contar" = sem barreira.
export const OPCOES_S05: Opcao[] = [
  { valor: "sim_sempre", label: "Sim, sempre", num: "0" },
  { valor: "as_vezes", label: "Às vezes", num: "1" },
  { valor: "ninguem", label: "Não tenho com quem contar", num: "2" },
  { valor: "pni", label: "Prefere não informar", num: "PNI" },
];

export const FAIXAS_RENDA: Opcao[] = [
  { valor: "ate_1", label: "Até 1 salário mínimo" },
  { valor: "1_2", label: "De 1 a 2 salários mínimos" },
  { valor: "2_3", label: "De 2 a 3 salários mínimos" },
  { valor: "acima_3", label: "Mais de 3 salários mínimos" },
  { valor: "pni", label: "Prefere não informar" },
];

export const BENEFICIOS = ["Bolsa Família", "BPC/LOAS", "Outro"] as const;

export type Respostas86 = Record<string, string>;
export type Social86 = { moradores?: number | null; renda?: string | null; beneficio?: string | null; beneficioTipo?: string | null };

export function opcoesDe(it: Item86): Opcao[] {
  if (it.tipo === "clinica") return OPCOES_CLINICA;
  if (it.tipo === "prioridade") return OPCOES_PRIORIDADE;
  if (it.code === "S05") return OPCOES_S05;
  return OPCOES_SOCIAL;
}

export type AreaResultado = { area: string; pontos: number; respondidas: number; naoSei: number; naoAplica: number; pct: number };
export type Resultado86 = {
  areas: AreaResultado[];
  prioridades: { code: string; titulo: string }[];
  prioridadesNaoSei: number;
  social: { code: string; titulo: string; intensidade: "parcial" | "sim" }[];
  socialNaoInformado: number;
  faltando: string[];
};

export function calcularResultado86(r: Respostas86, s: Social86): Resultado86 {
  const areas = AREAS_86.map((area) => {
    const its = ITENS_86.filter((i) => i.tipo === "clinica" && i.grupo === area);
    let pontos = 0, respondidas = 0, naoSei = 0, naoAplica = 0;
    for (const i of its) {
      const v = r[i.code];
      if (v === "ns") naoSei++;
      else if (v === "na") naoAplica++;
      else if (v != null && v !== "") { pontos += Number(v); respondidas++; }
    }
    return { area, pontos, respondidas, naoSei, naoAplica, pct: respondidas ? Math.round((pontos / (respondidas * 3)) * 100) : 0 };
  });
  const prioridades = ITENS_86.filter((i) => i.tipo === "prioridade" && r[i.code] === "sim").map((i) => ({ code: i.code, titulo: i.titulo }));
  const prioridadesNaoSei = ITENS_86.filter((i) => i.tipo === "prioridade" && r[i.code] === "ns").length;
  const social: Resultado86["social"] = [];
  let socialNaoInformado = 0;
  for (const i of ITENS_86.filter((x) => x.tipo === "social")) {
    if (i.code === "S01") {
      if (s.renda === "pni") socialNaoInformado++;
      else if (s.renda === "ate_1" && (s.moradores ?? 0) >= 3) social.push({ code: i.code, titulo: i.titulo, intensidade: "sim" });
      continue;
    }
    if (i.code === "S02") { if (s.beneficio === "pni") socialNaoInformado++; continue; }
    const v = r[i.code];
    if (v === "pni") socialNaoInformado++;
    else if (v === "sim" || v === "ninguem") social.push({ code: i.code, titulo: i.titulo, intensidade: "sim" });
    else if (v === "as_vezes") social.push({ code: i.code, titulo: i.titulo, intensidade: "parcial" });
  }
  const faltando = ITENS_86.filter((i) => {
    if (i.code === "S01") return !s.renda;
    if (i.code === "S02") return !s.beneficio;
    return !r[i.code];
  }).map((i) => i.code);
  return { areas, prioridades, prioridadesNaoSei, social, socialNaoInformado, faltando };
}

export const AVISO_TRIAGEM =
  "A triagem é orientativa: não estabelece diagnóstico nem substitui a avaliação profissional.";
export const ALERTA_RISCO =
  "Sinal de risco: orientar encaminhamento conforme o protocolo de saúde (urgência/rede), não apenas aguardar a fila.";
/** Alerta de risco: passa na frente da alternância por idade na fila (0130). */
export const RISCO_CODES = ["PR01", "PR02", "PR03", "PR05", "PR08"];

/** Faixa por área (0–30), igual à triagem anterior: 0–8 baixa, 9–17 moderada, 18–30 alta. */
export function nivelArea86(pontos: number, respondidas: number): { label: string; hex: string; sugerir: boolean } | null {
  if (!respondidas) return null;
  if (pontos <= 8) return { label: "Baixa sinalização", hex: "#10b981", sugerir: false };
  if (pontos <= 17) return { label: "Sinalização moderada", hex: "#f59e0b", sugerir: true };
  return { label: "Alta sinalização", hex: "#f43f5e", sugerir: true };
}

/** Sugestões de encaminhamento (orientativas; a equipe valida cada uma). */
export function sugestoes86(r: Resultado86): string[] {
  const out: string[] = [];
  if (r.prioridades.some((p) => RISCO_CODES.includes(p.code))) out.push(ALERTA_RISCO);
  const areas = r.areas
    .map((a) => ({ a, n: nivelArea86(a.pontos, a.respondidas) }))
    .filter((x) => x.n?.sugerir)
    .sort((x, y) => y.a.pontos - x.a.pontos);
  for (const { a, n } of areas) out.push(`Avaliação em ${a.area} (${a.pontos}/30 · ${n!.label.toLowerCase()}).`);
  if (r.prioridades.length) out.push(`Avaliação técnica prioritária: ${r.prioridades.map((p) => p.titulo.toLowerCase()).join("; ")}.`);
  if (r.social.length) out.push(`Orientar serviço social / CRAS: ${r.social.map((s) => s.titulo.toLowerCase()).join("; ")}.`);
  if (!out.length) out.push("Sem sinalização relevante nesta triagem: seguir fluxo regular.");
  return out;
}

/** Mínimo de pontos (0–30) para a especialidade ser encaminhada à fila. */
export const ENCAMINHAR_MIN = 9;

/**
 * Prévia das especialidades que vão para a fila: todas as áreas com ≥ 9 pontos,
 * da maior para a menor pontuação. Mesma regra do servidor (migração 0130,
 * `_t86_encaminhar`); bebê com menos de 2 anos também entra na Fisioterapia.
 */
export function previaEncaminhamento86(r: Resultado86): string[] {
  return r.areas
    .map((a, i) => ({ a, i, pct: a.respondidas ? a.pontos / (a.respondidas * 3) : 0 }))
    .filter((x) => x.a.pontos >= ENCAMINHAR_MIN)
    .sort((x, y) => y.a.pontos - x.a.pontos || y.pct - x.pct || x.i - y.i)
    .map((x) => x.a.area);
}

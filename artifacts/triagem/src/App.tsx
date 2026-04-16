import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, useParams } from "wouter";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { API_BASE as API } from "@/lib/api";

// ─── WHITE LABEL CONFIG ──────────────────────────────────────────────────────
export const CLINIC_CONFIG = {
  name: "NFs – Triagem Multidisciplinar",
  subtitle: "Avaliação multidisciplinar para crianças e adolescentes (0–18 anos)",
  copyright: "© 2026 NFs – Triagem Multidisciplinar",
  // logoUrl: "/logo.png",
};
// ─────────────────────────────────────────────────────────────────────────────

type Pergunta = { area: string; pergunta: string; explicacao: string };

const AREAS = [
  "Psicológico", "Psicomotricidade", "Fisioterapia", "Terapia Ocupacional",
  "Fonoaudiologia", "Nutrição", "Psicopedagogia", "Educação Física",
];

const AREA_ICONS: Record<string, string> = {
  "Psicológico": "🧠", "Psicomotricidade": "🏃", "Fisioterapia": "💪",
  "Terapia Ocupacional": "🤲", "Fonoaudiologia": "💬",
  "Nutrição": "🥗", "Psicopedagogia": "📚", "Educação Física": "⚽",
};

const AREA_COLORS: Record<string, string> = {
  "Psicológico": "#a855f7", "Psicomotricidade": "#6366f1", "Fisioterapia": "#f97316",
  "Terapia Ocupacional": "#14b8a6", "Fonoaudiologia": "#3b82f6",
  "Nutrição": "#22c55e", "Psicopedagogia": "#eab308", "Educação Física": "#f43f5e",
};

const SHORT_NAMES: Record<string, string> = {
  "Psicológico": "Psicol.", "Psicomotricidade": "Psicomotr.",
  "Fisioterapia": "Fisio.", "Terapia Ocupacional": "T. Ocup.",
  "Fonoaudiologia": "Fono.", "Nutrição": "Nutrição",
  "Psicopedagogia": "Psicoped.", "Educação Física": "Ed. Física",
};

const PERGUNTAS: Pergunta[] = [
  // ── PSICOLÓGICO (15)
  { area: "Psicológico", pergunta: "Déficit de atenção sustentada", explicacao: "Dificuldade de manter o foco por períodos esperados para a idade" },
  { area: "Psicológico", pergunta: "Ansiedade frequente", explicacao: "Fica muito nervoso, agitado ou preocupado sem causa aparente" },
  { area: "Psicológico", pergunta: "Baixa autoestima", explicacao: "Demonstra insegurança ou se deprecia com frequência" },
  { area: "Psicológico", pergunta: "Humor instável", explicacao: "Mudanças bruscas de humor sem causa aparente" },
  { area: "Psicológico", pergunta: "Medos excessivos ou fobias", explicacao: "Medo intenso e desproporcional de situações específicas" },
  { area: "Psicológico", pergunta: "Dificuldade em lidar com frustração", explicacao: "Reações intensas quando não consegue o que quer" },
  { area: "Psicológico", pergunta: "Isolamento social", explicacao: "Evita interações com outras pessoas sem razão aparente" },
  { area: "Psicológico", pergunta: "Comportamento opositor desafiante", explicacao: "Recusa persistente em seguir regras ou desafia autoridades" },
  { area: "Psicológico", pergunta: "Impulsividade", explicacao: "Age sem pensar ou interrompe situações com frequência" },
  { area: "Psicológico", pergunta: "Comportamentos repetitivos ou estereotipados", explicacao: "Movimentos ou ações repetidas sem função aparente" },
  { area: "Psicológico", pergunta: "Dificuldade de reconhecimento emocional", explicacao: "Não identifica as próprias emoções ou as dos outros adequadamente" },
  { area: "Psicológico", pergunta: "Padrões de sono alterados", explicacao: "Dificuldade para dormir, acorda com frequência ou dorme em excesso" },
  { area: "Psicológico", pergunta: "Enurese ou encoprese", explicacao: "Molha a cama ou tem acidentes intestinais além do esperado para a faixa etária" },
  { area: "Psicológico", pergunta: "Comportamento autolesivo", explicacao: "Bate, morde ou machuca a si mesmo sem intenção de suicídio" },
  { area: "Psicológico", pergunta: "Somatização frequente", explicacao: "Queixas físicas (dor de cabeça, barriga) sem causa médica identificada" },
  // ── PSICOMOTRICIDADE (15)
  { area: "Psicomotricidade", pergunta: "Dificuldade de coordenação motora global", explicacao: "Problemas para correr, pular ou realizar movimentos amplos" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de equilíbrio estático", explicacao: "Dificuldade para ficar parado em uma posição sem se desequilibrar" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de equilíbrio dinâmico", explicacao: "Desequilíbrio ao caminhar, subir escadas ou mudar de direção" },
  { area: "Psicomotricidade", pergunta: "Dificuldade com lateralidade", explicacao: "Confunde direita/esquerda; lateralidade não definida para a idade" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de estruturação espaço-temporal", explicacao: "Não organiza adequadamente o espaço ao redor ou a noção de tempo" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de ritmo e coordenação rítmica", explicacao: "Não consegue acompanhar ritmos musicais ou sequências motoras" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de esquema corporal", explicacao: "Não reconhece ou nomeia partes do corpo adequadamente" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de dissociação de movimentos", explicacao: "Não consegue mover uma parte do corpo de forma independente das demais" },
  { area: "Psicomotricidade", pergunta: "Tonicidade inadequada para a tarefa", explicacao: "Usa força excessiva ou insuficiente em atividades motoras" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de expressão corporal", explicacao: "Corpo rígido, pouco expressivo ou com movimentos estereotipados" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de grafomotricidade", explicacao: "Traço muito fraco, forte ou irregular ao escrever e desenhar" },
  { area: "Psicomotricidade", pergunta: "Hipotonia generalizada", explicacao: "Corpo mole e cansado; postura excessivamente relaxada" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de percepção tátil", explicacao: "Não identifica objetos pelo toque ou tem reações excessivas ao contato físico" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de projeção espacial", explicacao: "Não calcula distâncias ao pular, escalar ou alcançar objetos" },
  { area: "Psicomotricidade", pergunta: "Dificuldade de sequência motora", explicacao: "Não consegue reproduzir sequências de movimentos demonstrados" },
  // ── FISIOTERAPIA (15)
  { area: "Fisioterapia", pergunta: "Atraso no desenvolvimento motor global", explicacao: "Demora a rolar, sentar, engatinhar ou andar conforme o esperado" },
  { area: "Fisioterapia", pergunta: "Tônus muscular alterado", explicacao: "Músculos muito flácidos (hipotonia) ou muito rígidos (hipertonia)" },
  { area: "Fisioterapia", pergunta: "Desvio postural", explicacao: "Escoliose, cifose, lordose excessiva ou outras alterações posturais" },
  { area: "Fisioterapia", pergunta: "Dor músculo-esquelética recorrente", explicacao: "Queixas frequentes de dor em articulações ou músculos" },
  { area: "Fisioterapia", pergunta: "Limitação de amplitude de movimento", explicacao: "Dificuldade de movimentar articulações em sua amplitude normal" },
  { area: "Fisioterapia", pergunta: "Marcha atípica", explicacao: "Forma de andar diferente do esperado para a idade (ex.: ponta dos pés)" },
  { area: "Fisioterapia", pergunta: "Fadiga muscular precoce", explicacao: "Cansa facilmente durante atividades físicas habituais" },
  { area: "Fisioterapia", pergunta: "Alterações respiratórias funcionais", explicacao: "Respiração alterada que compromete a função motora ou resistência" },
  { area: "Fisioterapia", pergunta: "Dificuldade de subir/descer escadas", explicacao: "Precisa de apoio ou evita escadas além do esperado para a idade" },
  { area: "Fisioterapia", pergunta: "Histórico de fraturas ou lesões frequentes", explicacao: "Fraturas, entorses ou lesões musculares recorrentes" },
  { area: "Fisioterapia", pergunta: "Dor postural recorrente", explicacao: "Queixas de dor nas costas, pescoço ou membros por postura inadequada" },
  { area: "Fisioterapia", pergunta: "Contraturas musculares", explicacao: "Músculos encurtados que limitam a mobilidade habitual" },
  { area: "Fisioterapia", pergunta: "Fraqueza nos membros", explicacao: "Força reduzida em braços ou pernas comparada com a faixa etária" },
  { area: "Fisioterapia", pergunta: "Lentidão em reabilitação", explicacao: "Recuperação anormalmente lenta após lesões ou procedimentos" },
  { area: "Fisioterapia", pergunta: "Uso de órteses ou próteses", explicacao: "Uso atual ou anterior de aparelhos de suporte motor" },
  // ── TERAPIA OCUPACIONAL (15)
  { area: "Terapia Ocupacional", pergunta: "Dificuldade na coordenação motora fina", explicacao: "Dificuldade com recortar, escrever, montar ou encaixar objetos pequenos" },
  { area: "Terapia Ocupacional", pergunta: "Hipersensibilidade sensorial", explicacao: "Reação excessiva a texturas, sons, luzes ou odores" },
  { area: "Terapia Ocupacional", pergunta: "Hiposensibilidade sensorial", explicacao: "Baixa resposta a estímulos sensoriais; busca por sensações intensas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade nas atividades de vida diária", explicacao: "Problemas para se vestir, alimentar ou higienizar de forma independente" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade em planejar ou executar movimentos (Ex: usar tesoura, pular, abotoar ou imitar gestos)", explicacao: "Não consegue sequenciar ou planejar movimentos para executar tarefas" },
  { area: "Terapia Ocupacional", pergunta: "Resistência a brincadeiras ou atividades lúdicas", explicacao: "Evita jogar ou participar de atividades próprias da idade" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de organização do espaço e materiais", explicacao: "Dificuldade em organizar o ambiente, mochila ou mesa de trabalho" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de concentração em tarefas manuais", explicacao: "Abandona rapidamente atividades que exigem atenção e uso das mãos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade com brincadeiras simbólicas", explicacao: "Não realiza jogo de faz de conta ou uso simbólico de objetos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de adaptação a mudanças de rotina", explicacao: "Reage mal a novas rotinas, ambientes ou mudanças inesperadas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade com utensílios", explicacao: "Não segura talheres, tesoura ou lápis de forma funcional para a idade" },
  { area: "Terapia Ocupacional", pergunta: "Comportamento autoestimulatório", explicacao: "Balanceio, estalar de dedos ou movimentos sensoriais repetidos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de regulação sensorial", explicacao: "Oscila entre busca e fuga de estímulos de modo prejudicial" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de higiene independente", explicacao: "Precisa de ajuda para escovar os dentes, banhar-se ou pentear acima do esperado" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de adaptação ambiental", explicacao: "Reage excessivamente a ruídos, luzes ou locais diferentes do habitual" },
  // ── FONOAUDIOLOGIA (15)
  { area: "Fonoaudiologia", pergunta: "Atraso na fala", explicacao: "Demora para falar ou se comunicar adequadamente para a idade" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de articulação", explicacao: "Troca ou omite sons na fala de forma frequente" },
  { area: "Fonoaudiologia", pergunta: "Gagueira ou disfluência", explicacao: "Repetições, prolongamentos ou bloqueios na fala" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de compreensão oral", explicacao: "Não entende comandos ou histórias de acordo com a idade" },
  { area: "Fonoaudiologia", pergunta: "Voz alterada", explicacao: "Voz muito aguda, grave, rouca ou nasal sem causa médica aparente" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de mastigação ou deglutição", explicacao: "Problemas para mastigar ou engolir alimentos adequadamente" },
  { area: "Fonoaudiologia", pergunta: "Respiração oral", explicacao: "Respira predominantemente pela boca em vez do nariz" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de leitura e escrita", explicacao: "Problemas para decodificar letras, sílabas ou palavras" },
  { area: "Fonoaudiologia", pergunta: "Vocabulário reduzido para a idade", explicacao: "Usa poucas palavras para se expressar em relação à faixa etária" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de organização do discurso", explicacao: "Não consegue narrar ou organizar uma sequência de ideias" },
  { area: "Fonoaudiologia", pergunta: "Ausência de linguagem funcional", explicacao: "Não usa palavras para comunicar necessidades básicas no cotidiano" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de pragmática", explicacao: "Não sabe iniciar, manter ou encerrar uma conversa adequadamente" },
  { area: "Fonoaudiologia", pergunta: "Funções comunicativas restritas", explicacao: "Só pede ou rejeita; não comenta, narra ou questiona" },
  { area: "Fonoaudiologia", pergunta: "Alteração de nasalidade", explicacao: "Voz com timbre nasal excessivo (hipernasalidade) ou insuficiente (hiponasalidade)" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de segmentação silábica", explicacao: "Não identifica ou separa as sílabas de palavras ao ler ou escrever" },
  // ── NUTRIÇÃO (15)
  { area: "Nutrição", pergunta: "Seletividade alimentar intensa", explicacao: "Recusa grande variedade de alimentos por textura, cor ou sabor" },
  { area: "Nutrição", pergunta: "Baixo peso ou sobrepeso para a idade", explicacao: "Peso significativamente abaixo ou acima do esperado para a faixa etária" },
  { area: "Nutrição", pergunta: "Baixa ingestão de frutas e vegetais", explicacao: "Come muito poucas frutas ou verduras no dia a dia" },
  { area: "Nutrição", pergunta: "Consumo excessivo de ultraprocessados", explicacao: "Alimentação baseada em fast food, salgadinhos, refrigerantes" },
  { area: "Nutrição", pergunta: "Dificuldade de mastigação por questão alimentar", explicacao: "Evita alimentos sólidos ou duros por dificuldade de mastigar" },
  { area: "Nutrição", pergunta: "Baixa ingestão de água", explicacao: "Bebe quantidades insuficientes de água durante o dia" },
  { area: "Nutrição", pergunta: "Queixas frequentes de dor abdominal ou constipação", explicacao: "Dores de barriga, intestino preso ou diarreias frequentes" },
  { area: "Nutrição", pergunta: "Fadiga ou cansaço associado à alimentação", explicacao: "Cansa muito após as refeições ou tem baixa energia ao longo do dia" },
  { area: "Nutrição", pergunta: "Anemia ou deficiência nutricional diagnosticada", explicacao: "Histórico de anemia, falta de vitaminas ou minerais importantes" },
  { area: "Nutrição", pergunta: "Alimentação sem horários regulares", explicacao: "Não tem rotina alimentar estabelecida; pula refeições com frequência" },
  { area: "Nutrição", pergunta: "Recusa de novas consistências", explicacao: "Não aceita alimentos em texturas diferentes das habituais" },
  { area: "Nutrição", pergunta: "Consumo excessivo de açúcar", explicacao: "Preferência acentuada por alimentos muito doces com frequência diária" },
  { area: "Nutrição", pergunta: "Rituais alimentares rígidos", explicacao: "Come os mesmos alimentos, no mesmo prato ou mesma ordem sem flexibilidade" },
  { area: "Nutrição", pergunta: "Déficit de micronutrientes", explicacao: "Exames indicando deficiência de ferro, zinco, vitamina D ou outros nutrientes" },
  { area: "Nutrição", pergunta: "Dificuldade no histórico de amamentação", explicacao: "Dificuldades de sucção, pega ou deglutição no período de amamentação" },
  // ── PSICOPEDAGOGIA (15)
  { area: "Psicopedagogia", pergunta: "Dificuldade de aprendizagem da leitura", explicacao: "Dificuldade em decodificar palavras, sílabas ou textos" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de aprendizagem da escrita", explicacao: "Letra ilegível, trocas, omissões ou inversões frequentes" },
  { area: "Psicopedagogia", pergunta: "Dificuldade em matemática", explicacao: "Dificuldade com contagem, operações ou conceitos numéricos" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de memória de trabalho", explicacao: "Esquece instruções recém dadas ou perde o fio das tarefas" },
  { area: "Psicopedagogia", pergunta: "Lentidão na execução de tarefas escolares", explicacao: "Demora muito mais do que os colegas para concluir atividades" },
  { area: "Psicopedagogia", pergunta: "Baixo rendimento acadêmico geral", explicacao: "Desempenho significativamente abaixo do esperado para a série/idade" },
  { area: "Psicopedagogia", pergunta: "Recusa escolar ou resistência às tarefas", explicacao: "Evita ir à escola ou realizar atividades de aprendizagem" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de raciocínio lógico", explicacao: "Problemas para sequenciar, classificar ou relacionar informações" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de generalização do aprendizado", explicacao: "Aprende algo mas não consegue aplicar em contextos diferentes" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de planejamento e organização escolar", explicacao: "Dificuldade em planejar, iniciar ou concluir tarefas acadêmicas" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de atenção seletiva", explicacao: "Não consegue focar ignorando estímulos distratores ao redor" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de orientação temporal", explicacao: "Não compreende conceitos de ontem, hoje, amanhã ou calendário escolar" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de transferência do aprendizado", explicacao: "Aprende a lição mas não aplica o conhecimento em situações reais" },
  { area: "Psicopedagogia", pergunta: "Ausência de motivação para aprender", explicacao: "Desinteresse persistente por qualquer tipo de atividade educacional" },
  { area: "Psicopedagogia", pergunta: "Dificuldade de resolução de problemas", explicacao: "Não consegue pensar em estratégias para superar desafios cotidianos" },
  // ── EDUCAÇÃO FÍSICA (15)
  { area: "Educação Física", pergunta: "Baixa resistência cardiovascular", explicacao: "Cansa muito rapidamente em atividades físicas leves ou moderadas" },
  { area: "Educação Física", pergunta: "Dificuldade em jogos coletivos", explicacao: "Não consegue participar adequadamente de esportes ou jogos em grupo" },
  { area: "Educação Física", pergunta: "Dificuldade de habilidades motoras esportivas", explicacao: "Dificuldade com chutar, arremessar, rebater ou quicar uma bola" },
  { area: "Educação Física", pergunta: "Recusa ou aversão à atividade física", explicacao: "Evita participar de aulas ou atividades físicas sem causa aparente" },
  { area: "Educação Física", pergunta: "Dificuldade de seguir regras de jogos", explicacao: "Não compreende ou não respeita as regras de brincadeiras e esportes" },
  { area: "Educação Física", pergunta: "Dificuldade de cooperação em equipe", explicacao: "Não consegue jogar em equipe, divide mal a bola ou isola-se" },
  { area: "Educação Física", pergunta: "Dificuldade de controle corporal em movimento", explicacao: "Colide com objetos/pessoas, quedas frequentes durante atividades" },
  { area: "Educação Física", pergunta: "Sedentarismo fora do ambiente escolar", explicacao: "Passa a maior parte do tempo sentado, sem atividades físicas" },
  { area: "Educação Física", pergunta: "Dificuldade de agilidade e velocidade de reação", explicacao: "Reage lentamente a estímulos em situações de jogo ou exercício" },
  { area: "Educação Física", pergunta: "Dificuldade de força muscular adequada para a idade", explicacao: "Força muscular abaixo do esperado para a faixa etária" },
  { area: "Educação Física", pergunta: "Dificuldade em atividades aquáticas", explicacao: "Medo excessivo ou incapacidade funcional em ambientes aquáticos" },
  { area: "Educação Física", pergunta: "Dificuldade de lateralidade esportiva", explicacao: "Não usa eficientemente o lado dominante em atividades esportivas" },
  { area: "Educação Física", pergunta: "Dificuldade de orientação espacial em quadra", explicacao: "Não se orienta adequadamente no espaço durante jogos e esportes coletivos" },
  { area: "Educação Física", pergunta: "Lesões esportivas frequentes", explicacao: "Lesões musculares ou articulares recorrentes durante atividades físicas" },
  { area: "Educação Física", pergunta: "Dificuldade de autocontrole emocional em jogo", explicacao: "Reações de raiva, choro ou abandono quando perde ou erra em atividades" },
];

const ESCALA = [
  { valor: 0, label: "0 – Não apresenta" },
  { valor: 1, label: "1 – Leve" },
  { valor: 2, label: "2 – Moderado" },
  { valor: 3, label: "3 – Frequente" },
];

const ESCOLARIDADE_OPTIONS = [
  "Não alfabetizado", "Ensino Fundamental Incompleto", "Ensino Fundamental Completo",
  "Ensino Médio Incompleto", "Ensino Médio Completo",
  "Ensino Superior Incompleto", "Ensino Superior Completo", "Pós-graduação",
];

const CORES_AREA: Record<string, string> = {
  "Psicológico": "bg-purple-950/60 text-purple-300 border-purple-700/50",
  "Psicomotricidade": "bg-indigo-950/60 text-indigo-300 border-indigo-700/50",
  "Fisioterapia": "bg-orange-950/60 text-orange-300 border-orange-700/50",
  "Terapia Ocupacional": "bg-teal-950/60 text-teal-300 border-teal-700/50",
  "Fonoaudiologia": "bg-blue-950/60 text-blue-300 border-blue-700/50",
  "Nutrição": "bg-green-950/60 text-green-300 border-green-700/50",
  "Psicopedagogia": "bg-yellow-950/60 text-yellow-300 border-yellow-700/50",
  "Educação Física": "bg-rose-950/60 text-rose-300 border-rose-700/50",
};

function classificar(pontos: number, max: number) {
  const pct = (pontos / max) * 100;
  if (pct <= 25) return { label: "Baixo indicativo", cor: "text-emerald-400", bg: "bg-emerald-950/50 border-emerald-700/50", hex: "#10b981" };
  if (pct <= 50) return { label: "Indício leve",     cor: "text-blue-400",    bg: "bg-blue-950/50 border-blue-700/50",       hex: "#3b82f6" };
  if (pct <= 75) return { label: "Indício moderado", cor: "text-amber-400",   bg: "bg-amber-950/50 border-amber-700/50",     hex: "#f59e0b" };
  return               { label: "Indício elevado",   cor: "text-rose-400",    bg: "bg-rose-950/50 border-rose-700/50",       hex: "#f43f5e" };
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type FormData = {
  respostas: number[];
  nomePaciente: string; dataNascimento: string; idade: string;
  nomeResponsavel: string; telefone: string; endereco: string;
  naturalidade: string; rg: string; cpf: string; sus: string;
  nomeMae: string; escolaridadeMae: string; profissaoMae: string;
  nomePai: string; escolaridadePai: string; profissaoPai: string;
  numIrmaos: string; tipoImovel: string;
  bolsaFamilia: boolean; bpc: boolean; pensao: boolean;
  auxilioDoenca: boolean; outrosAuxilios: string; rendaFamiliar: string;
  diagnostico: string; cid: string; cid11: string;
  medico: string; dataUltimaCons: string;
  cadeiraDeRodas: boolean; ortesesProteses: boolean; aparelhoAuditivo: boolean;
  medicacaoContinua: string; alergias: string; problemasSaude: string;
  tipoEscola: string; trabalhoPais: string; outroAtendimento: boolean;
  localAtendimento: string;
  tipoRegistro: string;
  profissional: string; especialidade: string;
};

type TriagemSalva = {
  id: number; nome: string; dataNascimento: string | null; idade: string | null;
  responsavel: string | null; telefone: string | null; endereco: string | null;
  naturalidade: string | null; rg: string | null; cpf: string | null; sus: string | null;
  nomeMae: string | null; escolaridadeMae: string | null; profissaoMae: string | null;
  nomePai: string | null; escolaridadePai: string | null; profissaoPai: string | null;
  numIrmaos: string | null; tipoImovel: string | null;
  bolsaFamilia: boolean | null; bpc: boolean | null;
  pensao: boolean | null; auxilioDoenca: boolean | null;
  outrosAuxilios: string | null; rendaFamiliar: string | null;
  diagnostico: string | null; cid: string | null; cid11: string | null;
  medico: string | null; dataUltimaCons: string | null;
  cadeiraDeRodas: boolean | null; ortesesProteses: boolean | null; aparelhoAuditivo: boolean | null;
  medicacaoContinua: string | null; alergias: string | null; problemasSaude: string | null;
  tipoEscola: string | null; trabalhoPais: string | null; outroAtendimento: boolean | null;
  localAtendimento: string | null;
  tipoRegistro: string | null;
  profissional: string | null; especialidade: string | null;
  data: string | null; resultado: string | null; respostas: string | null;
  createdAt: string;
};

function triSalvaToFormData(t: TriagemSalva): FormData {
  let respostas: number[] = Array(PERGUNTAS.length).fill(0);
  if (t.respostas) {
    try {
      const parsed = JSON.parse(t.respostas);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < Math.min(parsed.length, PERGUNTAS.length); i++)
          respostas[i] = Number(parsed[i]) || 0;
      }
    } catch { /* ignore */ }
  }
  return {
    respostas,
    nomePaciente: t.nome || "", dataNascimento: t.dataNascimento || "",
    idade: t.idade || "", nomeResponsavel: t.responsavel || "",
    telefone: t.telefone || "", endereco: t.endereco || "",
    naturalidade: t.naturalidade || "", rg: t.rg || "",
    cpf: t.cpf || "", sus: t.sus || "",
    nomeMae: t.nomeMae || "", escolaridadeMae: t.escolaridadeMae || "",
    profissaoMae: t.profissaoMae || "", nomePai: t.nomePai || "",
    escolaridadePai: t.escolaridadePai || "", profissaoPai: t.profissaoPai || "",
    numIrmaos: t.numIrmaos || "", tipoImovel: t.tipoImovel || "",
    bolsaFamilia: !!t.bolsaFamilia, bpc: !!t.bpc,
    pensao: !!t.pensao, auxilioDoenca: !!t.auxilioDoenca,
    outrosAuxilios: t.outrosAuxilios || "", rendaFamiliar: t.rendaFamiliar || "",
    diagnostico: t.diagnostico || "", cid: t.cid || "", cid11: t.cid11 || "",
    medico: t.medico || "", dataUltimaCons: t.dataUltimaCons || "",
    cadeiraDeRodas: !!t.cadeiraDeRodas, ortesesProteses: !!t.ortesesProteses,
    aparelhoAuditivo: !!t.aparelhoAuditivo,
    medicacaoContinua: t.medicacaoContinua || "",
    alergias: t.alergias || "", problemasSaude: t.problemasSaude || "",
    tipoEscola: t.tipoEscola || "", trabalhoPais: t.trabalhoPais || "",
    outroAtendimento: t.outroAtendimento !== false,
    localAtendimento: t.localAtendimento || "",
    tipoRegistro: t.tipoRegistro || "Paciente da Unidade",
    profissional: t.profissional || "", especialidade: t.especialidade || "",
  };
}

// ─── PONTUAÇÃO DE VULNERABILIDADE ────────────────────────────────────────────

function parsePontosTotal(resultado: string | null): number {
  if (!resultado) return 0;
  return resultado.split(" | ").filter(Boolean).reduce((acc, item) => {
    const m = item.match(/: (\d+) pontos/);
    return acc + (m ? parseInt(m[1]) : 0);
  }, 0);
}

function calcVulnScore(t: {
  tipoEscola?: string | null; trabalhoPais?: string | null;
  bpc?: boolean | null; bolsaFamilia?: boolean | null; outroAtendimento?: boolean | null;
}): number {
  let score = 0;
  if (t.tipoEscola === "Municipal" || t.tipoEscola === "Estadual") score += 3;
  if (t.trabalhoPais === "Informal/Roça" || t.trabalhoPais === "Desempregado") score += 3;
  if (t.bpc || t.bolsaFamilia) score += 5;
  if (t.outroAtendimento === false) score += 5;
  return score;
}

function getPrioridadeBadge(vulnScore: number, clinicalPts: number) {
  const total = vulnScore + Math.round(clinicalPts / 8);
  if (total >= 35 || vulnScore >= 16) return { label: "Prioridade Máxima", cls: "bg-red-100 text-red-800 border-red-300", icon: "🔴" };
  if (total >= 20) return { label: "Alta Prioridade", cls: "bg-orange-100 text-orange-800 border-orange-300", icon: "🟠" };
  if (vulnScore >= 10) return { label: "Vulnerabilidade Social", cls: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "🟡" };
  return null;
}

// ─── HEADER ───────────────────────────────────────────────────────────────────

function Header({ page }: { page: "form" | "lista" | "dashboard" | "relatorio" }) {
  const navBtn = "px-4 py-1.5 rounded-xl text-white text-xs font-semibold transition-all duration-200 glass";
  return (
    <div className="header-gradient py-5 px-6 no-print">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #00d4ff22 0%, #7c3aed33 100%)", border: "1px solid rgba(0,212,255,0.3)" }}>
            🧩
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold text-white tracking-tight">{CLINIC_CONFIG.name}</h1>
            <p className="mt-0 text-white/50 text-xs hidden md:block">{CLINIC_CONFIG.subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          {page !== "dashboard" && <Link href="/dashboard" className={navBtn}>Dashboard</Link>}
          {page !== "lista" && page !== "form" && <Link href="/lista" className={navBtn}>Pacientes</Link>}
          {page !== "form" && <Link href="/" className={navBtn}>Nova Triagem</Link>}
          {page === "form" && <Link href="/lista" className={navBtn}>Ver Pacientes →</Link>}
        </div>
      </div>
    </div>
  );
}

// ─── GRÁFICO RADAR ────────────────────────────────────────────────────────────

function GraficoRadar({ porArea }: { porArea: { area: string; pct: number; nivel: ReturnType<typeof classificar> }[] }) {
  const data = porArea.map(({ area, pct }) => ({ area: SHORT_NAMES[area] ?? area, pct, fullMark: 100 }));
  const pctMedio = Math.round(porArea.reduce((a, b) => a + b.pct, 0) / porArea.length);
  const cor = pctMedio >= 65 ? "#f43f5e" : pctMedio >= 45 ? "#f59e0b" : pctMedio >= 25 ? "#3b82f6" : "#10b981";
  const gradId = `radar-grad-${cor.replace("#", "")}`;
  const CustomDot = (props: any) => {
    const { cx, cy, value } = props;
    if (!cx || !cy || value === 0) return null;
    return (
      <circle cx={cx} cy={cy} r={5} fill={cor} stroke="rgba(255,255,255,0.8)" strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 6px ${cor})` }} />
    );
  };
  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 24, right: 48, bottom: 24, left: 48 }}>
          <defs>
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={cor} stopOpacity={0.55} />
              <stop offset="70%" stopColor={cor} stopOpacity={0.18} />
              <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
            </radialGradient>
          </defs>
          <PolarGrid gridType="circle" stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis dataKey="area" tick={{ fontSize: 11, fontWeight: 700, fill: "rgba(255,255,255,0.7)" }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)" }} />
          <Radar name="Índice (%)" dataKey="pct"
            stroke={cor} strokeWidth={2.5}
            fill={`url(#${gradId})`} fillOpacity={1}
            dot={<CustomDot />}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── FORMULÁRIO ───────────────────────────────────────────────────────────────

function Formulario({ onSubmit, initialData }: { onSubmit: (f: FormData) => void; initialData?: FormData }) {
  const b = initialData;
  const [respostas, setRespostas] = useState<number[]>(b?.respostas ?? Array(PERGUNTAS.length).fill(0));
  const [nomePaciente, setNomePaciente] = useState(b?.nomePaciente ?? "");
  const [dataNascimento, setDataNascimento] = useState(b?.dataNascimento ?? "");
  const [idade, setIdade] = useState(b?.idade ?? "");
  const [nomeResponsavel, setNomeResponsavel] = useState(b?.nomeResponsavel ?? "");
  const [telefone, setTelefone] = useState(b?.telefone ?? "");
  const [endereco, setEndereco] = useState(b?.endereco ?? "");
  const [naturalidade, setNaturalidade] = useState(b?.naturalidade ?? "");
  const [rg, setRg] = useState(b?.rg ?? "");
  const [cpf, setCpf] = useState(b?.cpf ?? "");
  const [sus, setSus] = useState(b?.sus ?? "");
  const [nomeMae, setNomeMae] = useState(b?.nomeMae ?? "");
  const [escolaridadeMae, setEscolaridadeMae] = useState(b?.escolaridadeMae ?? "");
  const [profissaoMae, setProfissaoMae] = useState(b?.profissaoMae ?? "");
  const [nomePai, setNomePai] = useState(b?.nomePai ?? "");
  const [escolaridadePai, setEscolaridadePai] = useState(b?.escolaridadePai ?? "");
  const [profissaoPai, setProfissaoPai] = useState(b?.profissaoPai ?? "");
  const [numIrmaos, setNumIrmaos] = useState(b?.numIrmaos ?? "");
  const [tipoImovel, setTipoImovel] = useState(b?.tipoImovel ?? "");
  const [bolsaFamilia, setBolsaFamilia] = useState(b?.bolsaFamilia ?? false);
  const [bpc, setBpc] = useState(b?.bpc ?? false);
  const [pensao, setPensao] = useState(b?.pensao ?? false);
  const [auxilioDoenca, setAuxilioDoenca] = useState(b?.auxilioDoenca ?? false);
  const [outrosAuxilios, setOutrosAuxilios] = useState(b?.outrosAuxilios ?? "");
  const [rendaFamiliar, setRendaFamiliar] = useState(b?.rendaFamiliar ?? "");
  const [diagnostico, setDiagnostico] = useState(b?.diagnostico ?? "");
  const [cid, setCid] = useState(b?.cid ?? "");
  const [cid11, setCid11] = useState(b?.cid11 ?? "");
  const [medico, setMedico] = useState(b?.medico ?? "");
  const [dataUltimaCons, setDataUltimaCons] = useState(b?.dataUltimaCons ?? "");
  const [cadeiraDeRodas, setCadeiraDeRodas] = useState(b?.cadeiraDeRodas ?? false);
  const [ortesesProteses, setOrtesesProteses] = useState(b?.ortesesProteses ?? false);
  const [aparelhoAuditivo, setAparelhoAuditivo] = useState(b?.aparelhoAuditivo ?? false);
  const [medicacaoContinua, setMedicacaoContinua] = useState(b?.medicacaoContinua ?? "");
  const [alergias, setAlergias] = useState(b?.alergias ?? "");
  const [problemasSaude, setProblemasSaude] = useState(b?.problemasSaude ?? "");
  const [tipoEscola, setTipoEscola] = useState(b?.tipoEscola ?? "");
  const [trabalhoPais, setTrabalhoPais] = useState(b?.trabalhoPais ?? "");
  const [outroAtendimento, setOutroAtendimento] = useState(b?.outroAtendimento ?? true);
  const [localAtendimento, setLocalAtendimento] = useState(b?.localAtendimento ?? "");
  const [tipoRegistro, setTipoRegistro] = useState(b?.tipoRegistro ?? "Paciente da Unidade");
  const [profissional, setProfissional] = useState(b?.profissional ?? "");
  const [areaAtiva, setAreaAtiva] = useState(AREAS[0]);

  const perguntasDaArea = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === areaAtiva);
  const areaIdx = AREAS.indexOf(areaAtiva);
  const fc = "w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 bg-secondary text-foreground placeholder:text-muted-foreground transition-colors";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      respostas, nomePaciente, dataNascimento, idade, nomeResponsavel,
      telefone, endereco, naturalidade, rg, cpf, sus,
      nomeMae, escolaridadeMae, profissaoMae, nomePai, escolaridadePai, profissaoPai,
      numIrmaos, tipoImovel, bolsaFamilia, bpc, pensao, auxilioDoenca, outrosAuxilios, rendaFamiliar,
      diagnostico, cid, cid11, medico, dataUltimaCons,
      cadeiraDeRodas, ortesesProteses, aparelhoAuditivo,
      medicacaoContinua, alergias, problemasSaude,
      tipoEscola, trabalhoPais, outroAtendimento,
      localAtendimento, tipoRegistro,
      profissional,
    });
  };

  const Sec = ({ title }: { title: string }) => (
    <h2 className="text-sm font-bold text-primary uppercase tracking-wide mb-3">{title}</h2>
  );
  const Chk = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
    </label>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header page="form" />
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

        {/* ── Tipo de Registro – Censo PCD ── */}
        <div className={`rounded-2xl border-2 p-5 ${tipoRegistro === "Registro Censo Municipal" ? "bg-violet-950/30 border-violet-500/60" : "bg-card border-primary/30"}`}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Tipo de Registro</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${tipoRegistro === "Paciente da Unidade" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
              <input type="radio" name="tipoRegistro" checked={tipoRegistro === "Paciente da Unidade"} onChange={() => setTipoRegistro("Paciente da Unidade")} className="accent-primary w-4 h-4" />
              <div>
                <p className="font-bold text-sm">Paciente da Unidade</p>
                <p className="text-xs text-muted-foreground">Atendimento regular na clínica</p>
              </div>
            </label>
            <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${tipoRegistro === "Registro Censo Municipal" ? "border-violet-500 bg-violet-950/30" : "border-border hover:border-violet-500/40"}`}>
              <input type="radio" name="tipoRegistro" checked={tipoRegistro === "Registro Censo Municipal"} onChange={() => setTipoRegistro("Registro Censo Municipal")} className="accent-primary w-4 h-4" />
              <div>
                <p className="font-bold text-sm">Registro Censo</p>
                <p className="text-xs text-muted-foreground">Mapeamento PCD</p>
              </div>
            </label>
          </div>
          {tipoRegistro === "Registro Censo Municipal" && (
            <div className="mt-3 p-3 bg-violet-900/20 rounded-xl border border-violet-500/30 text-xs text-violet-300 font-semibold">
              🏛️ Este registro conta para o Contador PCD e não gera fila de espera na clínica.
            </div>
          )}
        </div>

        {/* ── Dados Pessoais ── */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card space-y-6">
          <div>
            <Sec title="Dados do Paciente" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome completo *</label>
                <input required value={nomePaciente} onChange={e => setNomePaciente(e.target.value)} className={fc} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Data de Nascimento</label>
                <input type="date" value={dataNascimento} onChange={e => {
                  const val = e.target.value; setDataNascimento(val);
                  if (val) {
                    const nasc = new Date(val + "T12:00:00"), hoje = new Date();
                    let anos = hoje.getFullYear() - nasc.getFullYear();
                    const m = hoje.getMonth() - nasc.getMonth();
                    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
                    setIdade(anos + (anos === 1 ? " ano" : " anos"));
                  }
                }} className={fc} />
              </div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Idade</label>
                <input value={idade} onChange={e => setIdade(e.target.value)} className={fc} placeholder="Ex.: 8 anos" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Responsável</label>
                <input value={nomeResponsavel} onChange={e => setNomeResponsavel(e.target.value)} className={fc} placeholder="Nome do responsável" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Telefone</label>
                <input value={telefone} onChange={e => setTelefone(e.target.value)} className={fc} placeholder="(00) 00000-0000" /></div>
            </div>
          </div>

          {/* Documentos */}
          <div className="pt-4 border-t border-border">
            <Sec title="Documentos e Localização" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">RG</label>
                <input value={rg} onChange={e => setRg(e.target.value)} className={fc} placeholder="Nº do RG" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">CPF</label>
                <input value={cpf} onChange={e => setCpf(e.target.value)} className={fc} placeholder="000.000.000-00" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Cartão SUS (CNS)</label>
                <input value={sus} onChange={e => setSus(e.target.value)} className={fc} placeholder="Nº do cartão SUS" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Naturalidade</label>
                <input value={naturalidade} onChange={e => setNaturalidade(e.target.value)} className={fc} placeholder="Cidade / Estado" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-semibold text-muted-foreground mb-1">Endereço</label>
                <input value={endereco} onChange={e => setEndereco(e.target.value)} className={fc} placeholder="Rua, número, bairro" /></div>
            </div>
          </div>

          {/* Núcleo Familiar */}
          <div className="pt-4 border-t border-border">
            <Sec title="Núcleo Familiar" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Nome da Mãe</label>
                <input value={nomeMae} onChange={e => setNomeMae(e.target.value)} className={fc} placeholder="Nome completo" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Escolaridade da Mãe</label>
                <select value={escolaridadeMae} onChange={e => setEscolaridadeMae(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {ESCOLARIDADE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Profissão da Mãe</label>
                <input value={profissaoMae} onChange={e => setProfissaoMae(e.target.value)} className={fc} placeholder="Profissão" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Nome do Pai</label>
                <input value={nomePai} onChange={e => setNomePai(e.target.value)} className={fc} placeholder="Nome completo" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Escolaridade do Pai</label>
                <select value={escolaridadePai} onChange={e => setEscolaridadePai(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {ESCOLARIDADE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Profissão do Pai</label>
                <input value={profissaoPai} onChange={e => setProfissaoPai(e.target.value)} className={fc} placeholder="Profissão" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Nº de Irmãos</label>
                <input type="number" min="0" value={numIrmaos} onChange={e => setNumIrmaos(e.target.value)} className={fc} placeholder="0" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Situação de Moradia</label>
                <select value={tipoImovel} onChange={e => setTipoImovel(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {["Próprio", "Alugado", "Cedido", "Abrigo / Instituição", "Área de risco"].map(o => <option key={o} value={o}>{o}</option>)}
                </select></div>
            </div>
          </div>

          {/* Contexto Socioeconômico — Vulnerabilidade */}
          <div className="pt-4 border-t border-border">
            <Sec title="Contexto Socioeconômico (Índice de Vulnerabilidade)" />
            <p className="text-xs text-muted-foreground mb-4 -mt-2">Esses dados geram o ranking automático de prioridade na lista de pacientes.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Tipo de Escola</label>
                <select value={tipoEscola} onChange={e => setTipoEscola(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {["Municipal", "Estadual", "Particular", "Filantrópica", "Não escolarizado"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Situação de Trabalho dos Pais</label>
                <select value={trabalhoPais} onChange={e => setTrabalhoPais(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {["Formal (Carteira Assinada)", "Informal/Roça", "Desempregado", "Aposentado/Pensionista"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-2">Já realiza terapias em outro local atualmente?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={outroAtendimento === true} onChange={() => setOutroAtendimento(true)} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-semibold text-muted-foreground">Sim</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={outroAtendimento === false} onChange={() => setOutroAtendimento(false)} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-semibold text-muted-foreground">Não — atendimento exclusivo aqui (+5 pts prioridade)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Onde realiza atendimento atualmente?</label>
                <select value={localAtendimento} onChange={e => setLocalAtendimento(e.target.value)} className={fc}>
                  <option value="">Selecione...</option>
                  {["CAPS", "Reabilitação", "Particular", "Sem Atendimento"].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Benefícios Sociais */}
          <div className="pt-4 border-t border-border">
            <Sec title="Benefícios Sociais e Renda" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Chk checked={bolsaFamilia} onChange={setBolsaFamilia} label="Bolsa Família" />
              <Chk checked={bpc} onChange={setBpc} label="BPC" />
              <Chk checked={pensao} onChange={setPensao} label="Pensão" />
              <Chk checked={auxilioDoenca} onChange={setAuxilioDoenca} label="Auxílio-Doença" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Outros Auxílios</label>
                <input value={outrosAuxilios} onChange={e => setOutrosAuxilios(e.target.value)} className={fc} placeholder="Ex.: Auxílio moradia, cesta básica..." /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Renda Familiar Total</label>
                <input value={rendaFamiliar} onChange={e => setRendaFamiliar(e.target.value)} className={fc} placeholder="Ex.: R$ 1.500 / 2 salários mínimos" /></div>
            </div>
          </div>

          {/* Dados de Saúde */}
          <div className="pt-4 border-t border-border">
            <Sec title="Dados de Saúde e Laudo" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Diagnóstico informado</label>
                <input value={diagnostico} onChange={e => setDiagnostico(e.target.value)} className={fc} placeholder="Ex.: TEA, TDAH, sem diagnóstico" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">CID-10</label>
                <input value={cid} onChange={e => setCid(e.target.value)} className={fc} placeholder="Ex.: F84.0, F90.0" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">CID-11</label>
                <input value={cid11} onChange={e => setCid11(e.target.value)} className={fc} placeholder="Ex.: 6A02.0" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Médico Responsável</label>
                <input value={medico} onChange={e => setMedico(e.target.value)} className={fc} placeholder="Nome do médico" /></div>
              <div><label className="block text-sm font-semibold text-muted-foreground mb-1">Data da Última Consulta</label>
                <input type="date" value={dataUltimaCons} onChange={e => setDataUltimaCons(e.target.value)} className={fc} /></div>
            </div>
          </div>

          {/* Dispositivos */}
          <div className="pt-4 border-t border-border">
            <Sec title="Dispositivos de Apoio" />
            <div className="flex flex-wrap gap-4 mb-4">
              <Chk checked={cadeiraDeRodas} onChange={setCadeiraDeRodas} label="Cadeira de Rodas" />
              <Chk checked={ortesesProteses} onChange={setOrtesesProteses} label="Órteses / Próteses" />
              <Chk checked={aparelhoAuditivo} onChange={setAparelhoAuditivo} label="Aparelho Auditivo" />
            </div>
          </div>

          {/* Alertas Críticos */}
          <div className="pt-4 border-t border-border">
            <Sec title="⚠ Alertas Críticos de Saúde" />
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Medicação Contínua (nome + dose)</label>
                <input value={medicacaoContinua} onChange={e => setMedicacaoContinua(e.target.value)} className={fc} placeholder="Ex.: Risperidona 1mg/dia, Ritalina 10mg 2x ao dia" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-red-600 mb-1">Alergias ⚠</label>
                <input value={alergias} onChange={e => setAlergias(e.target.value)}
                  className={`${fc} ${alergias ? "border-red-400 focus:ring-red-300" : ""}`}
                  placeholder="Ex.: Penicilina, dipirona, látex (destacado em vermelho se preenchido)" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Problemas de Saúde Associados</label>
                <input value={problemasSaude} onChange={e => setProblemasSaude(e.target.value)} className={fc} placeholder="Ex.: Convulsões, cardiopatia, epilepsia" />
              </div>
            </div>
          </div>

          {/* Profissional */}
          <div className="pt-4 border-t border-border">
            <Sec title="Profissional Responsável pela Triagem" />
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome</label>
              <input value={profissional} onChange={e => setProfissional(e.target.value)} className={fc} placeholder="Nome do profissional" />
            </div>
            {tipoRegistro !== "Registro Censo Municipal" && (
              <div className="mt-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40 px-4 py-3 text-xs text-emerald-300 font-semibold">
                ✅ As especialidades serão adicionadas automaticamente à fila de espera com base nas áreas pontuadas no Perfil Multidisciplinar. Não é necessário selecionar manualmente.
              </div>
            )}
            {tipoRegistro === "Registro Censo Municipal" && (
              <button type="submit"
                className="mt-5 w-full py-4 rounded-2xl font-extrabold text-base tracking-wide transition-all"
                style={{ background: "rgba(139,92,246,0.15)", border: "2px solid #7c3aed", color: "#c4b5fd", boxShadow: "0 0 24px rgba(124,58,237,0.35)", letterSpacing: "0.04em" }}>
                🏛️ Salvar Registro Censo
              </button>
            )}
          </div>
        </div>

        {tipoRegistro !== "Registro Censo Municipal" && (<>
          {/* Navegação áreas */}
          <div className="flex flex-wrap gap-2">
            {AREAS.map((area) => {
              const pergs = PERGUNTAS.map((p, idx) => ({ ...p, idx })).filter((p) => p.area === area);
              const temResposta = pergs.some((p) => respostas[p.idx] > 0);
              return (
                <button key={area} type="button" onClick={() => setAreaAtiva(area)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all flex items-center gap-1.5 ${
                    areaAtiva === area ? "bg-primary text-primary-foreground border-primary shadow-md"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                  }`}>
                  <span>{AREA_ICONS[area] ?? "📋"}</span>
                  <span className="hidden md:inline">{area}</span>
                  {temResposta && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Perguntas */}
          <div className="bg-card rounded-2xl border border-border/60 glow-card overflow-hidden">
            <div className={`px-6 py-4 border-b border-border ${CORES_AREA[areaAtiva] ?? "bg-secondary"}`}>
              <h2 className="font-bold text-lg">{areaAtiva}</h2>
              <p className="text-sm opacity-80">Área {areaIdx + 1} de {AREAS.length} — {perguntasDaArea.length} perguntas</p>
            </div>
            <div className="divide-y divide-border">
              {perguntasDaArea.map(({ pergunta, explicacao, idx }) => (
                <div key={idx} className="px-6 py-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex-1">
                      <p className="font-bold text-foreground">[{pergunta}]</p>
                      <p className="text-sm text-muted-foreground italic mt-0.5">({explicacao})</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {ESCALA.map((e) => (
                        <button key={e.valor} type="button"
                          onClick={() => { const n = [...respostas]; n[idx] = e.valor; setRespostas(n); }}
                          title={e.label}
                          className={`w-12 h-12 rounded-xl text-sm font-bold border-2 transition-all ${
                            respostas[idx] === e.valor
                              ? e.valor === 0 ? "bg-emerald-500 text-white border-emerald-500"
                                : e.valor === 1 ? "bg-blue-500 text-white border-blue-500"
                                : e.valor === 2 ? "bg-amber-500 text-white border-amber-500"
                                : "bg-rose-500 text-white border-rose-500"
                              : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                          }`}>{e.valor}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-muted/30 flex justify-between items-center border-t border-border">
              <button type="button" onClick={() => setAreaAtiva(AREAS[Math.max(0, areaIdx - 1)])}
                disabled={areaIdx === 0}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-secondary">
                ← Anterior
              </button>
              <span className="text-sm text-muted-foreground">{areaIdx + 1} / {AREAS.length}</span>
              {areaIdx < AREAS.length - 1 ? (
                <button type="button" onClick={() => setAreaAtiva(AREAS[areaIdx + 1])}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                  Próxima →
                </button>
              ) : (
                <button type="submit"
                  className="px-6 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-sm">
                  Ver Resultado ✓
                </button>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div className="bg-card rounded-2xl border border-border/60 p-4 glow-card">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Escala de Pontuação</p>
            <div className="flex flex-wrap gap-4">
              {ESCALA.map((e) => (
                <span key={e.valor} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                    e.valor === 0 ? "bg-emerald-500" : e.valor === 1 ? "bg-blue-500" : e.valor === 2 ? "bg-amber-500" : "bg-rose-500"
                  }`}>{e.valor}</span>
                  {e.label.split("–")[1].trim()}
                </span>
              ))}
            </div>
          </div>
        </>)}
      </form>
    </div>
  );
}

// ─── RELATÓRIO ────────────────────────────────────────────────────────────────

function Relatorio({ formData, onNova, editId, viewOnly }: {
  formData: FormData; onNova: () => void; editId?: number; viewOnly?: boolean;
}) {
  const {
    respostas, nomePaciente, dataNascimento, idade, nomeResponsavel, telefone, endereco,
    naturalidade, rg, cpf, sus,
    nomeMae, escolaridadeMae, profissaoMae, nomePai, escolaridadePai, profissaoPai,
    numIrmaos, tipoImovel, bolsaFamilia, bpc, pensao, auxilioDoenca, outrosAuxilios, rendaFamiliar,
    diagnostico, cid, cid11, medico, dataUltimaCons,
    cadeiraDeRodas, ortesesProteses, aparelhoAuditivo,
    medicacaoContinua, alergias, problemasSaude,
    tipoEscola, trabalhoPais, outroAtendimento,
    localAtendimento, tipoRegistro,
    profissional, especialidade,
  } = formData;

  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [autoLink, setAutoLink] = useState<{ patientName?: string; priority?: string; addedToQueue?: boolean; linkedOnly?: boolean; specialties?: string[]; alreadyQueued?: string[] } | null>(null);
  const [, navigate] = useLocation();
  const data = new Date().toLocaleDateString("pt-BR");
  const isCenso = tipoRegistro === "Registro Censo Municipal";

  const porArea = AREAS.map((area) => {
    const pergs = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === area);
    const pontos = pergs.reduce((a, p) => a + respostas[p.idx], 0);
    const max = pergs.length * 3;
    const pct = Math.round((pontos / max) * 100);
    return { area, pontos, max, pct, nivel: classificar(pontos, max) };
  });

  const ranking = [...porArea].sort((a, b) => b.pontos - a.pontos);
  const top3 = ranking.slice(0, 3).filter((a) => a.pontos > 0);
  const totalPontos = respostas.reduce((a, b) => a + b, 0);
  const totalMax = PERGUNTAS.length * 3;
  const pctTotal = Math.round((totalPontos / totalMax) * 100);
  const resultadoTexto = ranking.map(({ area, pontos, nivel }) => `${area}: ${pontos} pontos - ${nivel.label}`).join(" | ");

  const bodyParaSalvar = {
    nome: nomePaciente, dataNascimento, idade, responsavel: nomeResponsavel,
    telefone, endereco, naturalidade, rg, cpf, sus,
    nomeMae, escolaridadeMae, profissaoMae, nomePai, escolaridadePai, profissaoPai,
    numIrmaos, tipoImovel, bolsaFamilia, bpc, pensao, auxilioDoenca, outrosAuxilios, rendaFamiliar,
    diagnostico, cid, cid11, medico, dataUltimaCons,
    cadeiraDeRodas, ortesesProteses, aparelhoAuditivo,
    medicacaoContinua, alergias, problemasSaude,
    tipoEscola, trabalhoPais, outroAtendimento,
    localAtendimento, tipoRegistro,
    profissional, data, resultado: resultadoTexto, respostas,
  };

  const salvarTriagem = async () => {
    setSalvando(true);
    try {
      if (!navigator.onLine && !editId) {
        const { addToOfflineQueue } = await import("./lib/offline-queue");
        addToOfflineQueue(bodyParaSalvar);
        setSalvo(true);
        return;
      }
      const res = await fetch(editId ? `${API}/triagens/${editId}` : `${API}/triagens`, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyParaSalvar),
      });
      if (!res.ok && !editId) {
        const { addToOfflineQueue } = await import("./lib/offline-queue");
        addToOfflineQueue(bodyParaSalvar);
      } else if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?._autoLink) setAutoLink(json._autoLink);
      }
      setSalvo(true);
    } catch {
      if (!editId) {
        const { addToOfflineQueue } = await import("./lib/offline-queue");
        addToOfflineQueue(bodyParaSalvar);
        setSalvo(true);
      }
    } finally { setSalvando(false); }
  };

  // Auto-save for Censo registros – no need to show the full report
  useEffect(() => {
    if (isCenso && !editId && !viewOnly && !salvo && !salvando) {
      salvarTriagem();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simplified Censo confirmation screen
  // ── Censo: tela de confirmação (novo cadastro, não viewOnly)
  if (isCenso && !viewOnly && !editId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="rounded-2xl p-8" style={{ background: "rgba(139,92,246,0.1)", border: "2px solid #7c3aed" }}>
            {salvando && (
              <>
                <div className="text-5xl mb-4 animate-pulse">🏛️</div>
                <p className="text-lg font-bold" style={{ color: "#c4b5fd" }}>Salvando registro…</p>
                <p className="text-sm text-muted-foreground mt-2">Aguarde um momento</p>
              </>
            )}
            {salvo && (
              <>
                <div className="text-5xl mb-4">✅</div>
                <p className="text-xl font-extrabold" style={{ color: "#a78bfa" }}>Registro Censo Salvo!</p>
                <p className="text-sm text-muted-foreground mt-2 mb-1">
                  <strong className="text-foreground">{nomePaciente}</strong> foi registrado no mapeamento PCD.
                </p>
                <p className="text-xs text-violet-400 mb-6">Este registro não gera fila de espera na clínica.</p>
                <div className="flex flex-col gap-3">
                  <button onClick={onNova}
                    className="w-full py-3 rounded-xl font-bold text-sm"
                    style={{ background: "rgba(139,92,246,0.2)", border: "1px solid #7c3aed", color: "#c4b5fd" }}>
                    + Novo Registro Censo
                  </button>
                  <button onClick={() => navigate("/lista")}
                    className="w-full py-3 rounded-xl font-bold text-sm"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                    Ver Pacientes →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Censo: ficha de impressão (viewOnly ou editId)
  if (isCenso) {
    const camposCenso: { label: string; valor?: string | null }[] = [
      { label: "Nome", valor: nomePaciente },
      { label: "Data de Nascimento", valor: dataNascimento ? new Date(dataNascimento + "T12:00:00").toLocaleDateString("pt-BR") : undefined },
      { label: "Idade", valor: idade },
      { label: "Naturalidade", valor: naturalidade },
      { label: "CPF", valor: cpf },
      { label: "RG", valor: rg },
      { label: "Cartão SUS", valor: sus },
      { label: "Responsável", valor: nomeResponsavel },
      { label: "Telefone", valor: telefone },
      { label: "Endereço", valor: endereco },
      { label: "Diagnóstico", valor: diagnostico },
      { label: "CID-10", valor: cid },
      { label: "CID-11", valor: cid11 },
      { label: "Data do Registro", valor: data },
    ].filter(c => c.valor && String(c.valor).trim());
    return (
      <div className="min-h-screen bg-background">
        <Header page="relatorio" />
        <div className="max-w-2xl mx-auto p-6 space-y-6">

          {/* Botões de impressão — ficam ocultos na impressão */}
          <div className="flex gap-3 no-print">
            <button onClick={() => navigate("/lista")}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
              ← Voltar
            </button>
            <button onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-secondary/80 transition-colors">
              🖨️ Imprimir
            </button>
            <button onClick={() => {
              const prev = document.title;
              document.title = `Censo_PCD_${(nomePaciente || "paciente").replace(/\s+/g, "_")}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}`;
              window.print();
              setTimeout(() => { document.title = prev; }, 1000);
            }}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
              💾 Salvar PDF
            </button>
          </div>

          {/* Ficha — visível na tela e na impressão */}
          <div className="bg-card rounded-2xl border-2 border-violet-500/40 p-6 space-y-5">
            {/* Cabeçalho da ficha */}
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏛️</span>
                <h1 className="text-xl font-black">{CLINIC_CONFIG.name}</h1>
              </div>
              <p className="text-xs text-muted-foreground">{CLINIC_CONFIG.subtitle}</p>
              <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full bg-violet-950/40 text-violet-300 border border-violet-500/40">
                Registro Censo Municipal PCD
              </span>
            </div>

            {/* Grid de dados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {camposCenso.map(({ label, valor }) => (
                <div key={label} className={label === "Nome" || label === "Endereço" || label === "Diagnóstico" ? "sm:col-span-2" : ""}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="font-bold mt-0.5">{valor}</p>
                </div>
              ))}
            </div>

            {/* Rodapé */}
            <div className="border-t border-border pt-4 text-xs text-muted-foreground flex justify-between">
              <span>Impresso em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
              <span>Sistema NFs – Triagem Multidisciplinar</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  const beneficios = [
    bolsaFamilia && "Bolsa Família", bpc && "BPC",
    pensao && "Pensão", auxilioDoenca && "Auxílio-Doença",
    outrosAuxilios,
  ].filter(Boolean).join(", ");

  const dispositivos = [
    cadeiraDeRodas && "Cadeira de Rodas",
    ortesesProteses && "Órteses/Próteses",
    aparelhoAuditivo && "Aparelho Auditivo",
  ].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-background">
      <Header page="relatorio" />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">

        {/* Cabeçalho de impressão */}
        <div className="print-only hidden border-b-2 border-gray-800 pb-4 mb-5">
          <h1 className="text-2xl font-bold text-foreground">{CLINIC_CONFIG.name}</h1>
          <p className="text-sm text-muted-foreground">{CLINIC_CONFIG.subtitle}</p>
          <div className="flex justify-between mt-3 text-sm">
            <span><strong>Paciente:</strong> {nomePaciente}</span>
            <span><strong>Data:</strong> {data}</span>
          </div>
        </div>

        {/* ⚠ Alerta de Alergia */}
        {alergias && (
          <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 flex gap-3 items-start">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-red-700 text-base">ALERTA DE ALERGIA</p>
              <p className="text-red-800 font-semibold text-sm mt-0.5">{alergias}</p>
            </div>
          </div>
        )}

        {/* Medicação */}
        {medicacaoContinua && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start">
            <span className="text-xl">💊</span>
            <div>
              <p className="font-bold text-amber-800 text-sm">Medicação Contínua</p>
              <p className="text-amber-900 text-sm mt-0.5">{medicacaoContinua}</p>
            </div>
          </div>
        )}

        {/* Problemas de saúde */}
        {problemasSaude && (
          <div className="bg-orange-50 border border-orange-300 rounded-2xl p-4 flex gap-3 items-start">
            <span className="text-xl">🏥</span>
            <div>
              <p className="font-bold text-orange-800 text-sm">Problemas de Saúde Associados</p>
              <p className="text-orange-900 text-sm mt-0.5">{problemasSaude}</p>
            </div>
          </div>
        )}

        {/* Dados do Paciente */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-primary uppercase tracking-wider">Dados do Paciente</h2>
            {tipoRegistro === "Registro Censo Municipal" ? (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-950/40 text-violet-300 border border-violet-500/40">🏛️ Censo Municipal PCD</span>
            ) : (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">🏥 Paciente da Unidade</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Nome</p><p className="font-bold">{nomePaciente || "—"}</p></div>
            <div><p className="text-muted-foreground font-semibold">Data da Triagem</p><p className="font-bold">{data}</p></div>
            {dataNascimento && <div><p className="text-muted-foreground font-semibold">Nascimento</p><p className="font-bold">{new Date(dataNascimento + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
            {idade && <div><p className="text-muted-foreground font-semibold">Idade</p><p className="font-bold">{idade}</p></div>}
            {naturalidade && <div><p className="text-muted-foreground font-semibold">Naturalidade</p><p className="font-bold">{naturalidade}</p></div>}
            {rg && <div><p className="text-muted-foreground font-semibold">RG</p><p className="font-bold">{rg}</p></div>}
            {cpf && <div><p className="text-muted-foreground font-semibold">CPF</p><p className="font-bold">{cpf}</p></div>}
            {sus && <div><p className="text-muted-foreground font-semibold">Cartão SUS</p><p className="font-bold">{sus}</p></div>}
            {nomeResponsavel && <div><p className="text-muted-foreground font-semibold">Responsável</p><p className="font-bold">{nomeResponsavel}</p></div>}
            {telefone && <div><p className="text-muted-foreground font-semibold">Telefone</p><p className="font-bold">{telefone}</p></div>}
            {endereco && <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Endereço</p><p className="font-bold">{endereco}</p></div>}
          </div>

          {(nomeMae || nomePai || numIrmaos || tipoImovel || beneficios || rendaFamiliar) && (
            <div className="pt-4 border-t border-border text-sm space-y-1">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wider mb-2">Núcleo Familiar e Social</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {nomeMae && <div><p className="text-muted-foreground font-semibold">Mãe</p><p className="font-bold">{nomeMae}{escolaridadeMae ? ` | ${escolaridadeMae}` : ""}{profissaoMae ? ` | ${profissaoMae}` : ""}</p></div>}
                {nomePai && <div><p className="text-muted-foreground font-semibold">Pai</p><p className="font-bold">{nomePai}{escolaridadePai ? ` | ${escolaridadePai}` : ""}{profissaoPai ? ` | ${profissaoPai}` : ""}</p></div>}
                {numIrmaos && <div><p className="text-muted-foreground font-semibold">Nº de Irmãos</p><p className="font-bold">{numIrmaos}</p></div>}
                {tipoImovel && <div><p className="text-muted-foreground font-semibold">Moradia</p><p className="font-bold">{tipoImovel}</p></div>}
                {rendaFamiliar && <div><p className="text-muted-foreground font-semibold">Renda Familiar</p><p className="font-bold">{rendaFamiliar}</p></div>}
                {beneficios && <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Benefícios</p><p className="font-bold">{beneficios}</p></div>}
                {localAtendimento && <div><p className="text-muted-foreground font-semibold">Atendimento Atual</p><p className="font-bold">{localAtendimento}</p></div>}
              </div>
            </div>
          )}

          {(diagnostico || cid || cid11 || medico || dispositivos) && (
            <div className="pt-4 border-t border-border text-sm">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wider mb-2">Saúde e Dispositivos</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {diagnostico && <div><p className="text-muted-foreground font-semibold">Diagnóstico</p><p className="font-bold">{diagnostico}</p></div>}
                {cid && <div><p className="text-muted-foreground font-semibold">CID-10</p><p className="font-bold">{cid}</p></div>}
                {cid11 && <div><p className="text-muted-foreground font-semibold">CID-11</p><p className="font-bold">{cid11}</p></div>}
                {medico && <div><p className="text-muted-foreground font-semibold">Médico</p><p className="font-bold">{medico}</p></div>}
                {dataUltimaCons && <div><p className="text-muted-foreground font-semibold">Última Consulta</p><p className="font-bold">{new Date(dataUltimaCons + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
                {dispositivos && <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Dispositivos</p><p className="font-bold">{dispositivos}</p></div>}
              </div>
            </div>
          )}

          {profissional && (
            <div className="pt-4 border-t border-border text-sm">
              <p className="text-muted-foreground font-semibold">Profissional Responsável pela Triagem</p>
              <p className="font-bold">{profissional}{especialidade ? ` — ${especialidade}` : ""}</p>
            </div>
          )}
        </div>

        {/* Pontuação total */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pontuação Total</p>
            <p className="text-4xl font-bold mt-1">{totalPontos} <span className="text-lg font-normal text-muted-foreground">/ {totalMax}</span></p>
            <p className="text-sm text-muted-foreground mt-1">{pctTotal}% da pontuação máxima</p>
            <div className="flex gap-3 mt-3 flex-wrap">
              {[["bg-emerald-500","Verde – Baixo"],["bg-blue-500","Azul – Leve"],["bg-amber-500","Laranja – Moderado"],["bg-rose-500","Vermelho – Elevado"]].map(([cor,label]) => (
                <span key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`w-3 h-3 rounded-full ${cor}`} /> {label}
                </span>
              ))}
            </div>
          </div>
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={pctTotal >= 65 ? "#f43f5e" : pctTotal >= 45 ? "#f59e0b" : pctTotal >= 25 ? "#3b82f6" : "#10b981"}
                strokeWidth="3" strokeDasharray={`${pctTotal} ${100 - pctTotal}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold">{pctTotal}%</span>
            </div>
          </div>
        </div>

        {/* Radar */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
          <h2 className="font-bold text-lg mb-1">Teia de Aranha – Perfil Multidisciplinar</h2>
          <p className="text-sm text-muted-foreground mb-4">Percentual de indicativo por área avaliada</p>
          <GraficoRadar porArea={porArea} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {porArea.map(({ area, pct, nivel }) => (
              <div key={area} className={`text-center p-2 rounded-xl border ${nivel.bg}`}>
                <p className="text-xs font-semibold text-muted-foreground truncate">{SHORT_NAMES[area]}</p>
                <p className={`text-lg font-bold ${nivel.cor}`}>{pct}%</p>
                <p className={`text-[10px] font-semibold ${nivel.cor}`}>{nivel.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Prioridades */}
        {top3.length > 0 && (
          <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
            <h2 className="font-bold text-lg mb-4">Prioridades Identificadas (Top {top3.length})</h2>
            <div className="space-y-3">
              {top3.map(({ area, pontos, max, nivel }, i) => (
                <div key={area} className={`flex items-center gap-4 p-4 rounded-xl border ${nivel.bg}`}>
                  <span className="text-2xl font-black text-muted-foreground/40 w-8 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className={`font-bold ${nivel.cor}`}>{area}</p>
                    <p className={`text-sm font-semibold ${nivel.cor}`}>{nivel.label}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">{pontos}</span>
                    <p className="text-xs text-muted-foreground">/{max}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resultado por área */}
        <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
          <h2 className="font-bold text-lg mb-5">Resultado Detalhado por Área</h2>
          <div className="space-y-4">
            {ranking.map(({ area, pontos, max, pct, nivel }) => (
              <div key={area}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${CORES_AREA[area] ?? "bg-secondary text-foreground border-border"}`}>{area}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={`font-bold ${nivel.cor}`}>{nivel.label}</span>
                    <span className="text-muted-foreground">{pontos}/{max} ({pct}%)</span>
                  </div>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: nivel.hex }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Nota técnica */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
          <p className="font-bold mb-1">Nota Técnica</p>
          <p>Este documento refere-se a uma triagem inicial baseada em observações estruturadas, não constituindo diagnóstico clínico ou laudo profissional. Os resultados indicam possíveis necessidades e servem como apoio para encaminhamento para avaliação especializada.</p>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-3 justify-center pb-8 no-print">
          <button
            onClick={() => {
              const dataFmt = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
              const base = `Triagem_${(nomePaciente || "Paciente").replace(/\s+/g, "_")}_${dataFmt}`;
              const orig = document.title;
              document.title = `IMPRESSAO_${base}`;
              window.print();
              setTimeout(() => { document.title = orig; }, 1500);
            }}
            style={{ background: "#00e5ff", color: "#000", border: "none", fontWeight: 700, cursor: "pointer" }}
            className="px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
          >
            🖨️ Imprimir Agora
          </button>
          <button
            onClick={() => {
              const dataFmt = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
              const base = `Triagem_${(nomePaciente || "Paciente").replace(/\s+/g, "_")}_${dataFmt}`;
              const orig = document.title;
              document.title = `SALVAR_NA_PASTA_${base}`;
              window.print();
              setTimeout(() => { document.title = orig; }, 1500);
            }}
            style={{ background: "#bc13fe", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}
            className="px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
          >
            💾 Salvar em PDF
          </button>
          {!viewOnly && !salvo && (
            <button onClick={salvarTriagem} disabled={salvando}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {salvando ? "Salvando…" : editId ? "Atualizar Triagem" : "Salvar Triagem"}
            </button>
          )}
          {!viewOnly && salvo && (
            <div className="flex flex-col items-end gap-2">
              {autoLink?.addedToQueue && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold max-w-sm text-right space-y-1">
                  <div>✅ <strong>{autoLink.patientName}</strong> adicionado(a) à fila de espera</div>
                  <div>Prioridade: <strong>{autoLink.priority}</strong></div>
                  {autoLink.specialties && autoLink.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-end mt-1">
                      {autoLink.specialties.map(s => (
                        <span key={s} className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">{s}</span>
                      ))}
                    </div>
                  )}
                  {autoLink.alreadyQueued && autoLink.alreadyQueued.length > 0 && (
                    <div className="text-emerald-600 text-[10px]">Já na fila: {autoLink.alreadyQueued.join(", ")}</div>
                  )}
                </div>
              )}
              {autoLink?.linkedOnly && (
                <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-300 text-blue-800 text-xs font-semibold max-w-xs text-right">
                  🔗 Scores atualizados no prontuário de {autoLink.patientName}
                </div>
              )}
              <button onClick={() => navigate("/lista")}
                className="px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
                ✓ {editId ? "Atualizado!" : "Salvo!"} Ver Pacientes →
              </button>
            </div>
          )}
          {viewOnly && (
            <button onClick={() => navigate("/lista")}
              className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary">
              ← Voltar à Lista
            </button>
          )}
          {!viewOnly && (
            <button onClick={onNova}
              className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary">
              {editId ? "Editar Respostas" : "Nova Triagem"}
            </button>
          )}
        </div>

        <div className="print-only hidden text-center text-xs text-gray-500 border-t border-gray-200 pt-4 mt-4">
          {CLINIC_CONFIG.copyright} — Documento gerado em {data}
        </div>
      </div>
    </div>
  );
}

// ─── LISTA DE PACIENTES ───────────────────────────────────────────────────────

function ListaPacientes() {
  const [triagens, setTriagens] = useState<TriagemSalva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch(`${API}/triagens`).then(r => r.json()).then(setTriagens).catch(console.error).finally(() => setCarregando(false));
  }, []);

  const excluir = async (id: number) => {
    if (!confirm("Excluir esta triagem permanentemente?")) return;
    await fetch(`${API}/triagens/${id}`, { method: "DELETE" });
    setTriagens(prev => prev.filter(t => t.id !== id));
  };

  const parseResultado = (resultado: string | null) => {
    if (!resultado) return [];
    return resultado.split(" | ").filter(Boolean).map(item => {
      const [area, resto] = item.split(": ");
      const [pontos, nivel] = (resto ?? "").split(" pontos - ");
      return { area: area?.trim(), pontos: pontos?.trim(), nivel: nivel?.trim() };
    });
  };

  const filtradas = triagens
    .filter(t =>
      !busca || t.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (t.diagnostico ?? "").toLowerCase().includes(busca.toLowerCase()) ||
      (t.cid ?? "").toLowerCase().includes(busca.toLowerCase())
    )
    .sort((a, b) => {
      const scoreA = calcVulnScore(a) * 3 + parsePontosTotal(a.resultado);
      const scoreB = calcVulnScore(b) * 3 + parsePontosTotal(b.resultado);
      return scoreB - scoreA;
    });

  return (
    <div className="min-h-screen bg-background">
      <Header page="lista" />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Pacientes Triados</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{triagens.length} triagem(ns) registrada(s)</p>
          </div>
          {triagens.length > 0 && (
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, diagnóstico ou CID..."
              className="w-full sm:w-72 border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          )}
        </div>

        {carregando ? (
          <div className="bg-card rounded-2xl border border-border/60 p-12 text-center text-muted-foreground">Carregando…</div>
        ) : triagens.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/60 p-12 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-semibold">Nenhuma triagem salva ainda</p>
            <Link href="/" className="mt-4 inline-block px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Iniciar Triagem
            </Link>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/60 p-8 text-center text-muted-foreground">
            Nenhum resultado para "{busca}".
          </div>
        ) : (
          <div className="space-y-4">
            {filtradas.map((t) => {
              const areas = parseResultado(t.resultado);
              const top3 = areas.slice(0, 3);
              const vulnScore = calcVulnScore(t);
              const clinicalPts = parsePontosTotal(t.resultado);
              const prioridade = getPrioridadeBadge(vulnScore, clinicalPts);
              return (
                <div key={t.id} className={`bg-card rounded-2xl border p-5 glow-card hover:border-primary/40 transition-all ${prioridade?.label === "Prioridade Máxima" ? "border-red-800/70 border-l-4 border-l-red-500" : prioridade?.label === "Alta Prioridade" ? "border-orange-800/70 border-l-4 border-l-orange-400" : "border-border/60"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-lg truncate">{t.nome}</p>
                        {t.tipoRegistro === "Registro Censo Municipal" ? (
                          <span className="text-xs font-bold bg-violet-950/60 text-violet-400 border border-violet-700/50 px-2 py-0.5 rounded-full">🏛️ Censo</span>
                        ) : null}
                        {prioridade && t.tipoRegistro !== "Registro Censo Municipal" && (
                          <span className={`text-xs font-bold border px-2 py-0.5 rounded-full ${prioridade.cls}`}>
                            {prioridade.icon} {prioridade.label}
                          </span>
                        )}
                        {t.alergias && (
                          <span className="text-xs font-bold bg-red-950/60 text-red-400 border border-red-700/50 px-2 py-0.5 rounded-full">⚠ Alergia</span>
                        )}
                        {t.cadeiraDeRodas && (
                          <span className="text-xs font-bold bg-blue-950/60 text-blue-400 border border-blue-700/50 px-2 py-0.5 rounded-full">♿ CDR</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-muted-foreground">
                        {t.idade && <span>{t.idade}</span>}
                        {t.responsavel && <span>Resp.: {t.responsavel}</span>}
                        {t.telefone && <span>{t.telefone}</span>}
                        {t.data && <span>{t.data}</span>}
                      </div>
                      {(t.diagnostico || t.cid) && (
                        <div className="flex flex-wrap gap-x-3 mt-1 text-sm">
                          {t.diagnostico && <span className="text-muted-foreground">Diag.: <span className="font-semibold text-foreground">{t.diagnostico}</span></span>}
                          {t.cid && <span className="text-muted-foreground">CID-10: <span className="font-semibold text-foreground">{t.cid}</span></span>}
                          {t.cid11 && <span className="text-muted-foreground">CID-11: <span className="font-semibold text-foreground">{t.cid11}</span></span>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => navigate(`/relatorio/${t.id}`)}
                        className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold hover:bg-secondary transition-colors">
                        Imprimir PDF
                      </button>
                      <button onClick={() => navigate(`/editar/${t.id}`)}
                        className="px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => excluir(t.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors text-xl px-1" title="Excluir">×</button>
                    </div>
                  </div>

                  {top3.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex flex-wrap gap-2">
                        {top3.map(({ area, pontos, nivel }) => {
                          const cor = nivel === "Indício elevado" ? "bg-rose-100 text-rose-800 border-rose-200"
                            : nivel === "Indício moderado" ? "bg-amber-100 text-amber-800 border-amber-200"
                            : nivel === "Indício leve" ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-emerald-100 text-emerald-800 border-emerald-200";
                          return (
                            <span key={area} className={`text-xs font-semibold px-3 py-1 rounded-full border ${cor}`}>
                              {area} ({pontos} pts)
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];

function Dashboard() {
  const [triagens, setTriagens] = useState<TriagemSalva[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch(`${API}/triagens`).then(r => r.json()).then(setTriagens).catch(console.error).finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="min-h-screen bg-background">
        <Header page="dashboard" />
        <div className="flex items-center justify-center pt-24 text-muted-foreground">Carregando dados…</div>
      </div>
    );
  }

  const total = triagens.length;
  const totalUnidade = triagens.filter(t => !t.tipoRegistro || t.tipoRegistro === "Paciente da Unidade").length;
  const totalCenso = triagens.filter(t => t.tipoRegistro === "Registro Censo Municipal").length;
  const localAtendStats = {
    caps: triagens.filter(t => t.localAtendimento === "CAPS").length,
    reabilitacao: triagens.filter(t => t.localAtendimento === "Reabilitação").length,
    particular: triagens.filter(t => t.localAtendimento === "Particular").length,
    nenhum: triagens.filter(t => t.localAtendimento === "Sem Atendimento" || t.localAtendimento === "Nenhum").length,
  };
  const stats = {
    bpc: triagens.filter(t => t.bpc).length,
    bolsaFamilia: triagens.filter(t => t.bolsaFamilia).length,
    pensao: triagens.filter(t => t.pensao).length,
    auxilioDoenca: triagens.filter(t => t.auxilioDoenca).length,
    cadeiraDeRodas: triagens.filter(t => t.cadeiraDeRodas).length,
    ortesesProteses: triagens.filter(t => t.ortesesProteses).length,
    aparelhoAuditivo: triagens.filter(t => t.aparelhoAuditivo).length,
    comAlergias: triagens.filter(t => t.alergias && t.alergias.trim()).length,
    comMedicacao: triagens.filter(t => t.medicacaoContinua && t.medicacaoContinua.trim()).length,
    vulnAguardando: triagens.filter(t => calcVulnScore(t) >= 8).length,
    redePublica: triagens.filter(t => t.tipoEscola === "Municipal" || t.tipoEscola === "Estadual").length,
    semOutroAtend: triagens.filter(t => t.outroAtendimento === false).length,
    prioridadeMaxima: triagens.filter(t => {
      const v = calcVulnScore(t); const c = parsePontosTotal(t.resultado);
      return getPrioridadeBadge(v, c)?.label === "Prioridade Máxima";
    }).length,
  };

  const pct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 100);

  const beneficiosData = [
    { name: "BPC", value: stats.bpc },
    { name: "Bolsa Família", value: stats.bolsaFamilia },
    { name: "Pensão", value: stats.pensao },
    { name: "Auxílio-Doença", value: stats.auxilioDoenca },
  ].filter(d => d.value > 0);

  const dispositivosData = [
    { name: "Cadeira de Rodas", value: stats.cadeiraDeRodas },
    { name: "Órteses/Próteses", value: stats.ortesesProteses },
    { name: "Ap. Auditivo", value: stats.aparelhoAuditivo },
  ].filter(d => d.value > 0);

  // Diagnósticos mais frequentes
  const diagContagem: Record<string, number> = {};
  triagens.forEach(t => {
    if (t.diagnostico?.trim()) {
      const d = t.diagnostico.trim();
      diagContagem[d] = (diagContagem[d] || 0) + 1;
    }
  });
  const diagData = Object.entries(diagContagem)
    .sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 20) + "…" : name, value }));

  const Card = ({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) => (
    <div className={`bg-card rounded-2xl border border-border/60 p-5 glow-card ${color ? `border-l-4 ${color}` : ""}`}>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header page="dashboard" />
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">

        {/* Cabeçalho – aparece apenas na impressão */}
        <div className="print-only hidden border-b-2 border-gray-700 pb-4 mb-2">
          <p className="text-lg font-black">NFs Ibiúna — Dashboard Estatístico</p>
          <p className="text-xs text-gray-500 mt-0.5">Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Dashboard Estatístico</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Visão geral dos pacientes triados — atualizado em tempo real</p>
          </div>
          {total > 0 && (
            <div className="flex gap-2 no-print">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-secondary-foreground border border-border text-sm font-semibold hover:bg-secondary/80 transition-colors"
              >
                🖨️ Imprimir
              </button>
              <button
                onClick={() => {
                  const prevTitle = document.title;
                  document.title = `Dashboard_Estatístico_NFs_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}`;
                  window.print();
                  setTimeout(() => { document.title = prevTitle; }, 1000);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                💾 Salvar PDF
              </button>
            </div>
          )}
        </div>

        {total === 0 ? (
          <div className="bg-card rounded-2xl border border-border/60 p-12 text-center">
            <p className="text-4xl mb-4">📊</p>
            <p className="font-semibold">Nenhuma triagem registrada ainda</p>
            <Link href="/" className="mt-4 inline-block px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Iniciar primeira triagem
            </Link>
          </div>
        ) : (
          <>
            {/* ─── CONTADOR PCD MUNICIPAL ─── */}
            <div className="bg-gradient-to-r from-violet-950/40 to-violet-900/20 border-2 border-violet-500/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">🏛️</span>
                <div>
                  <h3 className="text-lg font-bold text-violet-200">Contador PCD – Ibiúna</h3>
                  <p className="text-xs text-violet-400">Total de pessoas com deficiência mapeadas no município</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div className="bg-violet-950/60 rounded-2xl border border-violet-500/40 p-5 text-center">
                  <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-1">Total de PCDs Cadastrados</p>
                  <p className="text-5xl font-black text-violet-100">{total}</p>
                  <p className="text-xs text-violet-400 mt-1">registros no sistema</p>
                </div>
                <div className="bg-card rounded-2xl border border-primary/30 p-5 text-center">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Pacientes da Unidade</p>
                  <p className="text-4xl font-black text-primary">{totalUnidade}</p>
                  <p className="text-xs text-muted-foreground mt-1">em atendimento / triagem</p>
                </div>
                <div className="bg-violet-950/40 rounded-2xl border border-violet-500/40 p-5 text-center">
                  <p className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-1">Censo Municipal (Geral)</p>
                  <p className="text-4xl font-black text-violet-200">{totalCenso}</p>
                  <p className="text-xs text-violet-400 mt-1">mapeados na cidade</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">Onde Realiza Atendimento</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "CAPS", value: localAtendStats.caps, color: "bg-blue-500" },
                    { label: "Reabilitação", value: localAtendStats.reabilitacao, color: "bg-emerald-500" },
                    { label: "Particular", value: localAtendStats.particular, color: "bg-amber-500" },
                    { label: "Sem Atendimento", value: localAtendStats.nenhum, color: "bg-rose-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-black/20 rounded-xl p-3 flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                      <div>
                        <p className="text-xs text-violet-300 font-semibold">{label}</p>
                        <p className="text-xl font-bold text-white">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Impacto Social — destaque */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">Impacto Social — Fila de Prioridade</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl border border-red-900/50 border-l-4 border-l-red-500 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground">🔴 Prioridade Máxima</p>
                  <p className="text-3xl font-bold mt-1 text-red-700">{stats.prioridadeMaxima}</p>
                  <p className="text-xs text-muted-foreground mt-1">pacientes no topo da fila</p>
                </div>
                <div className="bg-card rounded-xl border border-orange-900/50 border-l-4 border-l-orange-400 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Em Vulnerabilidade</p>
                  <p className="text-3xl font-bold mt-1 text-orange-700">{stats.vulnAguardando}</p>
                  <p className="text-xs text-muted-foreground mt-1">aguardando atendimento</p>
                </div>
                <div className="bg-card rounded-xl border border-border/60 border-l-4 border-l-blue-500 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Alunos Rede Pública</p>
                  <p className="text-3xl font-bold mt-1">{pct(stats.redePublica)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{stats.redePublica} de {total} pacientes</p>
                </div>
                <div className="bg-card rounded-xl border border-border/60 border-l-4 border-l-emerald-500 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Atend. Exclusivo Aqui</p>
                  <p className="text-3xl font-bold mt-1">{stats.semOutroAtend}</p>
                  <p className="text-xs text-muted-foreground mt-1">{pct(stats.semOutroAtend)}% sem outro serviço</p>
                </div>
              </div>
            </div>

            {/* Cards principais */}
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Visão Geral</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card label="Total de Pacientes" value={total} color="border-l-primary" />
                <Card label="Com Alergias ⚠" value={stats.comAlergias} sub={`${pct(stats.comAlergias)}% do total`} color="border-l-red-500" />
                <Card label="Medicação Contínua 💊" value={stats.comMedicacao} sub={`${pct(stats.comMedicacao)}% do total`} color="border-l-amber-500" />
                <Card label="Cadeirantes ♿" value={stats.cadeiraDeRodas} sub={`${pct(stats.cadeiraDeRodas)}% do total`} color="border-l-blue-500" />
              </div>
            </div>

            {/* Cards benefícios */}
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Benefícios Sociais</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card label="BPC" value={stats.bpc} sub={`${pct(stats.bpc)}% dos pacientes`} color="border-l-emerald-500" />
                <Card label="Bolsa Família" value={stats.bolsaFamilia} sub={`${pct(stats.bolsaFamilia)}% dos pacientes`} color="border-l-emerald-400" />
                <Card label="Pensão" value={stats.pensao} sub={`${pct(stats.pensao)}% dos pacientes`} color="border-l-teal-500" />
                <Card label="Auxílio-Doença" value={stats.auxilioDoenca} sub={`${pct(stats.auxilioDoenca)}% dos pacientes`} color="border-l-teal-400" />
              </div>
            </div>

            {/* Cards dispositivos */}
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Dispositivos de Apoio</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card label="Cadeira de Rodas" value={stats.cadeiraDeRodas} sub={`${pct(stats.cadeiraDeRodas)}% do total`} />
                <Card label="Órteses / Próteses" value={stats.ortesesProteses} sub={`${pct(stats.ortesesProteses)}% do total`} />
                <Card label="Aparelho Auditivo" value={stats.aparelhoAuditivo} sub={`${pct(stats.aparelhoAuditivo)}% do total`} />
              </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Diagnósticos */}
              {diagData.length > 0 && (
                <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
                  <h3 className="font-bold text-base mb-4">Diagnósticos Mais Frequentes</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={diagData} layout="vertical" margin={{ left: 8, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.07)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} width={90} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }} />
                      <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "rgba(255,255,255,0.7)" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Benefícios */}
              {beneficiosData.length > 0 && (
                <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
                  <h3 className="font-bold text-base mb-4">Distribuição de Benefícios</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={beneficiosData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {beneficiosData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Dispositivos */}
              {dispositivosData.length > 0 && (
                <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
                  <h3 className="font-bold text-base mb-4">Dispositivos de Apoio</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dispositivosData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.07)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11, fill: "rgba(255,255,255,0.7)" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Alertas críticos */}
              <div className="bg-card rounded-2xl border border-border/60 p-6 glow-card">
                <h3 className="font-bold text-base mb-4">Alertas Críticos</h3>
                <div className="space-y-3">
                  {[
                    { label: "Pacientes com Alergias", value: stats.comAlergias, cor: "bg-red-500" },
                    { label: "Uso de Medicação Contínua", value: stats.comMedicacao, cor: "bg-amber-500" },
                    { label: "Cadeirantes", value: stats.cadeiraDeRodas, cor: "bg-blue-500" },
                    { label: "Órteses / Próteses", value: stats.ortesesProteses, cor: "bg-purple-500" },
                    { label: "Aparelho Auditivo", value: stats.aparelhoAuditivo, cor: "bg-teal-500" },
                  ].map(({ label, value, cor }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cor}`} />
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-sm text-foreground">{label}</span>
                          <span className="text-sm font-bold">{value} <span className="text-muted-foreground font-normal">({pct(value)}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct(value)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── RELATÓRIO VIEW (Imprimir PDF da lista) ───────────────────────────────────

function RelatorioView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch(`${API}/triagens/${id}`)
      .then(r => { if (!r.ok) throw new Error("Não encontrado"); return r.json(); })
      .then((t: TriagemSalva) => setFormData(triSalvaToFormData(t)))
      .catch(() => setErro("Triagem não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Carregando relatório…</p>
    </div>
  );

  if (erro || !formData) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-destructive font-semibold">{erro || "Erro ao carregar."}</p>
        <button onClick={() => navigate("/lista")} className="mt-4 text-primary underline text-sm">← Voltar à lista</button>
      </div>
    </div>
  );

  return <Relatorio formData={formData} onNova={() => navigate("/")} editId={id} viewOnly />;
}

// ─── EDITAR TRIAGEM ───────────────────────────────────────────────────────────

function EditarTriagem() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [resultado, setResultado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch(`${API}/triagens/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((t: TriagemSalva) => setFormData(triSalvaToFormData(t)))
      .catch(() => setErro("Triagem não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (erro || !formData) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-destructive font-semibold">{erro}</p>
        <button onClick={() => navigate("/lista")} className="mt-4 text-primary underline text-sm">← Voltar</button>
      </div>
    </div>
  );

  if (resultado) return <Relatorio formData={formData} onNova={() => setResultado(false)} editId={id} />;
  return <Formulario initialData={formData} onSubmit={fd => { setFormData(fd); setResultado(true); }} />;
}

// ─── FLUXO NOVA TRIAGEM ───────────────────────────────────────────────────────

function TriagemFlow() {
  const [formData, setFormData] = useState<FormData | null>(null);
  if (formData) return <Relatorio formData={formData} onNova={() => setFormData(null)} />;
  return <Formulario onSubmit={setFormData} />;
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/lista" component={ListaPacientes} />
        <Route path="/editar/:id" component={EditarTriagem} />
        <Route path="/relatorio/:id" component={RelatorioView} />
        <Route path="/" component={TriagemFlow} />
      </Switch>
    </WouterRouter>
  );
}

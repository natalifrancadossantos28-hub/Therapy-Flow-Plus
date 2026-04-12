import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, useParams } from "wouter";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

// ─── WHITE LABEL CONFIG ──────────────────────────────────────────────────────
// Altere aqui para personalizar para cada clínica
export const CLINIC_CONFIG = {
  name: "NFs – Triagem Multidisciplinar",
  subtitle: "Avaliação multidisciplinar para crianças e adolescentes (0–18 anos)",
  copyright: "© 2026 NFs – Triagem Multidisciplinar",
  // logoUrl: "/logo.png", // Descomente e configure para usar logotipo personalizado
};
// ─────────────────────────────────────────────────────────────────────────────

const API = "/api";

type Pergunta = { area: string; pergunta: string; explicacao: string };

const AREAS = [
  "Psicológico",
  "Psicomotricidade",
  "Fisioterapia",
  "Terapia Ocupacional",
  "Fonoaudiologia",
  "Nutrição",
  "Psicopedagogia",
  "Educação Física",
];

const SHORT_NAMES: Record<string, string> = {
  "Psicológico": "Psicol.",
  "Psicomotricidade": "Psicomotr.",
  "Fisioterapia": "Fisio.",
  "Terapia Ocupacional": "T. Ocup.",
  "Fonoaudiologia": "Fono.",
  "Nutrição": "Nutrição",
  "Psicopedagogia": "Psicoped.",
  "Educação Física": "Ed. Física",
};

const PERGUNTAS: Pergunta[] = [
  // ── PSICOLÓGICO (15) ──────────────────────────────────────────────────────
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

  // ── PSICOMOTRICIDADE (15) ─────────────────────────────────────────────────
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

  // ── FISIOTERAPIA (15) ─────────────────────────────────────────────────────
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

  // ── TERAPIA OCUPACIONAL (15) ──────────────────────────────────────────────
  { area: "Terapia Ocupacional", pergunta: "Dificuldade na coordenação motora fina", explicacao: "Dificuldade com recortar, escrever, montar ou encaixar objetos pequenos" },
  { area: "Terapia Ocupacional", pergunta: "Hipersensibilidade sensorial", explicacao: "Reação excessiva a texturas, sons, luzes ou odores" },
  { area: "Terapia Ocupacional", pergunta: "Hiposensibilidade sensorial", explicacao: "Baixa resposta a estímulos sensoriais; busca por sensações intensas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade nas atividades de vida diária", explicacao: "Problemas para se vestir, alimentar ou higienizar de forma independente" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de planejamento motor", explicacao: "Não consegue sequenciar ou planejar movimentos para executar tarefas" },
  { area: "Terapia Ocupacional", pergunta: "Resistência a brincadeiras ou atividades lúdicas", explicacao: "Evita jogar ou participar de atividades próprias da idade" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de organização do espaço e materiais", explicacao: "Dificuldade em organizar o ambiente, mochila ou mesa de trabalho" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de concentração em tarefas manuais", explicacao: "Abandona rapidamente atividades que exigem atenção e uso das mãos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade com brincadeiras simbólicas", explicacao: "Não realiza jogo de faz de conta ou uso simbólico de objetos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de adaptação a mudanças de rotina", explicacao: "Reage mal a novas rotinas, ambientes ou mudanças inesperadas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade com utensílios", explicacao: "Não segura talheres, tesoura ou lápis de forma funcional para a idade" },
  { area: "Terapia Ocupacional", pergunta: "Comportamento autoestimulatório", explicacao: "Balanceio, estalar de dedos ou movimentos sensoriais repetidos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de regulação sensorial", explicacao: "Oscila entre busca e fuga de estímulos de modo que prejudica o funcionamento" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de higiene independente", explicacao: "Precisa de ajuda para escovar os dentes, banhar-se ou pentear acima do esperado" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de adaptação ambiental", explicacao: "Reage excessivamente a ruídos, luzes ou locais diferentes do habitual" },

  // ── FONOAUDIOLOGIA (15) ───────────────────────────────────────────────────
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

  // ── NUTRIÇÃO (15) ─────────────────────────────────────────────────────────
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

  // ── PSICOPEDAGOGIA (15) ───────────────────────────────────────────────────
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

  // ── EDUCAÇÃO FÍSICA (15) ──────────────────────────────────────────────────
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
  "Não alfabetizado",
  "Ensino Fundamental Incompleto",
  "Ensino Fundamental Completo",
  "Ensino Médio Incompleto",
  "Ensino Médio Completo",
  "Ensino Superior Incompleto",
  "Ensino Superior Completo",
  "Pós-graduação",
];

const CORES_AREA: Record<string, string> = {
  "Psicológico":         "bg-purple-100 text-purple-800 border-purple-200",
  "Psicomotricidade":    "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Fisioterapia":        "bg-orange-100 text-orange-800 border-orange-200",
  "Terapia Ocupacional": "bg-teal-100 text-teal-800 border-teal-200",
  "Fonoaudiologia":      "bg-blue-100 text-blue-800 border-blue-200",
  "Nutrição":            "bg-green-100 text-green-800 border-green-200",
  "Psicopedagogia":      "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Educação Física":     "bg-rose-100 text-rose-800 border-rose-200",
};

const BARRA_AREA: Record<string, string> = {
  "Psicológico":         "bg-purple-500",
  "Psicomotricidade":    "bg-indigo-500",
  "Fisioterapia":        "bg-orange-500",
  "Terapia Ocupacional": "bg-teal-500",
  "Fonoaudiologia":      "bg-blue-500",
  "Nutrição":            "bg-green-500",
  "Psicopedagogia":      "bg-yellow-500",
  "Educação Física":     "bg-rose-500",
};

function classificar(pontos: number, max: number): { label: string; cor: string; bg: string; hex: string } {
  const pct = (pontos / max) * 100;
  if (pct <= 25) return { label: "Baixo indicativo",  cor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",  hex: "#10b981" };
  if (pct <= 50) return { label: "Indício leve",       cor: "text-blue-700",    bg: "bg-blue-50 border-blue-200",         hex: "#3b82f6" };
  if (pct <= 75) return { label: "Indício moderado",   cor: "text-amber-700",   bg: "bg-amber-50 border-amber-200",       hex: "#f59e0b" };
  return               { label: "Indício elevado",     cor: "text-rose-700",    bg: "bg-rose-50 border-rose-200",         hex: "#f43f5e" };
}

type FormData = {
  respostas: number[];
  nomePaciente: string;
  dataNascimento: string;
  idade: string;
  nomeResponsavel: string;
  telefone: string;
  endereco: string;
  naturalidade: string;
  rg: string;
  cpf: string;
  sus: string;
  nomeMae: string;
  escolaridadeMae: string;
  profissaoMae: string;
  nomePai: string;
  escolaridadePai: string;
  profissaoPai: string;
  numIrmaos: string;
  tipoImovel: string;
  bolsaFamilia: boolean;
  bpc: boolean;
  diagnostico: string;
  cid: string;
  medico: string;
  dataUltimaCons: string;
  profissional: string;
  especialidade: string;
};

type TriagemSalva = {
  id: number;
  nome: string;
  dataNascimento: string | null;
  idade: string | null;
  responsavel: string | null;
  telefone: string | null;
  endereco: string | null;
  naturalidade: string | null;
  rg: string | null;
  cpf: string | null;
  sus: string | null;
  nomeMae: string | null;
  escolaridadeMae: string | null;
  profissaoMae: string | null;
  nomePai: string | null;
  escolaridadePai: string | null;
  profissaoPai: string | null;
  numIrmaos: string | null;
  tipoImovel: string | null;
  bolsaFamilia: boolean | null;
  bpc: boolean | null;
  diagnostico: string | null;
  cid: string | null;
  medico: string | null;
  dataUltimaCons: string | null;
  profissional: string | null;
  especialidade: string | null;
  data: string | null;
  resultado: string | null;
  respostas: string | null;
  createdAt: string;
};

function triSalvaToFormData(t: TriagemSalva): FormData {
  let respostas: number[] = Array(PERGUNTAS.length).fill(0);
  if (t.respostas) {
    try {
      const parsed = JSON.parse(t.respostas);
      if (Array.isArray(parsed)) {
        respostas = Array(PERGUNTAS.length).fill(0);
        for (let i = 0; i < Math.min(parsed.length, PERGUNTAS.length); i++) {
          respostas[i] = Number(parsed[i]) || 0;
        }
      }
    } catch { /* ignore */ }
  }
  return {
    respostas,
    nomePaciente: t.nome || "",
    dataNascimento: t.dataNascimento || "",
    idade: t.idade || "",
    nomeResponsavel: t.responsavel || "",
    telefone: t.telefone || "",
    endereco: t.endereco || "",
    naturalidade: t.naturalidade || "",
    rg: t.rg || "",
    cpf: t.cpf || "",
    sus: t.sus || "",
    nomeMae: t.nomeMae || "",
    escolaridadeMae: t.escolaridadeMae || "",
    profissaoMae: t.profissaoMae || "",
    nomePai: t.nomePai || "",
    escolaridadePai: t.escolaridadePai || "",
    profissaoPai: t.profissaoPai || "",
    numIrmaos: t.numIrmaos || "",
    tipoImovel: t.tipoImovel || "",
    bolsaFamilia: !!t.bolsaFamilia,
    bpc: !!t.bpc,
    diagnostico: t.diagnostico || "",
    cid: t.cid || "",
    medico: t.medico || "",
    dataUltimaCons: t.dataUltimaCons || "",
    profissional: t.profissional || "",
    especialidade: t.especialidade || "",
  };
}

// ── COMPONENTES ───────────────────────────────────────────────────────────────

function Header({ showLista = false }: { showLista?: boolean }) {
  return (
    <div className="bg-primary text-primary-foreground py-6 px-6 shadow-md no-print">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{CLINIC_CONFIG.name}</h1>
          <p className="mt-0.5 text-primary-foreground/80 text-xs md:text-sm">{CLINIC_CONFIG.subtitle}</p>
        </div>
        <Link
          href={showLista ? "/" : "/lista"}
          className="ml-4 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-colors flex-shrink-0"
        >
          {showLista ? "← Nova Triagem" : "Ver Pacientes →"}
        </Link>
      </div>
    </div>
  );
}

function PrintHeader({ nomePaciente, data }: { nomePaciente: string; data: string }) {
  return (
    <div className="print-only hidden border-b-2 border-gray-800 pb-4 mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{CLINIC_CONFIG.name}</h1>
      <p className="text-sm text-gray-600">{CLINIC_CONFIG.subtitle}</p>
      <div className="flex justify-between mt-3 text-sm">
        <span><strong>Paciente:</strong> {nomePaciente}</span>
        <span><strong>Data:</strong> {data}</span>
      </div>
    </div>
  );
}

function GraficoRadar({ porArea }: { porArea: { area: string; pct: number; nivel: ReturnType<typeof classificar> }[] }) {
  const data = porArea.map(({ area, pct }) => ({
    area: SHORT_NAMES[area] ?? area,
    pct,
    fullMark: 100,
  }));

  const pctTotal = Math.round(porArea.reduce((a, b) => a + b.pct, 0) / porArea.length);
  const radarColor = pctTotal >= 65 ? "#f43f5e" : pctTotal >= 45 ? "#f59e0b" : pctTotal >= 25 ? "#3b82f6" : "#10b981";

  return (
    <div style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="area"
            tick={{ fontSize: 11, fontWeight: 600, fill: "#374151" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tickCount={5}
            tick={{ fontSize: 9, fill: "#9ca3af" }}
          />
          <Radar
            name="Índice (%)"
            dataKey="pct"
            stroke={radarColor}
            fill={radarColor}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── FORMULÁRIO ────────────────────────────────────────────────────────────────

function Formulario({ onSubmit, initialData }: { onSubmit: (f: FormData) => void; initialData?: FormData }) {
  const base = initialData ?? null;
  const [respostas, setRespostas] = useState<number[]>(base?.respostas ?? Array(PERGUNTAS.length).fill(0));
  const [nomePaciente, setNomePaciente] = useState(base?.nomePaciente ?? "");
  const [dataNascimento, setDataNascimento] = useState(base?.dataNascimento ?? "");
  const [idade, setIdade] = useState(base?.idade ?? "");
  const [nomeResponsavel, setNomeResponsavel] = useState(base?.nomeResponsavel ?? "");
  const [telefone, setTelefone] = useState(base?.telefone ?? "");
  const [endereco, setEndereco] = useState(base?.endereco ?? "");
  const [naturalidade, setNaturalidade] = useState(base?.naturalidade ?? "");
  const [rg, setRg] = useState(base?.rg ?? "");
  const [cpf, setCpf] = useState(base?.cpf ?? "");
  const [sus, setSus] = useState(base?.sus ?? "");
  const [nomeMae, setNomeMae] = useState(base?.nomeMae ?? "");
  const [escolaridadeMae, setEscolaridadeMae] = useState(base?.escolaridadeMae ?? "");
  const [profissaoMae, setProfissaoMae] = useState(base?.profissaoMae ?? "");
  const [nomePai, setNomePai] = useState(base?.nomePai ?? "");
  const [escolaridadePai, setEscolaridadePai] = useState(base?.escolaridadePai ?? "");
  const [profissaoPai, setProfissaoPai] = useState(base?.profissaoPai ?? "");
  const [numIrmaos, setNumIrmaos] = useState(base?.numIrmaos ?? "");
  const [tipoImovel, setTipoImovel] = useState(base?.tipoImovel ?? "");
  const [bolsaFamilia, setBolsaFamilia] = useState(base?.bolsaFamilia ?? false);
  const [bpc, setBpc] = useState(base?.bpc ?? false);
  const [diagnostico, setDiagnostico] = useState(base?.diagnostico ?? "");
  const [cid, setCid] = useState(base?.cid ?? "");
  const [medico, setMedico] = useState(base?.medico ?? "");
  const [dataUltimaCons, setDataUltimaCons] = useState(base?.dataUltimaCons ?? "");
  const [profissional, setProfissional] = useState(base?.profissional ?? "");
  const [especialidade, setEspecialidade] = useState(base?.especialidade ?? "");
  const [areaAtiva, setAreaAtiva] = useState(AREAS[0]);

  const perguntasDaArea = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === areaAtiva);
  const areaIdx = AREAS.indexOf(areaAtiva);

  const fieldClass = "w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 bg-white";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      respostas, nomePaciente, dataNascimento, idade, nomeResponsavel,
      telefone, endereco, naturalidade, rg, cpf, sus,
      nomeMae, escolaridadeMae, profissaoMae,
      nomePai, escolaridadePai, profissaoPai,
      numIrmaos, tipoImovel, bolsaFamilia, bpc,
      diagnostico, cid, medico, dataUltimaCons,
      profissional, especialidade,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">

        {/* ── Dados do Paciente ── */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide text-primary">Dados do Paciente</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome completo *</label>
                <input required value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)}
                  className={fieldClass} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Data de Nascimento</label>
                <input type="date" value={dataNascimento} onChange={(e) => {
                    const val = e.target.value;
                    setDataNascimento(val);
                    if (val) {
                      const nasc = new Date(val + "T12:00:00");
                      const hoje = new Date();
                      let anos = hoje.getFullYear() - nasc.getFullYear();
                      const m = hoje.getMonth() - nasc.getMonth();
                      if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
                      setIdade(anos + (anos === 1 ? " ano" : " anos"));
                    }
                  }} className={fieldClass} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Idade</label>
                <input value={idade} onChange={(e) => setIdade(e.target.value)}
                  className={fieldClass} placeholder="Ex.: 8 anos" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Responsável</label>
                <input value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)}
                  className={fieldClass} placeholder="Nome do responsável" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Telefone</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)}
                  className={fieldClass} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>

          {/* ── Documentos ── */}
          <div className="pt-4 border-t border-border">
            <h2 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide text-primary">Documentos e Localização</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">RG</label>
                <input value={rg} onChange={(e) => setRg(e.target.value)}
                  className={fieldClass} placeholder="Nº do RG" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">CPF</label>
                <input value={cpf} onChange={(e) => setCpf(e.target.value)}
                  className={fieldClass} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Cartão SUS (CNS)</label>
                <input value={sus} onChange={(e) => setSus(e.target.value)}
                  className={fieldClass} placeholder="Nº do cartão SUS" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Naturalidade</label>
                <input value={naturalidade} onChange={(e) => setNaturalidade(e.target.value)}
                  className={fieldClass} placeholder="Cidade / Estado" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Endereço</label>
                <input value={endereco} onChange={(e) => setEndereco(e.target.value)}
                  className={fieldClass} placeholder="Rua, número, bairro" />
              </div>
            </div>
          </div>

          {/* ── Núcleo Familiar ── */}
          <div className="pt-4 border-t border-border">
            <h2 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide text-primary">Núcleo Familiar e Situação Socioeconômica</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome da Mãe</label>
                <input value={nomeMae} onChange={(e) => setNomeMae(e.target.value)}
                  className={fieldClass} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Escolaridade da Mãe</label>
                <select value={escolaridadeMae} onChange={(e) => setEscolaridadeMae(e.target.value)} className={fieldClass}>
                  <option value="">Selecione...</option>
                  {ESCOLARIDADE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Profissão da Mãe</label>
                <input value={profissaoMae} onChange={(e) => setProfissaoMae(e.target.value)}
                  className={fieldClass} placeholder="Profissão" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome do Pai</label>
                <input value={nomePai} onChange={(e) => setNomePai(e.target.value)}
                  className={fieldClass} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Escolaridade do Pai</label>
                <select value={escolaridadePai} onChange={(e) => setEscolaridadePai(e.target.value)} className={fieldClass}>
                  <option value="">Selecione...</option>
                  {ESCOLARIDADE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Profissão do Pai</label>
                <input value={profissaoPai} onChange={(e) => setProfissaoPai(e.target.value)}
                  className={fieldClass} placeholder="Profissão" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nº de Irmãos</label>
                <input type="number" min="0" value={numIrmaos} onChange={(e) => setNumIrmaos(e.target.value)}
                  className={fieldClass} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Situação de Moradia</label>
                <select value={tipoImovel} onChange={(e) => setTipoImovel(e.target.value)} className={fieldClass}>
                  <option value="">Selecione...</option>
                  <option value="Próprio">Próprio</option>
                  <option value="Alugado">Alugado</option>
                  <option value="Cedido">Cedido</option>
                  <option value="Abrigo / Instituição">Abrigo / Instituição</option>
                  <option value="Área de risco">Área de risco</option>
                </select>
              </div>
              <div className="flex items-center gap-6 md:col-span-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bolsaFamilia} onChange={(e) => setBolsaFamilia(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm font-semibold text-muted-foreground">Bolsa Família</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={bpc} onChange={(e) => setBpc(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm font-semibold text-muted-foreground">BPC</span>
                </label>
              </div>
            </div>
          </div>

          {/* ── Saúde ── */}
          <div className="pt-4 border-t border-border">
            <h2 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide text-primary">Dados de Saúde e Laudo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Diagnóstico informado / Laudo</label>
                <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)}
                  className={fieldClass} placeholder="Ex.: TEA, TDAH, sem diagnóstico" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">CID-10</label>
                <input value={cid} onChange={(e) => setCid(e.target.value)}
                  className={fieldClass} placeholder="Ex.: F84.0, F90.0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Médico Responsável</label>
                <input value={medico} onChange={(e) => setMedico(e.target.value)}
                  className={fieldClass} placeholder="Nome do médico" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Data da Última Consulta</label>
                <input type="date" value={dataUltimaCons} onChange={(e) => setDataUltimaCons(e.target.value)}
                  className={fieldClass} />
              </div>
            </div>
          </div>

          {/* ── Profissional ── */}
          <div className="pt-4 border-t border-border">
            <h2 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide text-primary">Profissional Responsável pela Triagem</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome</label>
                <input value={profissional} onChange={(e) => setProfissional(e.target.value)}
                  className={fieldClass} placeholder="Nome do profissional" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">Especialidade</label>
                <input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}
                  className={fieldClass} placeholder="Ex.: Psicologia, Fonoaudiologia" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Navegação de áreas ── */}
        <div className="flex flex-wrap gap-2">
          {AREAS.map((area) => {
            const pergs = PERGUNTAS.map((p, idx) => ({ ...p, idx })).filter((p) => p.area === area);
            const temResposta = pergs.some((p) => respostas[p.idx] > 0);
            return (
              <button key={area} type="button" onClick={() => setAreaAtiva(area)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                  areaAtiva === area
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white text-muted-foreground border-border hover:border-primary/40"
                }`}>
                {temResposta ? "● " : ""}{area}
              </button>
            );
          })}
        </div>

        {/* ── Perguntas da área ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b border-border ${CORES_AREA[areaAtiva] ?? "bg-gray-50"}`}>
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
                  <div className="flex gap-2 flex-shrink-0 items-center">
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
                            : "bg-white text-muted-foreground border-border hover:border-primary/50"
                        }`}>
                        {e.valor}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 bg-muted/30 flex justify-between items-center border-t border-border">
            <button type="button" onClick={() => setAreaAtiva(AREAS[Math.max(0, areaIdx - 1)])}
              disabled={areaIdx === 0}
              className="px-4 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-secondary transition-colors">
              ← Anterior
            </button>
            <span className="text-sm text-muted-foreground">{areaIdx + 1} / {AREAS.length}</span>
            {areaIdx < AREAS.length - 1 ? (
              <button type="button" onClick={() => setAreaAtiva(AREAS[areaIdx + 1])}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                Próxima →
              </button>
            ) : (
              <button type="submit"
                className="px-6 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
                Ver Resultado ✓
              </button>
            )}
          </div>
        </div>

        {/* ── Legenda ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
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
      </form>
    </div>
  );
}

// ── RELATÓRIO ─────────────────────────────────────────────────────────────────

function Relatorio({
  formData,
  onNova,
  editId,
}: {
  formData: FormData;
  onNova: () => void;
  editId?: number;
}) {
  const {
    respostas, nomePaciente, dataNascimento, idade, nomeResponsavel,
    telefone, endereco, naturalidade, rg, cpf, sus,
    nomeMae, escolaridadeMae, profissaoMae,
    nomePai, escolaridadePai, profissaoPai,
    numIrmaos, tipoImovel, bolsaFamilia, bpc,
    diagnostico, cid, medico, dataUltimaCons,
    profissional, especialidade,
  } = formData;

  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [, navigate] = useLocation();
  const data = new Date().toLocaleDateString("pt-BR");

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

  const resultadoTexto = ranking.map(({ area, pontos, nivel }) =>
    `${area}: ${pontos} pontos - ${nivel.label}`
  ).join(" | ");

  const bodyParaSalvar = {
    nome: nomePaciente,
    dataNascimento, idade, responsavel: nomeResponsavel,
    telefone, endereco, naturalidade, rg, cpf, sus,
    nomeMae, escolaridadeMae, profissaoMae,
    nomePai, escolaridadePai, profissaoPai,
    numIrmaos, tipoImovel, bolsaFamilia, bpc,
    diagnostico, cid, medico, dataUltimaCons,
    profissional, especialidade,
    data, resultado: resultadoTexto,
    respostas,
  };

  const salvarTriagem = async () => {
    setSalvando(true);
    try {
      if (editId) {
        await fetch(`${API}/triagens/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyParaSalvar),
        });
      } else {
        await fetch(`${API}/triagens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyParaSalvar),
        });
      }
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showLista />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

        {/* Cabeçalho de impressão */}
        <PrintHeader nomePaciente={nomePaciente} data={data} />

        {/* ── Dados do Paciente ── */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-primary uppercase tracking-wider">Dados do Paciente</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Nome</p><p className="font-bold text-foreground">{nomePaciente || "—"}</p></div>
            <div><p className="text-muted-foreground font-semibold">Data da Triagem</p><p className="font-bold text-foreground">{data}</p></div>
            {dataNascimento && <div><p className="text-muted-foreground font-semibold">Data de Nascimento</p><p className="font-bold">{new Date(dataNascimento + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
            {idade && <div><p className="text-muted-foreground font-semibold">Idade</p><p className="font-bold">{idade}</p></div>}
            {naturalidade && <div><p className="text-muted-foreground font-semibold">Naturalidade</p><p className="font-bold">{naturalidade}</p></div>}
            {rg && <div><p className="text-muted-foreground font-semibold">RG</p><p className="font-bold">{rg}</p></div>}
            {cpf && <div><p className="text-muted-foreground font-semibold">CPF</p><p className="font-bold">{cpf}</p></div>}
            {sus && <div><p className="text-muted-foreground font-semibold">Cartão SUS</p><p className="font-bold">{sus}</p></div>}
            {nomeResponsavel && <div><p className="text-muted-foreground font-semibold">Responsável</p><p className="font-bold">{nomeResponsavel}</p></div>}
            {telefone && <div><p className="text-muted-foreground font-semibold">Telefone</p><p className="font-bold">{telefone}</p></div>}
            {endereco && <div className="md:col-span-2"><p className="text-muted-foreground font-semibold">Endereço</p><p className="font-bold">{endereco}</p></div>}
          </div>
          {(nomeMae || nomePai || numIrmaos || tipoImovel || bolsaFamilia || bpc) && (
            <div className="pt-4 border-t border-border text-sm grid grid-cols-2 md:grid-cols-3 gap-4">
              <h3 className="md:col-span-3 font-bold text-muted-foreground uppercase text-xs tracking-wider">Núcleo Familiar</h3>
              {nomeMae && <div><p className="text-muted-foreground font-semibold">Mãe</p><p className="font-bold">{nomeMae}{escolaridadeMae ? ` | ${escolaridadeMae}` : ""}{profissaoMae ? ` | ${profissaoMae}` : ""}</p></div>}
              {nomePai && <div><p className="text-muted-foreground font-semibold">Pai</p><p className="font-bold">{nomePai}{escolaridadePai ? ` | ${escolaridadePai}` : ""}{profissaoPai ? ` | ${profissaoPai}` : ""}</p></div>}
              {numIrmaos && <div><p className="text-muted-foreground font-semibold">Nº de Irmãos</p><p className="font-bold">{numIrmaos}</p></div>}
              {tipoImovel && <div><p className="text-muted-foreground font-semibold">Moradia</p><p className="font-bold">{tipoImovel}</p></div>}
              {(bolsaFamilia || bpc) && (
                <div className="md:col-span-2">
                  <p className="text-muted-foreground font-semibold">Benefícios</p>
                  <p className="font-bold">{[bolsaFamilia && "Bolsa Família", bpc && "BPC"].filter(Boolean).join(", ")}</p>
                </div>
              )}
            </div>
          )}
          {(diagnostico || cid || medico || dataUltimaCons) && (
            <div className="pt-4 border-t border-border text-sm grid grid-cols-2 md:grid-cols-3 gap-4">
              <h3 className="md:col-span-3 font-bold text-muted-foreground uppercase text-xs tracking-wider">Dados de Saúde</h3>
              {diagnostico && <div><p className="text-muted-foreground font-semibold">Diagnóstico / Laudo</p><p className="font-bold">{diagnostico}</p></div>}
              {cid && <div><p className="text-muted-foreground font-semibold">CID-10</p><p className="font-bold">{cid}</p></div>}
              {medico && <div><p className="text-muted-foreground font-semibold">Médico</p><p className="font-bold">{medico}</p></div>}
              {dataUltimaCons && <div><p className="text-muted-foreground font-semibold">Última Consulta</p><p className="font-bold">{new Date(dataUltimaCons + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
            </div>
          )}
          {profissional && (
            <div className="pt-4 border-t border-border text-sm">
              <p className="text-muted-foreground font-semibold">Profissional Responsável pela Triagem</p>
              <p className="font-bold">{profissional}{especialidade ? ` — ${especialidade}` : ""}</p>
            </div>
          )}
        </div>

        {/* ── Pontuação total ── */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pontuação Total</p>
            <p className="text-4xl font-bold text-foreground mt-1">{totalPontos} <span className="text-lg font-normal text-muted-foreground">/ {totalMax}</span></p>
            <p className="text-sm text-muted-foreground mt-1">{pctTotal}% da pontuação máxima</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: "Verde – Baixo", cor: "bg-emerald-500" },
                { label: "Azul – Leve", cor: "bg-blue-500" },
                { label: "Laranja – Moderado", cor: "bg-amber-500" },
                { label: "Vermelho – Elevado", cor: "bg-rose-500" },
              ].map(({ label, cor }) => (
                <span key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`w-3 h-3 rounded-full ${cor} inline-block`} /> {label}
                </span>
              ))}
            </div>
          </div>
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={pctTotal >= 65 ? "#f43f5e" : pctTotal >= 45 ? "#f59e0b" : pctTotal >= 25 ? "#3b82f6" : "#10b981"}
                strokeWidth="3" strokeDasharray={`${pctTotal} ${100 - pctTotal}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{pctTotal}%</span>
            </div>
          </div>
        </div>

        {/* ── Gráfico Radar ── */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="font-bold text-lg text-foreground mb-2">Teia de Aranha – Perfil Multidisciplinar</h2>
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

        {/* ── Top prioridades ── */}
        {top3.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <h2 className="font-bold text-lg text-foreground mb-4">Prioridades Identificadas (Top {top3.length})</h2>
            <div className="space-y-3">
              {top3.map(({ area, pontos, max, nivel }, i) => (
                <div key={area} className={`flex items-center gap-4 p-4 rounded-xl border ${nivel.bg}`}>
                  <span className="text-2xl font-black text-muted-foreground/40 w-8 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className={`font-bold text-base ${nivel.cor}`}>{area}</p>
                    <p className={`text-sm font-semibold ${nivel.cor}`}>{nivel.label}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-foreground">{pontos}</span>
                    <p className="text-xs text-muted-foreground">/{max}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Resultado por área ── */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="font-bold text-lg text-foreground mb-5">Resultado Detalhado por Área</h2>
          <div className="space-y-4">
            {ranking.map(({ area, pontos, max, pct, nivel }) => (
              <div key={area}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${CORES_AREA[area] ?? "bg-gray-100"}`}>{area}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={`font-bold ${nivel.cor}`}>{nivel.label}</span>
                    <span className="text-muted-foreground">{pontos}/{max} ({pct}%)</span>
                  </div>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: nivel.hex }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Nota técnica ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
          <p className="font-bold mb-1">Nota Técnica</p>
          <p>Este documento refere-se a uma triagem inicial baseada em observações estruturadas, não constituindo diagnóstico clínico ou laudo profissional. Os resultados indicam possíveis necessidades e servem como apoio para encaminhamento para avaliação especializada.</p>
        </div>

        {/* ── Ações ── */}
        <div className="flex flex-wrap gap-3 justify-center pb-8 no-print">
          <button onClick={() => window.print()}
            className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
            Imprimir / Salvar PDF
          </button>
          {!salvo ? (
            <button onClick={salvarTriagem} disabled={salvando}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              {salvando ? "Salvando…" : editId ? "Atualizar Triagem" : "Salvar Triagem"}
            </button>
          ) : (
            <button onClick={() => navigate("/lista")}
              className="px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
              ✓ {editId ? "Atualizado!" : "Salvo!"} Ver Pacientes →
            </button>
          )}
          <button onClick={onNova}
            className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
            {editId ? "Editar Respostas" : "Nova Triagem"}
          </button>
        </div>

        {/* Rodapé de impressão */}
        <div className="print-only hidden text-center text-xs text-gray-500 border-t border-gray-200 pt-4 mt-4">
          {CLINIC_CONFIG.copyright} — Documento gerado em {data}
        </div>
      </div>
    </div>
  );
}

// ── LISTA DE PACIENTES ────────────────────────────────────────────────────────

function ListaPacientes() {
  const [triagens, setTriagens] = useState<TriagemSalva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch(`${API}/triagens`)
      .then((r) => r.json())
      .then((data) => setTriagens(data))
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, []);

  const excluir = async (id: number) => {
    if (!confirm("Excluir esta triagem permanentemente?")) return;
    await fetch(`${API}/triagens/${id}`, { method: "DELETE" });
    setTriagens((prev) => prev.filter((t) => t.id !== id));
  };

  const parseResultado = (resultado: string | null) => {
    if (!resultado) return [];
    return resultado.split(" | ").filter(Boolean).map((item) => {
      const [area, resto] = item.split(": ");
      const [pontos, nivel] = (resto ?? "").split(" pontos - ");
      return { area: area?.trim(), pontos: pontos?.trim(), nivel: nivel?.trim() };
    });
  };

  const filtradas = triagens.filter(t =>
    !busca || t.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (t.diagnostico ?? "").toLowerCase().includes(busca.toLowerCase()) ||
    (t.cid ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Header showLista />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Pacientes Triados</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{triagens.length} triagem(ns) registrada(s)</p>
          </div>
          {triagens.length > 0 && (
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, diagnóstico ou CID..."
              className="w-full sm:w-72 border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </div>

        {carregando ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground">Carregando…</div>
        ) : triagens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-semibold text-foreground">Nenhuma triagem salva ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Realize uma triagem e clique em "Salvar Triagem" para ela aparecer aqui.</p>
            <Link href="/" className="mt-4 inline-block px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Iniciar Triagem
            </Link>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted-foreground">
            Nenhum paciente encontrado para "{busca}".
          </div>
        ) : (
          <div className="space-y-4">
            {filtradas.map((t) => {
              const areas = parseResultado(t.resultado);
              const top3 = [...areas].slice(0, 3);
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg text-foreground truncate">{t.nome}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                        {t.idade && <span>Idade: {t.idade}</span>}
                        {t.responsavel && <span>Resp.: {t.responsavel}</span>}
                        {t.telefone && <span>{t.telefone}</span>}
                        {t.data && <span>{t.data}</span>}
                      </div>
                      {(t.diagnostico || t.cid) && (
                        <div className="flex flex-wrap gap-x-4 mt-1 text-sm">
                          {t.diagnostico && <span className="text-muted-foreground">Diag.: <span className="font-semibold text-foreground">{t.diagnostico}</span></span>}
                          {t.cid && <span className="text-muted-foreground">CID: <span className="font-semibold text-foreground">{t.cid}</span></span>}
                        </div>
                      )}
                      {t.profissional && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Prof.: <span className="font-semibold text-foreground">{t.profissional}{t.especialidade ? ` — ${t.especialidade}` : ""}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/editar/${t.id}`)}
                        className="px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
                        title="Visualizar / Editar"
                      >
                        Editar / Ver
                      </button>
                      <button onClick={() => excluir(t.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors text-xl"
                        title="Excluir">
                        ×
                      </button>
                    </div>
                  </div>

                  {top3.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Top Prioridades</p>
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

// ── EDITAR TRIAGEM ────────────────────────────────────────────────────────────

function EditarTriagem() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [resultado, setResultado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`${API}/triagens/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("Não encontrado");
        return r.json();
      })
      .then((t: TriagemSalva) => {
        setFormData(triSalvaToFormData(t));
      })
      .catch(() => setErro("Triagem não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando triagem…</p>
      </div>
    );
  }

  if (erro || !formData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-semibold">{erro || "Erro ao carregar triagem."}</p>
          <Link href="/lista" className="mt-4 inline-block text-primary underline text-sm">
            ← Voltar à lista
          </Link>
        </div>
      </div>
    );
  }

  if (resultado) {
    return (
      <Relatorio
        formData={formData}
        onNova={() => setResultado(false)}
        editId={id}
      />
    );
  }

  return (
    <Formulario
      initialData={formData}
      onSubmit={(fd) => { setFormData(fd); setResultado(true); }}
    />
  );
}

// ── FLUXO NOVA TRIAGEM ────────────────────────────────────────────────────────

function TriagemFlow() {
  const [formData, setFormData] = useState<FormData | null>(null);

  if (formData) {
    return <Relatorio formData={formData} onNova={() => setFormData(null)} />;
  }
  return <Formulario onSubmit={setFormData} />;
}

// ── APP ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/lista" component={ListaPacientes} />
        <Route path="/editar/:id" component={EditarTriagem} />
        <Route path="/" component={TriagemFlow} />
      </Switch>
    </WouterRouter>
  );
}

import { useState } from "react";

type Pergunta = {
  area: string;
  pergunta: string;
  explicacao: string;
};

const PERGUNTAS: Pergunta[] = [
  // PSICOLÓGICO
  { area: "Psicológico", pergunta: "Déficit de atenção sustentada", explicacao: "Dificuldade de manter o foco por períodos prolongados" },
  { area: "Psicológico", pergunta: "Ansiedade frequente", explicacao: "Fica muito nervoso, agitado ou preocupado com frequência" },
  { area: "Psicológico", pergunta: "Baixa autoestima", explicacao: "Demonstra insegurança, se deprecia ou evita desafios" },
  { area: "Psicológico", pergunta: "Humor instável", explicacao: "Mudanças bruscas de humor sem causa aparente" },
  { area: "Psicológico", pergunta: "Dificuldade de adaptação a mudanças", explicacao: "Reage mal a novas rotinas ou ambientes desconhecidos" },
  { area: "Psicológico", pergunta: "Comportamento de regressão", explicacao: "Retorna a comportamentos de etapas anteriores do desenvolvimento" },
  { area: "Psicológico", pergunta: "Medos excessivos ou fobias", explicacao: "Medo intenso e desproporcional de situações específicas" },
  { area: "Psicológico", pergunta: "Dificuldade em lidar com frustração", explicacao: "Reações intensas quando não consegue o que quer" },
  { area: "Psicológico", pergunta: "Isolamento social", explicacao: "Evita interações com outras pessoas sem razão aparente" },
  { area: "Psicológico", pergunta: "Dificuldade de autocontrole emocional", explicacao: "Não consegue regular as próprias emoções adequadamente" },

  // FONOAUDIOLOGIA
  { area: "Fonoaudiologia", pergunta: "Atraso na aquisição da fala", explicacao: "Demora para começar a falar ou vocabulário abaixo do esperado" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de articulação", explicacao: "Troca ou omite sons na fala de forma frequente" },
  { area: "Fonoaudiologia", pergunta: "Gagueira ou disfluência", explicacao: "Repetições, prolongamentos ou bloqueios na fala" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de compreensão oral", explicacao: "Não entende comandos ou histórias de acordo com a idade" },
  { area: "Fonoaudiologia", pergunta: "Voz alterada", explicacao: "Voz muito aguda, grave, rouca ou nasal sem causa médica aparente" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de mastigação ou deglutição", explicacao: "Problemas para mastigar ou engolir alimentos adequadamente" },
  { area: "Fonoaudiologia", pergunta: "Respiração oral", explicacao: "Respira predominantemente pela boca em vez do nariz" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de leitura e escrita", explicacao: "Problemas para decodificar letras, sílabas ou palavras" },
  { area: "Fonoaudiologia", pergunta: "Vocabulário reduzido para a idade", explicacao: "Usa poucas palavras para se expressar em relação à faixa etária" },
  { area: "Fonoaudiologia", pergunta: "Dificuldade de organização do discurso", explicacao: "Não consegue narrar ou organizar uma sequência de ideias" },

  // TERAPIA OCUPACIONAL
  { area: "Terapia Ocupacional", pergunta: "Dificuldade na coordenação motora fina", explicacao: "Dificuldade com recortar, escrever, montar ou encaixar objetos pequenos" },
  { area: "Terapia Ocupacional", pergunta: "Hipersensibilidade sensorial", explicacao: "Reação excessiva a texturas, sons, luzes ou odores" },
  { area: "Terapia Ocupacional", pergunta: "Hiposensibilidade sensorial", explicacao: "Baixa resposta a estímulos sensoriais; busca por sensações intensas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade nas atividades de vida diária", explicacao: "Problemas para se vestir, alimentar ou higienizar de forma independente" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de planejamento motor", explicacao: "Não consegue sequenciar ou planejar movimentos para executar tarefas" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de organização do espaço e materiais", explicacao: "Dificuldade em organizar o ambiente, mochila ou mesa de trabalho" },
  { area: "Terapia Ocupacional", pergunta: "Resistência a brincadeiras ou atividades lúdicas", explicacao: "Evita jogar ou participar de atividades próprias da idade" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de equilíbrio e postura", explicacao: "Postura inadequada, cansa facilmente ou cai com frequência" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade de concentração em tarefas manuais", explicacao: "Abandona rapidamente atividades que exigem atenção e mãos" },
  { area: "Terapia Ocupacional", pergunta: "Dificuldade com lateralidade", explicacao: "Confunde direita/esquerda; não tem lateralidade definida" },

  // FISIOTERAPIA
  { area: "Fisioterapia", pergunta: "Atraso no desenvolvimento motor global", explicacao: "Demora a rolar, sentar, engatinhar, andar conforme o esperado" },
  { area: "Fisioterapia", pergunta: "Tônus muscular alterado", explicacao: "Músculos muito flácidos (hipotonia) ou muito rígidos (hipertonia)" },
  { area: "Fisioterapia", pergunta: "Dificuldade de coordenação motora grossa", explicacao: "Problemas para correr, pular, chutar, arremessar" },
  { area: "Fisioterapia", pergunta: "Desvio postural", explicacao: "Escoliose, cifose, lordose excessiva ou outras alterações posturais" },
  { area: "Fisioterapia", pergunta: "Dor músculo-esquelética recorrente", explicacao: "Queixas frequentes de dor em articulações ou músculos" },
  { area: "Fisioterapia", pergunta: "Limitação de amplitude de movimento", explicacao: "Dificuldade de movimentar articulações em sua amplitude normal" },
  { area: "Fisioterapia", pergunta: "Marcha atípica", explicacao: "Forma de andar diferente do esperado para a idade (ex.: na ponta dos pés)" },
  { area: "Fisioterapia", pergunta: "Fadiga muscular precoce", explicacao: "Cansa facilmente durante atividades físicas habituais" },
  { area: "Fisioterapia", pergunta: "Dificuldade de subir/descer escadas", explicacao: "Precisa de apoio ou evita escadas além do esperado para a idade" },
  { area: "Fisioterapia", pergunta: "Alterações respiratórias funcionais", explicacao: "Respiração alterada que compromete a função motora ou resistência" },

  // PEDAGÓGICO
  { area: "Pedagógico", pergunta: "Dificuldade de aprendizagem da leitura", explicacao: "Dificuldade em decodificar palavras, sílabas ou textos" },
  { area: "Pedagógico", pergunta: "Dificuldade de aprendizagem da escrita", explicacao: "Letra ilegível, trocas, omissões ou inversões frequentes" },
  { area: "Pedagógico", pergunta: "Dificuldade em matemática", explicacao: "Dificuldade com contagem, operações ou conceitos numéricos" },
  { area: "Pedagógico", pergunta: "Dificuldade de memória de trabalho", explicacao: "Esquece instruções recém dadas ou perde o fio das tarefas" },
  { area: "Pedagógico", pergunta: "Lentidão na execução de tarefas", explicacao: "Demora muito mais do que os colegas para concluir atividades" },
  { area: "Pedagógico", pergunta: "Dificuldade de planejamento e organização escolar", explicacao: "Dificuldade em planejar, iniciar ou concluir tarefas acadêmicas" },
  { area: "Pedagógico", pergunta: "Baixo rendimento acadêmico geral", explicacao: "Desempenho significativamente abaixo do esperado para a série/idade" },
  { area: "Pedagógico", pergunta: "Recusa escolar ou resistência às tarefas", explicacao: "Evita ir à escola ou realizar atividades de aprendizagem" },
  { area: "Pedagógico", pergunta: "Dificuldade de raciocínio lógico", explicacao: "Problemas para sequenciar, classificar ou relacionar informações" },
  { area: "Pedagógico", pergunta: "Dificuldade de generalização do aprendizado", explicacao: "Aprende algo mas não consegue aplicar em contextos diferentes" },

  // COMPORTAMENTAL / SOCIAL
  { area: "Comportamental / Social", pergunta: "Agressividade física ou verbal", explicacao: "Comportamentos agressivos com colegas, familiares ou objetos" },
  { area: "Comportamental / Social", pergunta: "Birras intensas e frequentes", explicacao: "Crises de choro, grito ou agitação de difícil manejo" },
  { area: "Comportamental / Social", pergunta: "Comportamento opositor desafiante", explicacao: "Recusa persistente a seguir regras e desafia figuras de autoridade" },
  { area: "Comportamental / Social", pergunta: "Dificuldade de seguir regras e limites", explicacao: "Não respeita combinados mesmo quando bem estabelecidos" },
  { area: "Comportamental / Social", pergunta: "Dificuldade de interação com pares", explicacao: "Não consegue brincar ou conviver adequadamente com outras crianças" },
  { area: "Comportamental / Social", pergunta: "Comportamentos repetitivos ou estereotipados", explicacao: "Movimentos ou ações repetidas sem função aparente" },
  { area: "Comportamental / Social", pergunta: "Dificuldade de esperar a vez", explicacao: "Não consegue aguardar sua vez em jogos, filas ou conversas" },
  { area: "Comportamental / Social", pergunta: "Impulsividade", explicacao: "Age sem pensar, interrompe conversas ou situações com frequência" },
  { area: "Comportamental / Social", pergunta: "Dificuldade de empatia", explicacao: "Dificuldade em reconhecer ou considerar os sentimentos dos outros" },
  { area: "Comportamental / Social", pergunta: "Mentiras frequentes ou manipulação", explicacao: "Uso frequente de mentiras ou estratégias manipulativas" },
];

const ESCALA = [
  { valor: 0, label: "0 – Não apresenta" },
  { valor: 1, label: "1 – Leve" },
  { valor: 2, label: "2 – Moderado" },
  { valor: 3, label: "3 – Frequente" },
];

const AREAS = [...new Set(PERGUNTAS.map((p) => p.area))];

const CORES_AREA: Record<string, string> = {
  "Psicológico": "bg-purple-100 text-purple-800 border-purple-200",
  "Fonoaudiologia": "bg-blue-100 text-blue-800 border-blue-200",
  "Terapia Ocupacional": "bg-teal-100 text-teal-800 border-teal-200",
  "Fisioterapia": "bg-orange-100 text-orange-800 border-orange-200",
  "Pedagógico": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Comportamental / Social": "bg-rose-100 text-rose-800 border-rose-200",
};

const BARRA_AREA: Record<string, string> = {
  "Psicológico": "bg-purple-500",
  "Fonoaudiologia": "bg-blue-500",
  "Terapia Ocupacional": "bg-teal-500",
  "Fisioterapia": "bg-orange-500",
  "Pedagógico": "bg-yellow-500",
  "Comportamental / Social": "bg-rose-500",
};

const RECOMENDACOES: Record<string, string> = {
  "Psicológico": "Avaliação e acompanhamento com Psicólogo",
  "Fonoaudiologia": "Avaliação e acompanhamento com Fonoaudiólogo",
  "Terapia Ocupacional": "Avaliação e acompanhamento com Terapeuta Ocupacional",
  "Fisioterapia": "Avaliação e acompanhamento com Fisioterapeuta",
  "Pedagógico": "Avaliação Psicopedagógica e suporte escolar",
  "Comportamental / Social": "Avaliação comportamental e orientação familiar",
};

type Resultado = {
  respostas: number[];
  nomeResponsavel: string;
  nomePaciente: string;
  idade: string;
  data: string;
};

function getNivelRisco(pct: number) {
  if (pct < 20) return { label: "Sem indicativo", cor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", barra: "bg-emerald-500" };
  if (pct < 40) return { label: "Baixo", cor: "text-blue-700", bg: "bg-blue-50 border-blue-200", barra: "bg-blue-500" };
  if (pct < 65) return { label: "Moderado", cor: "text-amber-700", bg: "bg-amber-50 border-amber-200", barra: "bg-amber-500" };
  return { label: "Alto", cor: "text-rose-700", bg: "bg-rose-50 border-rose-200", barra: "bg-rose-500" };
}

function Formulario({ onSubmit }: { onSubmit: (r: Resultado) => void }) {
  const [respostas, setRespostas] = useState<number[]>(Array(PERGUNTAS.length).fill(0));
  const [nomePaciente, setNomePaciente] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [idade, setIdade] = useState("");
  const [areaAtiva, setAreaAtiva] = useState(AREAS[0]);

  const perguntasDaArea = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === areaAtiva);
  const areaIdx = AREAS.indexOf(areaAtiva);
  const totalAreas = AREAS.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      respostas,
      nomeResponsavel,
      nomePaciente,
      idade,
      data: new Date().toLocaleDateString("pt-BR"),
    });
  };

  const progresso = AREAS.map((area) => {
    const pergs = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === area);
    return pergs.every((p) => respostas[p.idx] !== undefined);
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-6 text-center shadow-md">
        <h1 className="text-2xl md:text-3xl font-bold">NFs – Triagem Multidisciplinar</h1>
        <p className="mt-2 text-primary-foreground/80 text-sm md:text-base">
          Instrumento de triagem para identificação de necessidades terapêuticas
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        {/* Dados do paciente */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-4">Dados de Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome do Paciente *</label>
              <input
                required
                value={nomePaciente}
                onChange={(e) => setNomePaciente(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Responsável</label>
              <input
                value={nomeResponsavel}
                onChange={(e) => setNomeResponsavel(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nome do responsável"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Idade</label>
              <input
                value={idade}
                onChange={(e) => setIdade(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Ex.: 8 anos"
              />
            </div>
          </div>
        </div>

        {/* Navegação por área */}
        <div className="flex flex-wrap gap-2">
          {AREAS.map((area, i) => (
            <button
              key={area}
              type="button"
              onClick={() => setAreaAtiva(area)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                areaAtiva === area
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {progresso[i] ? "✓ " : ""}{area}
            </button>
          ))}
        </div>

        {/* Perguntas da área ativa */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b border-border ${CORES_AREA[areaAtiva] ?? "bg-gray-50"}`}>
            <h2 className="font-bold text-lg">{areaAtiva}</h2>
            <p className="text-sm opacity-80">Área {areaIdx + 1} de {totalAreas} — {perguntasDaArea.length} perguntas</p>
          </div>

          <div className="divide-y divide-border">
            {perguntasDaArea.map(({ pergunta, explicacao, idx }) => (
              <div key={idx} className="px-6 py-5">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{pergunta}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{explicacao}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {ESCALA.map((e) => (
                      <button
                        key={e.valor}
                        type="button"
                        onClick={() => {
                          const novas = [...respostas];
                          novas[idx] = e.valor;
                          setRespostas(novas);
                        }}
                        className={`w-12 h-12 rounded-xl text-sm font-bold border-2 transition-all ${
                          respostas[idx] === e.valor
                            ? e.valor === 0
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : e.valor === 1
                              ? "bg-blue-500 text-white border-blue-500"
                              : e.valor === 2
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-rose-500 text-white border-rose-500"
                            : "bg-white text-muted-foreground border-border hover:border-primary/50"
                        }`}
                        title={e.label}
                      >
                        {e.valor}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navegação entre áreas */}
          <div className="px-6 py-4 bg-muted/30 flex justify-between items-center border-t border-border">
            <button
              type="button"
              onClick={() => setAreaAtiva(AREAS[Math.max(0, areaIdx - 1)])}
              disabled={areaIdx === 0}
              className="px-4 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-secondary transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-sm text-muted-foreground">{areaIdx + 1} / {totalAreas}</span>
            {areaIdx < totalAreas - 1 ? (
              <button
                type="button"
                onClick={() => setAreaAtiva(AREAS[areaIdx + 1])}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Próxima →
              </button>
            ) : (
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Finalizar Triagem ✓
              </button>
            )}
          </div>
        </div>

        {/* Escala de referência */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Escala de Pontuação</p>
          <div className="flex flex-wrap gap-3">
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

function Relatorio({ resultado, onNova }: { resultado: Resultado; onNova: () => void }) {
  const { respostas, nomePaciente, nomeResponsavel, idade, data } = resultado;
  const totalMax = PERGUNTAS.length * 3;
  const totalPontos = respostas.reduce((a, b) => a + b, 0);
  const pctTotal = Math.round((totalPontos / totalMax) * 100);
  const nivelTotal = getNivelRisco(pctTotal);

  const porArea = AREAS.map((area) => {
    const pergs = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === area);
    const pontos = pergs.reduce((a, p) => a + respostas[p.idx], 0);
    const max = pergs.length * 3;
    const pct = Math.round((pontos / max) * 100);
    return { area, pontos, max, pct, nivel: getNivelRisco(pct) };
  }).sort((a, b) => b.pct - a.pct);

  const areasAlerta = porArea.filter((a) => a.pct >= 40);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-8 px-6 text-center shadow-md">
        <h1 className="text-2xl md:text-3xl font-bold">Resultado da Triagem</h1>
        <p className="mt-1 text-primary-foreground/80">NFs – Triagem Multidisciplinar</p>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Dados */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground font-semibold">Paciente</p>
              <p className="font-bold text-foreground">{nomePaciente || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">Responsável</p>
              <p className="font-bold text-foreground">{nomeResponsavel || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">Idade</p>
              <p className="font-bold text-foreground">{idade || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-semibold">Data</p>
              <p className="font-bold text-foreground">{data}</p>
            </div>
          </div>
        </div>

        {/* Score geral */}
        <div className={`rounded-2xl border p-6 shadow-sm ${nivelTotal.bg}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pontuação Total</p>
              <p className="text-4xl font-bold text-foreground mt-1">{totalPontos} <span className="text-lg font-normal text-muted-foreground">/ {totalMax}</span></p>
              <p className={`text-lg font-bold mt-1 ${nivelTotal.cor}`}>Nível de indicativo: {nivelTotal.label}</p>
            </div>
            <div className="w-full md:w-48 text-center">
              <div className="relative w-32 h-32 mx-auto">
                <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={pctTotal >= 65 ? "#f43f5e" : pctTotal >= 40 ? "#f59e0b" : pctTotal >= 20 ? "#3b82f6" : "#10b981"}
                    strokeWidth="3"
                    strokeDasharray={`${pctTotal} ${100 - pctTotal}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-foreground">{pctTotal}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Áreas com alerta */}
        {areasAlerta.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <h2 className="font-bold text-lg text-foreground mb-4">⚠️ Áreas com Indicativo de Acompanhamento</h2>
            <div className="space-y-3">
              {areasAlerta.map(({ area, nivel }) => (
                <div key={area} className={`flex items-start gap-3 p-4 rounded-xl border ${nivel.bg}`}>
                  <div className="flex-1">
                    <p className={`font-bold ${nivel.cor}`}>{area}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{RECOMENDACOES[area]}</p>
                  </div>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${nivel.bg} ${nivel.cor}`}>{nivel.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resultado por área */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="font-bold text-lg text-foreground mb-5">Resultado por Área</h2>
          <div className="space-y-4">
            {porArea.map(({ area, pontos, max, pct, nivel }) => (
              <div key={area}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${CORES_AREA[area] ?? "bg-gray-100"}`}>{area}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${nivel.cor}`}>{nivel.label}</span>
                    <span className="text-sm text-muted-foreground">{pontos}/{max}</span>
                  </div>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${BARRA_AREA[area] ?? "bg-gray-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legenda */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Legenda de Níveis</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: "Sem indicativo", pct: "< 20%", cor: "bg-emerald-100 text-emerald-800 border-emerald-200" },
              { label: "Baixo", pct: "20–39%", cor: "bg-blue-100 text-blue-800 border-blue-200" },
              { label: "Moderado", pct: "40–64%", cor: "bg-amber-100 text-amber-800 border-amber-200" },
              { label: "Alto", pct: "≥ 65%", cor: "bg-rose-100 text-rose-800 border-rose-200" },
            ].map((n) => (
              <div key={n.label} className={`p-3 rounded-xl border ${n.cor}`}>
                <p className="font-bold">{n.label}</p>
                <p className="text-xs opacity-70">{n.pct} do total da área</p>
              </div>
            ))}
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
          <p className="font-bold mb-1">Importante</p>
          <p>Esta triagem é um instrumento de rastreamento e <strong>não substitui avaliação clínica especializada</strong>. Os resultados indicam áreas que podem se beneficiar de acompanhamento profissional. A decisão clínica é de responsabilidade do profissional habilitado.</p>
        </div>

        <div className="flex gap-3 justify-center pb-8">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors"
          >
            🖨️ Imprimir / Salvar PDF
          </button>
          <button
            onClick={onNova}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Nova Triagem
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [resultado, setResultado] = useState<Resultado | null>(null);

  if (resultado) {
    return <Relatorio resultado={resultado} onNova={() => setResultado(null)} />;
  }

  return <Formulario onSubmit={setResultado} />;
}

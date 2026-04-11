import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";

const API = "/api";

type Pergunta = {
  area: string;
  pergunta: string;
  explicacao: string;
};

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

const PERGUNTAS: Pergunta[] = [
  // PSICOLÓGICO
  { area: "Psicológico", pergunta: "Déficit de atenção sustentada", explicacao: "Dificuldade de manter o foco" },
  { area: "Psicológico", pergunta: "Ansiedade frequente", explicacao: "Fica muito nervoso ou preocupado" },
  { area: "Psicológico", pergunta: "Baixa autoestima", explicacao: "Demonstra insegurança ou se deprecia com frequência" },
  { area: "Psicológico", pergunta: "Humor instável", explicacao: "Mudanças bruscas de humor sem causa aparente" },
  { area: "Psicológico", pergunta: "Medos excessivos ou fobias", explicacao: "Medo intenso e desproporcional de situações específicas" },
  { area: "Psicológico", pergunta: "Dificuldade em lidar com frustração", explicacao: "Reações intensas quando não consegue o que quer" },
  { area: "Psicológico", pergunta: "Isolamento social", explicacao: "Evita interações com outras pessoas sem razão aparente" },
  { area: "Psicológico", pergunta: "Comportamento opositor desafiante", explicacao: "Recusa persistente em seguir regras ou desafia autoridades" },
  { area: "Psicológico", pergunta: "Impulsividade", explicacao: "Age sem pensar ou interrompe situações com frequência" },
  { area: "Psicológico", pergunta: "Comportamentos repetitivos ou estereotipados", explicacao: "Movimentos ou ações repetidas sem função aparente" },

  // PSICOMOTRICIDADE
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

  // FISIOTERAPIA
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

  // TERAPIA OCUPACIONAL
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

  // FONOAUDIOLOGIA
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

  // NUTRIÇÃO
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

  // PSICOPEDAGOGIA
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

  // EDUCAÇÃO FÍSICA
  { area: "Educação Física", pergunta: "Baixa resistência cardiovascular", explicacao: "Cansa muito rapidamente em atividades físicas leves ou moderadas" },
  { area: "Educação Física", pergunta: "Dificuldade em jogos coletivos", explicacao: "Não consegue participar adequadamente de esportes ou jogos em grupo" },
  { area: "Educação Física", pergunta: "Dificuldade de habilidades motoras esportivas", explicacao: "Dificuldade com chutar, arremessar, rebater ou quicar uma bola" },
  { area: "Educação Física", pergunta: "Recusa ou aversão à atividade física", explicacao: "Evita participar de aulas ou atividades físicas sem causa aparente" },
  { area: "Educação Física", pergunta: "Dificuldade de seguir regras de jogos", explicacao: "Não compreende ou não respeita as regras de brincadeiras e esportes" },
  { area: "Educação Física", pergunta: "Dificuldade de cooperação em equipe", explicacao: "Não consegue jogar em equipe, divide mal a bola ou isola-se" },
  { area: "Educação Física", pergunta: "Dificuldade de controle corporal em movimento", explicacao: "Colide com objetos/pessoas, queda frequente durante atividades" },
  { area: "Educação Física", pergunta: "Sedentarismo fora do ambiente escolar", explicacao: "Passa a maior parte do tempo sentado, sem atividades físicas" },
  { area: "Educação Física", pergunta: "Dificuldade de agilidade e velocidade de reação", explicacao: "Reage lentamente a estímulos em situações de jogo ou exercício" },
  { area: "Educação Física", pergunta: "Dificuldade de força muscular adequada para a idade", explicacao: "Força muscular abaixo do esperado para a faixa etária" },
];

const ESCALA = [
  { valor: 0, label: "0 – Não apresenta" },
  { valor: 1, label: "1 – Leve" },
  { valor: 2, label: "2 – Moderado" },
  { valor: 3, label: "3 – Frequente" },
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

function classificar(pontos: number): { label: string; cor: string; bg: string } {
  if (pontos <= 10) return { label: "Baixo indicativo", cor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
  if (pontos <= 20) return { label: "Indício moderado",  cor: "text-amber-700",   bg: "bg-amber-50 border-amber-200" };
  return               { label: "Indício elevado",       cor: "text-rose-700",    bg: "bg-rose-50 border-rose-200" };
}

type FormData = {
  respostas: number[];
  nomePaciente: string;
  nomeResponsavel: string;
  profissional: string;
  especialidade: string;
  idade: string;
};

type TriagemSalva = {
  id: number;
  nome: string;
  idade: string | null;
  responsavel: string | null;
  profissional: string | null;
  especialidade: string | null;
  data: string | null;
  resultado: string | null;
  createdAt: string;
};

function Header({ showLista = false }: { showLista?: boolean }) {
  return (
    <div className="bg-primary text-primary-foreground py-6 px-6 shadow-md">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">NFs – Triagem Multidisciplinar</h1>
          <p className="mt-0.5 text-primary-foreground/80 text-xs md:text-sm">
            Instrumento de triagem para identificação de necessidades terapêuticas
          </p>
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

function Formulario({ onSubmit }: { onSubmit: (f: FormData) => void }) {
  const [respostas, setRespostas] = useState<number[]>(Array(PERGUNTAS.length).fill(0));
  const [nomePaciente, setNomePaciente] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [profissional, setProfissional] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [idade, setIdade] = useState("");
  const [areaAtiva, setAreaAtiva] = useState(AREAS[0]);

  const perguntasDaArea = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === areaAtiva);
  const areaIdx = AREAS.indexOf(areaAtiva);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ respostas, nomePaciente, nomeResponsavel, profissional, especialidade, idade });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-4">Dados de Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Nome do Paciente *</label>
              <input required value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nome completo" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Idade</label>
              <input value={idade} onChange={(e) => setIdade(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Ex.: 8 anos" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Responsável</label>
              <input value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nome do responsável" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Profissional Responsável</label>
              <input value={profissional} onChange={(e) => setProfissional(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Nome do profissional" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-muted-foreground mb-1">Especialidade</label>
              <input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Ex.: Psicologia, Fonoaudiologia" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {AREAS.map((area, i) => {
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

        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b border-border ${CORES_AREA[areaAtiva] ?? "bg-gray-50"}`}>
            <h2 className="font-bold text-lg">{areaAtiva}</h2>
            <p className="text-sm opacity-80">Área {areaIdx + 1} de {AREAS.length} — {perguntasDaArea.length} perguntas</p>
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
                Finalizar Triagem ✓
              </button>
            )}
          </div>
        </div>

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

function Relatorio({ formData, onNova }: { formData: FormData; onNova: () => void }) {
  const { respostas, nomePaciente, nomeResponsavel, profissional, especialidade, idade } = formData;
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [, navigate] = useLocation();
  const data = new Date().toLocaleDateString("pt-BR");

  const porArea = AREAS.map((area) => {
    const pergs = PERGUNTAS.map((p, i) => ({ ...p, idx: i })).filter((p) => p.area === area);
    const pontos = pergs.reduce((a, p) => a + respostas[p.idx], 0);
    const max = pergs.length * 3;
    const pct = Math.round((pontos / max) * 100);
    return { area, pontos, max, pct, nivel: classificar(pontos) };
  });

  const ranking = [...porArea].sort((a, b) => b.pontos - a.pontos);
  const top3 = ranking.slice(0, 3).filter((a) => a.pontos > 0);
  const totalPontos = respostas.reduce((a, b) => a + b, 0);
  const totalMax = PERGUNTAS.length * 3;
  const pctTotal = Math.round((totalPontos / totalMax) * 100);

  const resultadoTexto = ranking.map(({ area, pontos, nivel }) =>
    `${area}: ${pontos} pontos - ${nivel.label}`
  ).join(" | ");

  const salvarTriagem = async () => {
    setSalvando(true);
    try {
      await fetch(`${API}/triagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomePaciente,
          idade,
          responsavel: nomeResponsavel,
          profissional,
          especialidade,
          data,
          resultado: resultadoTexto,
        }),
      });
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showLista />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="font-bold text-base text-muted-foreground uppercase tracking-wider mb-4">Paciente</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground font-semibold">Nome</p><p className="font-bold text-foreground">{nomePaciente || "—"}</p></div>
            <div><p className="text-muted-foreground font-semibold">Idade</p><p className="font-bold text-foreground">{idade || "—"}</p></div>
            <div><p className="text-muted-foreground font-semibold">Responsável</p><p className="font-bold text-foreground">{nomeResponsavel || "—"}</p></div>
            <div><p className="text-muted-foreground font-semibold">Data</p><p className="font-bold text-foreground">{data}</p></div>
          </div>
          {profissional && (
            <div className="mt-4 pt-4 border-t border-border text-sm">
              <p className="text-muted-foreground font-semibold">Profissional Responsável pela Triagem</p>
              <p className="font-bold text-foreground">{profissional}{especialidade ? ` — ${especialidade}` : ""}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pontuação Total</p>
            <p className="text-4xl font-bold text-foreground mt-1">{totalPontos} <span className="text-lg font-normal text-muted-foreground">/ {totalMax}</span></p>
            <p className="text-sm text-muted-foreground mt-1">{pctTotal}% da pontuação máxima</p>
          </div>
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={pctTotal >= 65 ? "#f43f5e" : pctTotal >= 40 ? "#f59e0b" : "#10b981"}
                strokeWidth="3" strokeDasharray={`${pctTotal} ${100 - pctTotal}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{pctTotal}%</span>
            </div>
          </div>
        </div>

        {top3.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <h2 className="font-bold text-lg text-foreground mb-4">🏆 Prioridades (Top {top3.length})</h2>
            <div className="space-y-3">
              {top3.map(({ area, pontos, nivel }, i) => (
                <div key={area} className={`flex items-center gap-4 p-4 rounded-xl border ${nivel.bg}`}>
                  <span className="text-2xl font-black text-muted-foreground/40 w-8 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className={`font-bold text-base ${nivel.cor}`}>{area}</p>
                    <p className={`text-sm font-semibold ${nivel.cor}`}>{nivel.label}</p>
                  </div>
                  <span className="text-2xl font-bold text-foreground">{pontos}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="font-bold text-lg text-foreground mb-5">Resultado por Área</h2>
          <div className="space-y-4">
            {ranking.map(({ area, pontos, max, pct, nivel }) => (
              <div key={area}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${CORES_AREA[area] ?? "bg-gray-100"}`}>{area}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={`font-bold ${nivel.cor}`}>{nivel.label}</span>
                    <span className="text-muted-foreground">{pontos}/{max}</span>
                  </div>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${BARRA_AREA[area] ?? "bg-gray-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
          <p className="font-bold mb-1">Importante</p>
          <p>Este documento refere-se a uma triagem inicial, baseada em observações estruturadas, não constituindo diagnóstico clínico ou laudo profissional. Os resultados indicam possíveis necessidades e servem como apoio para encaminhamento para avaliação com profissionais especializados.</p>
        </div>

        <div className="flex flex-wrap gap-3 justify-center pb-8">
          <button onClick={() => window.print()}
            className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
            🖨️ Imprimir / Salvar PDF
          </button>
          {!salvo ? (
            <button onClick={salvarTriagem} disabled={salvando}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
              {salvando ? "Salvando…" : "💾 Salvar Triagem"}
            </button>
          ) : (
            <button onClick={() => navigate("/lista")}
              className="px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
              ✓ Salvo! Ver Pacientes →
            </button>
          )}
          <button onClick={onNova}
            className="px-6 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
            Nova Triagem
          </button>
        </div>
      </div>
    </div>
  );
}

function ListaPacientes() {
  const [triagens, setTriagens] = useState<TriagemSalva[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch(`${API}/triagens`)
      .then((r) => r.json())
      .then((data) => setTriagens(data))
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, []);

  const excluir = async (id: number) => {
    if (!confirm("Excluir esta triagem?")) return;
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

  return (
    <div className="min-h-screen bg-background">
      <Header showLista />
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Pacientes Triados</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{triagens.length} triagem(ns) registrada(s)</p>
          </div>
        </div>

        {carregando ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground">
            Carregando…
          </div>
        ) : triagens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="font-semibold text-foreground">Nenhuma triagem salva ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Realize uma triagem e clique em "Salvar Triagem" para ela aparecer aqui.</p>
            <Link href="/" className="mt-4 inline-block px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Iniciar Triagem
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {triagens.map((t) => {
              const areas = parseResultado(t.resultado);
              const top3 = [...areas].slice(0, 3);
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-border p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-lg text-foreground">{t.nome}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                        {t.idade && <span>Idade: {t.idade}</span>}
                        {t.responsavel && <span>Resp.: {t.responsavel}</span>}
                        {t.profissional && (
                          <span>{t.profissional}{t.especialidade ? ` — ${t.especialidade}` : ""}</span>
                        )}
                        {t.data && <span>📅 {t.data}</span>}
                      </div>
                    </div>
                    <button onClick={() => excluir(t.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors text-xl flex-shrink-0"
                      title="Excluir">
                      ×
                    </button>
                  </div>

                  {top3.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Top Prioridades</p>
                      <div className="flex flex-wrap gap-2">
                        {top3.map(({ area, pontos, nivel }) => {
                          const cor = nivel === "Indício elevado" ? "bg-rose-100 text-rose-800 border-rose-200"
                            : nivel === "Indício moderado" ? "bg-amber-100 text-amber-800 border-amber-200"
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

function TriagemFlow() {
  const [formData, setFormData] = useState<FormData | null>(null);

  if (formData) {
    return <Relatorio formData={formData} onNova={() => setFormData(null)} />;
  }
  return <Formulario onSubmit={setFormData} />;
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/lista" component={ListaPacientes} />
        <Route path="/" component={TriagemFlow} />
      </Switch>
    </WouterRouter>
  );
}

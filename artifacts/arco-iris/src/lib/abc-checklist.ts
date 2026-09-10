/**
 * ABC — Autism Behavior Checklist (Krug, Arick & Almond), versão brasileira
 * ICA (Inventário de Comportamentos Autísticos, Marteleto & Pedromônico).
 *
 * 57 itens, cada um com peso 1–4, distribuídos em 5 áreas:
 *   ES  Estímulo Sensorial            (máx. 26)
 *   RE  Relacionamento                (máx. 38)
 *   CO  Uso do Corpo e Objetos        (máx. 38)
 *   LG  Linguagem                     (máx. 31)
 *   PS  Desenvolvimento Pessoal-Social (máx. 25)
 * Total máximo: 158.
 *
 * Grau de impacto (pontos de corte clássicos do ABC):
 *   Nível 1 — Alto impacto     total >= 68  (vermelho)
 *   Nível 2 — Impacto moderado 47..67       (amarelo)
 *   Nível 3 — Baixo impacto    total <  47  (verde)
 */

export type AbcAreaKey = "sensorial" | "relacionamento" | "corpo" | "linguagem" | "pessoalSocial";

export type AbcItem = {
  /** Número do item no protocolo (1..57) — é o que fica gravado em `respostas`. */
  id: number;
  area: AbcAreaKey;
  peso: 1 | 2 | 3 | 4;
  texto: string;
};

export const ABC_AREAS: { key: AbcAreaKey; label: string; short: string; color: string }[] = [
  { key: "sensorial",      label: "Estímulo Sensorial",              short: "Sensorial",   color: "#38bdf8" },
  { key: "relacionamento", label: "Relacionamento",                  short: "Relacion.",   color: "#f472b6" },
  { key: "corpo",          label: "Uso do Corpo e Objetos",          short: "Corpo/Obj.",  color: "#a78bfa" },
  { key: "linguagem",      label: "Linguagem",                       short: "Linguagem",   color: "#fbbf24" },
  { key: "pessoalSocial",  label: "Desenvolvimento Pessoal e Social", short: "Pessoal-Soc.", color: "#34d399" },
];

export const ABC_ITEMS: AbcItem[] = [
  { id: 1,  area: "corpo",          peso: 4, texto: "Gira em torno de si mesmo por longos períodos de tempo" },
  { id: 2,  area: "pessoalSocial",  peso: 2, texto: "Aprende uma tarefa simples, mas a esquece rapidamente" },
  { id: 3,  area: "sensorial",      peso: 4, texto: "Frequentemente não presta atenção a estímulos sociais/ambientais" },
  { id: 4,  area: "linguagem",      peso: 1, texto: "Não segue ordens simples dadas uma única vez (sente-se, venha aqui, levante-se)" },
  { id: 5,  area: "corpo",          peso: 2, texto: "Não usa os brinquedos de forma adequada (gira rodas, enfileira, bate)" },
  { id: 6,  area: "sensorial",      peso: 2, texto: "Discriminação visual pobre — fixa-se em uma característica do objeto (cor, posição)" },
  { id: 7,  area: "relacionamento", peso: 2, texto: "Não sorri socialmente (sorriso de resposta)" },
  { id: 8,  area: "linguagem",      peso: 3, texto: "Usa pronomes de modo inadequado (refere-se a si mesmo como 'ele', 'você')" },
  { id: 9,  area: "corpo",          peso: 3, texto: "Insiste em manter certos objetos consigo" },
  { id: 10, area: "sensorial",      peso: 3, texto: "Parece não ouvir, a ponto de se suspeitar de surdez" },
  { id: 11, area: "linguagem",      peso: 4, texto: "Fala sem entonação e sem ritmo (monótona)" },
  { id: 12, area: "corpo",          peso: 4, texto: "Balança-se por longos períodos de tempo" },
  { id: 13, area: "relacionamento", peso: 2, texto: "Não estende os braços para ser pego (não antecipa ser carregado)" },
  { id: 14, area: "relacionamento", peso: 3, texto: "Reage fortemente a mudanças na rotina e no ambiente" },
  { id: 15, area: "relacionamento", peso: 2, texto: "Não responde ao próprio nome quando chamado entre dois outros nomes" },
  { id: 16, area: "corpo",          peso: 4, texto: "Faz movimentos repetitivos com as mãos ou objetos (agita, gira, bate) por longos períodos" },
  { id: 17, area: "sensorial",      peso: 3, texto: "Não reage a estímulos dolorosos (não se importa em se machucar)" },
  { id: 18, area: "linguagem",      peso: 4, texto: "Repete frases ou perguntas ouvidas anteriormente fora de contexto (ecolalia tardia)" },
  { id: 19, area: "relacionamento", peso: 4, texto: "Olha 'através' das pessoas (olhar vazio, evita contato visual)" },
  { id: 20, area: "sensorial",      peso: 4, texto: "Cobre os ouvidos com frequência diante de sons" },
  { id: 21, area: "corpo",          peso: 3, texto: "Bate, agride ou morde a si mesmo (autoagressão)" },
  { id: 22, area: "relacionamento", peso: 3, texto: "Não imita outras crianças em brincadeiras" },
  { id: 23, area: "sensorial",      peso: 3, texto: "Não reage a barulhos altos ou reage de forma exagerada a barulhos leves" },
  { id: 24, area: "pessoalSocial",  peso: 2, texto: "Fica ativo/agitado por longos períodos e não se cansa" },
  { id: 25, area: "linguagem",      peso: 2, texto: "Repete sons ou palavras várias vezes seguidas (ecolalia imediata)" },
  { id: 26, area: "pessoalSocial",  peso: 3, texto: "Precisa que as tarefas sejam mostradas ou modeladas diversas vezes" },
  { id: 27, area: "pessoalSocial",  peso: 2, texto: "Fica sozinho por longos períodos, sem procurar companhia" },
  { id: 28, area: "relacionamento", peso: 3, texto: "Não busca conforto quando machucado ou aborrecido" },
  { id: 29, area: "pessoalSocial",  peso: 3, texto: "Não segue rotinas de autocuidado adequadas à idade (vestir-se, lavar-se)" },
  { id: 30, area: "corpo",          peso: 3, texto: "Bate a cabeça ou se joga no chão com frequência" },
  { id: 31, area: "linguagem",      peso: 3, texto: "Não consegue apontar para 5 objetos nomeados" },
  { id: 32, area: "relacionamento", peso: 4, texto: "Não faz amizade / não busca outras crianças" },
  { id: 33, area: "sensorial",      peso: 2, texto: "Fixa-se em luzes, objetos que giram ou padrões visuais" },
  { id: 34, area: "linguagem",      peso: 2, texto: "Usa a mão do adulto como ferramenta para pegar o que quer" },
  { id: 35, area: "pessoalSocial",  peso: 3, texto: "Não brinca de faz-de-conta ou brincadeiras simbólicas" },
  { id: 36, area: "corpo",          peso: 3, texto: "Anda na ponta dos pés" },
  { id: 37, area: "linguagem",      peso: 3, texto: "Não usa frases de duas palavras ou mais para se comunicar (quando esperado para a idade)" },
  { id: 38, area: "relacionamento", peso: 3, texto: "Prefere brincar sozinho e ignora tentativas de aproximação" },
  { id: 39, area: "pessoalSocial",  peso: 2, texto: "Não reconhece o perigo em situações comuns" },
  { id: 40, area: "corpo",          peso: 3, texto: "Cheira, lambe ou coloca na boca objetos não comestíveis" },
  { id: 41, area: "linguagem",      peso: 2, texto: "Não responde a perguntas simples com sim/não ou gestos" },
  { id: 42, area: "relacionamento", peso: 2, texto: "Não gosta de ser tocado ou abraçado (evita contato físico)" },
  { id: 43, area: "linguagem",      peso: 1, texto: "Não aponta para pedir ou mostrar interesse" },
  { id: 44, area: "pessoalSocial",  peso: 2, texto: "Não reage a elogios ou reforços sociais" },
  { id: 45, area: "sensorial",      peso: 3, texto: "Reage de forma exagerada a texturas, cheiros ou sabores" },
  { id: 46, area: "corpo",          peso: 3, texto: "Faz caretas, movimentos de dedos ou posturas estranhas repetidamente" },
  { id: 47, area: "relacionamento", peso: 4, texto: "Não demonstra afeto por familiares (indiferente à chegada/saída)" },
  { id: 48, area: "pessoalSocial",  peso: 2, texto: "Tem birras intensas e prolongadas com mudanças pequenas" },
  { id: 49, area: "sensorial",      peso: 2, texto: "Encara as próprias mãos ou objetos bem próximos aos olhos" },
  { id: 50, area: "linguagem",      peso: 3, texto: "Não inicia conversa nem mantém diálogo simples" },
  { id: 51, area: "relacionamento", peso: 3, texto: "Não demonstra atenção compartilhada (não olha para onde o adulto aponta)" },
  { id: 52, area: "corpo",          peso: 3, texto: "Corre em círculos ou anda de um lado para o outro sem objetivo" },
  { id: 53, area: "pessoalSocial",  peso: 1, texto: "Recusa alimentos novos, come poucos alimentos (seletividade alimentar)" },
  { id: 54, area: "linguagem",      peso: 3, texto: "Não compreende ordens com duas etapas (pegue o copo e ponha na mesa)" },
  { id: 55, area: "corpo",          peso: 3, texto: "Manipula objetos de forma repetitiva (abre/fecha, liga/desliga)" },
  { id: 56, area: "relacionamento", peso: 3, texto: "Não consegue brincar em grupo ou seguir regras de jogos simples" },
  { id: 57, area: "pessoalSocial",  peso: 3, texto: "Não é independente para comer, ir ao banheiro ou vestir-se conforme a idade" },
];

export const ABC_AREA_MAX: Record<AbcAreaKey, number> = ABC_ITEMS.reduce(
  (acc, it) => { acc[it.area] += it.peso; return acc; },
  { sensorial: 0, relacionamento: 0, corpo: 0, linguagem: 0, pessoalSocial: 0 } as Record<AbcAreaKey, number>,
);

export const ABC_TOTAL_MAX = ABC_ITEMS.reduce((s, it) => s + it.peso, 0);

export type AbcNivel = 1 | 2 | 3;

export const ABC_NIVEL_ALTO_MIN = 68;
export const ABC_NIVEL_MODERADO_MIN = 47;

export function abcNivel(total: number): AbcNivel {
  if (total >= ABC_NIVEL_ALTO_MIN) return 1;
  if (total >= ABC_NIVEL_MODERADO_MIN) return 2;
  return 3;
}

export const ABC_NIVEL_INFO: Record<AbcNivel, { label: string; short: string; color: string; bg: string; border: string }> = {
  1: { label: "Nível 1 — Alto Impacto",     short: "Alto",     color: "#f87171", bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.5)" },
  2: { label: "Nível 2 — Impacto Moderado", short: "Moderado", color: "#fbbf24", bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.5)" },
  3: { label: "Nível 3 — Baixo Impacto",    short: "Baixo",    color: "#4ade80", bg: "rgba(74,222,128,0.15)",  border: "rgba(74,222,128,0.5)" },
};

export type AbcScores = {
  porArea: Record<AbcAreaKey, number>;
  total: number;
  nivel: AbcNivel;
};

/** Calcula pontuação por área, total e nível a partir dos itens marcados. */
export function calcAbcScores(marcados: Iterable<number>): AbcScores {
  const set = new Set(marcados);
  const porArea: Record<AbcAreaKey, number> = { sensorial: 0, relacionamento: 0, corpo: 0, linguagem: 0, pessoalSocial: 0 };
  let total = 0;
  for (const it of ABC_ITEMS) {
    if (!set.has(it.id)) continue;
    porArea[it.area] += it.peso;
    total += it.peso;
  }
  return { porArea, total, nivel: abcNivel(total) };
}

export function abcItemsByArea(area: AbcAreaKey): AbcItem[] {
  return ABC_ITEMS.filter(i => i.area === area);
}

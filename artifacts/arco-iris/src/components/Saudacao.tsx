import { useEffect, useState } from "react";
import { Sun, Sunset, Moon } from "lucide-react";
import { getCurrentScope, getProfessionalSession } from "@/lib/portal-session";

// 25 aberturas × 20 complementos = 500 frases diferentes.
const ABERTURAS = [
  "Cada pequeno avanço de uma criança é uma grande conquista.",
  "O cuidado que você oferece hoje transforma o amanhã de uma família inteira.",
  "Seu trabalho é ponte entre a dificuldade e a possibilidade.",
  "Paciência, afeto e técnica formam a combinação que muda vidas.",
  "Quem cuida com amor deixa marcas que o tempo não apaga.",
  "Por trás de cada sessão existe uma família cheia de esperança.",
  "Respeitar o tempo de cada criança é o primeiro passo para o seu desenvolvimento.",
  "Grandes transformações começam com pequenos gestos de cuidado.",
  "Cada sorriso conquistado na terapia vale o dia inteiro.",
  "Acolher também é tratar.",
  "Você não apenas atende: você abre caminhos.",
  "O desenvolvimento acontece no encontro entre ciência e afeto.",
  "Toda criança merece alguém que acredite no seu potencial.",
  "Persistência e carinho constroem conquistas que pareciam impossíveis.",
  "Escutar com atenção é um dos gestos mais terapêuticos que existem.",
  "O progresso não precisa ser rápido, precisa ser constante.",
  "Excelência é feita de detalhes, e cada detalhe conta.",
  "Juntos, transformamos desafios em desenvolvimento.",
  "Ensinar uma nova habilidade é entregar liberdade para o futuro.",
  "A dedicação de hoje é a autonomia de amanhã.",
  "Onde há cuidado verdadeiro, há evolução.",
  "Cada família que sai daqui mais confiante é fruto do trabalho de toda a equipe.",
  "Uma equipe unida faz da terapia um lugar de confiança.",
  "Sua presença traz segurança para quem ainda está aprendendo a confiar.",
  "Cada conquista, por menor que pareça, merece ser celebrada.",
];
const COMPLEMENTOS = [
  "Obrigado por fazer parte disso.",
  "Que o seu dia seja leve e cheio de boas conquistas.",
  "Obrigado pela sua dedicação.",
  "Seu trabalho faz a diferença.",
  "Conte sempre com a nossa equipe.",
  "Que hoje seja um dia de bons encontros.",
  "Respire, você está fazendo um ótimo trabalho.",
  "Siga em frente com confiança.",
  "Hoje é mais um dia para acolher, ensinar e acreditar.",
  "Obrigado por escolher fazer a diferença todos os dias.",
  "Que não falte energia nem carinho no seu dia.",
  "Cuidar de quem cuida também importa.",
  "Seu compromisso fortalece a nossa missão.",
  "Bom trabalho e ótimos atendimentos.",
  "Acredite no poder do seu trabalho.",
  "Cada atendimento é uma chance de fazer o bem.",
  "Que o seu olhar atento continue iluminando caminhos.",
  "A NFS tem orgulho de ter você na equipe.",
  "Que este período seja produtivo e tranquilo.",
  "Você é parte essencial dessa história.",
];
const FECHO_EXPEDIENTE = "Bom trabalho e ótimos atendimentos.";
const TOTAL_FRASES = ABERTURAS.length * COMPLEMENTOS.length;

/** Frase n (0..499): percorre todas as combinações sem repetir a abertura em seguida. */
function frase(n: number) {
  const i = ((n % TOTAL_FRASES) + TOTAL_FRASES) % TOTAL_FRASES;
  const a = i % ABERTURAS.length;
  const b = (Math.floor(i / ABERTURAS.length) + a) % COMPLEMENTOS.length;
  return `${ABERTURAS[a]} ${COMPLEMENTOS[b]}`;
}

function agoraBR() {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(s);
}

function periodo(h: number) {
  if (h >= 5 && h < 12) return { idx: 0, texto: "Bom dia", Icon: Sun, cor: "text-amber-300" };
  if (h >= 12 && h < 18) return { idx: 1, texto: "Boa tarde", Icon: Sunset, cor: "text-orange-300" };
  return { idx: 2, texto: "Boa noite", Icon: Moon, cor: "text-indigo-300" };
}

/** Saudação conforme o horário (Brasília), com o nome de quem está usando e uma frase que muda a cada período. */
export function Saudacao({ nome, detalhe, pessoaId }: { nome?: string | null; detalhe?: string | null; pessoaId?: number | null }) {
  const [agora, setAgora] = useState(agoraBR);
  useEffect(() => {
    const t = setInterval(() => setAgora(agoraBR()), 60_000);
    return () => clearInterval(t);
  }, []);

  let quem = nome?.trim() || "";
  let id = pessoaId ?? null;
  let sub = detalhe ?? null;
  if (!quem) {
    const prof = getProfessionalSession();
    const scope = getCurrentScope();
    if (prof?.professionalName) { quem = prof.professionalName; sub = sub ?? prof.specialty ?? null; id = id ?? prof.professionalId; }
    else quem = scope === "reception" ? "Equipe da Recepção" : "Equipe de Gestão";
  }
  const { idx, texto, Icon, cor } = periodo(agora.getHours());
  // Muda a cada período (manhã/tarde/noite); a madrugada usa a frase da noite anterior.
  const base = new Date(agora.getTime() - (agora.getHours() < 5 ? 86400000 : 0));
  const dias = Math.floor(base.getTime() / 86400000);
  // Cada pessoa tem um deslocamento próprio: no mesmo período, colegas veem frases diferentes.
  const semente = id ?? [...quem].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % TOTAL_FRASES, 7);
  const n = dias * 3 + idx + semente * 37;
  // Até as 17h a frase sempre termina com o desejo de bom trabalho.
  const h = agora.getHours();
  const fraseAtual = h >= 5 && h < 17
    ? `${ABERTURAS[((n % ABERTURAS.length) + ABERTURAS.length) % ABERTURAS.length]} ${FECHO_EXPEDIENTE}`
    : frase(n);
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-card/70 backdrop-blur px-5 py-4 flex items-center gap-4 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
      <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className={`w-7 h-7 ${cor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl md:text-2xl font-bold leading-tight text-foreground">
          {texto}, <span className="text-primary">{quem}</span>
          {sub && <span className="ml-2 text-sm font-medium text-muted-foreground">· {sub}</span>}
        </p>
        <p className="mt-1 text-sm md:text-[15px] italic text-foreground/80">“{fraseAtual}”</p>
      </div>
      <p className="hidden md:block shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{data}</p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Sun, Sunset, Moon } from "lucide-react";
import { getCurrentScope, getProfessionalSession } from "@/lib/portal-session";

const FRASES = [
  "Cada pequeno avanço de uma criança é uma grande conquista. Obrigado por fazer parte disso.",
  "O cuidado que você oferece hoje transforma o amanhã de uma família inteira.",
  "Seu trabalho é ponte entre a dificuldade e a possibilidade.",
  "Paciência, afeto e técnica: a combinação que muda vidas.",
  "Quem cuida com amor deixa marcas que o tempo não apaga.",
  "Hoje é mais um dia para acolher, ensinar e acreditar.",
  "Por trás de cada sessão existe uma família cheia de esperança. Obrigado por cuidar dela.",
  "Respeitar o tempo de cada criança é o primeiro passo para o seu desenvolvimento.",
  "Seu olhar atento faz diferença na vida de quem mais precisa.",
  "Grandes transformações começam com pequenos gestos de cuidado.",
  "Uma equipe unida faz da terapia um lugar de confiança e acolhimento.",
  "Cada sorriso conquistado na terapia vale o dia inteiro.",
  "Acolher também é tratar. Obrigado pela sua dedicação.",
  "Você não apenas atende: você abre caminhos.",
  "O desenvolvimento acontece no encontro entre ciência e afeto.",
  "Toda criança merece alguém que acredite no seu potencial. Hoje, esse alguém é você.",
  "Persistência e carinho constroem conquistas que pareciam impossíveis.",
  "Seu compromisso fortalece a nossa missão de cuidar com excelência.",
  "Cada família que sai daqui mais confiante é fruto do seu trabalho.",
  "Escutar com atenção é um dos gestos mais terapêuticos que existem.",
  "O progresso não precisa ser rápido, precisa ser constante.",
  "Que o dia de hoje seja leve, produtivo e cheio de boas conquistas.",
  "Cuidar de quem cuida também importa. Respire, você está fazendo um ótimo trabalho.",
  "Excelência é feita de detalhes, e você cuida de cada um deles.",
  "Juntos, transformamos desafios em desenvolvimento.",
  "Sua presença traz segurança para quem ainda está aprendendo a confiar.",
  "Cada atendimento é uma oportunidade de fazer o bem com competência.",
  "Ensinar uma nova habilidade é entregar liberdade para o futuro.",
  "A dedicação de hoje é a autonomia de amanhã.",
  "Obrigado por escolher, todos os dias, fazer a diferença.",
  "Onde há cuidado verdadeiro, há evolução.",
];

function agoraBR() {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(s);
}

function periodo(h: number) {
  if (h >= 5 && h < 12) return { texto: "Bom dia", Icon: Sun, cor: "text-amber-300" };
  if (h >= 12 && h < 18) return { texto: "Boa tarde", Icon: Sunset, cor: "text-orange-300" };
  return { texto: "Boa noite", Icon: Moon, cor: "text-indigo-300" };
}

function diaDoAno(d: Date) {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

/** Saudação conforme o horário (Brasília), com o nome de quem está usando e uma frase do dia. */
export function Saudacao({ nome, detalhe }: { nome?: string | null; detalhe?: string | null }) {
  const [agora, setAgora] = useState(agoraBR);
  useEffect(() => {
    const t = setInterval(() => setAgora(agoraBR()), 60_000);
    return () => clearInterval(t);
  }, []);

  let quem = nome?.trim() || "";
  let sub = detalhe ?? null;
  if (!quem) {
    const prof = getProfessionalSession();
    const scope = getCurrentScope();
    if (prof?.professionalName) { quem = prof.professionalName; sub = sub ?? prof.specialty ?? null; }
    else quem = scope === "reception" ? "Equipe da Recepção" : "Equipe de Gestão";
  }
  const { texto, Icon, cor } = periodo(agora.getHours());
  const frase = FRASES[diaDoAno(agora) % FRASES.length];
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
        <p className="mt-1 text-sm md:text-[15px] italic text-foreground/80">“{frase}”</p>
      </div>
      <p className="hidden md:block shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{data}</p>
    </div>
  );
}

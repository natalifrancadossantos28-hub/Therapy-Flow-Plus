import { Cake, PartyPopper } from "lucide-react";
import {
  birthdayAge,
  firstName,
  isBirthdayToday,
  isCategoryDayToday,
} from "@/lib/datas-profissionais";

type Props = {
  name: string | undefined;
  specialty: string | null | undefined;
  birthDate: string | null | undefined;
};

/**
 * Aviso comemorativo exibido na agenda do profissional no dia do aniversário
 * dele e no dia da categoria. Quando as duas datas coincidem, mostra as duas.
 */
export function CelebrationBanner({ name, specialty, birthDate }: Props) {
  if (!name) return null;

  const aniversario = isBirthdayToday(birthDate);
  const categoria = isCategoryDayToday(specialty);
  if (!aniversario && !categoria) return null;

  const primeiro = firstName(name);
  const idade = aniversario ? birthdayAge(birthDate) : null;

  return (
    <div className="space-y-2 mb-4">
      {aniversario && (
        <div
          className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{
            border: "1px solid rgba(236,72,153,0.5)",
            background: "rgba(236,72,153,0.10)",
            boxShadow: "0 0 24px rgba(236,72,153,0.18)",
          }}
        >
          <Cake className="w-6 h-6 shrink-0" style={{ color: "#f472b6" }} />
          <div>
            <p className="font-bold text-foreground">Feliz aniversário, {primeiro}! 🎉</p>
            <p className="text-sm text-foreground/70">
              {idade ? `${idade} anos de vida — que ` : "Que "}
              hoje seja um dia especial. Toda a equipe do Núcleo de Atendimento Novo
              Arco-íris deseja muitas felicidades! 🌈
            </p>
          </div>
        </div>
      )}

      {categoria && (
        <div
          className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{
            border: "1px solid rgba(168,85,247,0.5)",
            background: "rgba(168,85,247,0.10)",
            boxShadow: "0 0 24px rgba(168,85,247,0.18)",
          }}
        >
          <PartyPopper className="w-6 h-6 shrink-0" style={{ color: "#c084fc" }} />
          <div>
            <p className="font-bold text-foreground">
              Parabéns pelo seu dia, {categoria.role}! 🎉
            </p>
            <p className="text-sm text-foreground/70">
              Hoje é o {categoria.title}. Obrigado, {primeiro}, por todo o cuidado que
              você dedica às nossas crianças e famílias. 🌈
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

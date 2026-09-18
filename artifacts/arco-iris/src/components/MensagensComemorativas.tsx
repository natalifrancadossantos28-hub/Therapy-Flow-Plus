import { useCallback, useEffect, useState } from "react";
import { Cake, Check, PartyPopper, Copy } from "lucide-react";
import {
  gerarMensagensComemorativas,
  listMensagensProfissional,
  marcarMensagemProfissionalLida,
  type MensagemProfissional,
} from "@/lib/arco-rpc";
import { copyToClipboard } from "@/lib/datas-profissionais";
import { useToast } from "@/hooks/use-toast";

type Props = { professionalId: number | null };

function fmtData(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Caixa de mensagens comemorativas do profissional. A rotina do banco grava
 * sozinha o parabéns no dia do aniversário e no dia da categoria; aqui só
 * exibimos o que ainda não foi lido.
 */
export function MensagensComemorativas({ professionalId }: Props) {
  const { toast } = useToast();
  const [mensagens, setMensagens] = useState<MensagemProfissional[]>([]);

  // Falha silenciosa: sem a migração 0105 a agenda continua funcionando.
  const carregar = useCallback(() => {
    if (professionalId == null) return;
    gerarMensagensComemorativas()
      .catch(() => undefined)
      .then(() => listMensagensProfissional(professionalId, 10))
      .then((lista) => setMensagens(lista.filter((m) => !m.lido)))
      .catch(() => undefined);
  }, [professionalId]);

  useEffect(() => { carregar(); }, [carregar]);

  const fechar = async (id: number) => {
    setMensagens((atual) => atual.filter((m) => m.id !== id));
    try {
      await marcarMensagemProfissionalLida(id);
    } catch {
      // se não gravar, a mensagem volta no próximo carregamento
    }
  };

  const copiar = async (texto: string) => {
    const ok = await copyToClipboard(texto);
    toast({ title: ok ? "Mensagem copiada" : "Não foi possível copiar" });
  };

  if (mensagens.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {mensagens.map((m) => {
        const aniversario = m.tipo === "aniversario";
        const cor = aniversario ? "236,72,153" : "168,85,247";
        const Icone = aniversario ? Cake : PartyPopper;
        return (
          <div
            key={m.id}
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{
              border: `1px solid rgba(${cor},0.5)`,
              background: `rgba(${cor},0.10)`,
              boxShadow: `0 0 24px rgba(${cor},0.18)`,
            }}
          >
            <Icone className="w-6 h-6 shrink-0 mt-0.5" style={{ color: aniversario ? "#f472b6" : "#c084fc" }} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground">{m.titulo}</p>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{m.mensagem}</p>
              <p className="text-[11px] text-foreground/50 mt-1">{fmtData(m.dataRef)}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => copiar(m.mensagem)}
                title="Copiar mensagem"
                className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/70"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => fechar(m.id)}
                title="Marcar como lida"
                className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/70"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

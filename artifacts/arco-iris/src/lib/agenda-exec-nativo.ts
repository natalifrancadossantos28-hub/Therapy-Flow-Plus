import type { AgxCompromisso } from "./agenda-exec-rpc";

// Ponte com o app Android da Minha Agenda (Capacitor). No navegador tudo aqui vira "não disponível".
export type StatusNativo = {
  notificacoes: boolean; exatos: boolean; telaCheia: boolean; bateria: boolean;
  agendados: number; proximo: string | null; sincronizadoEm: number;
};
type Ponte = {
  nativePromise?: (p: string, m: string, o?: object) => Promise<unknown>; Plugins?: Record<string, Record<string, (o?: object) => Promise<unknown>>>;
  getPlatform?: () => string; isPluginAvailable?: (nome: string) => boolean;
};

const ponte = () => (window as unknown as { Capacitor?: Ponte }).Capacitor;
// O APK publicado não manda "MinhaAgendaApp" no User-Agent; a ponte do Capacitor com o plugin é o sinal confiável.
export const ehAppNativo = () => {
  const c = ponte();
  if (!c) return false;
  if (typeof navigator !== "undefined" && /MinhaAgendaApp/.test(navigator.userAgent)) return true;
  return c.getPlatform?.() === "android" && (c.isPluginAvailable?.("AlarmeNativo") ?? true);
};

function chamar<T>(metodo: string, opcoes: object = {}): Promise<T> {
  const c = ponte();
  if (!c) return Promise.reject(new Error("App nativo indisponível"));
  if (c.nativePromise) return c.nativePromise("AlarmeNativo", metodo, opcoes) as Promise<T>;
  return c.Plugins!.AlarmeNativo[metodo](opcoes) as Promise<T>;
}

let configurado = "";
export async function sincronizarNativo(token: string, lista: AgxCompromisso[]) {
  if (!ehAppNativo()) return;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key && configurado !== token) { await chamar("configurar", { url, key, token }); configurado = token; }
  await chamar("sincronizar", { compromissos: lista });
}
export const sairNativo = () => (ehAppNativo() ? chamar<void>("sair").catch(() => {}) : Promise.resolve());
export const statusNativo = () => chamar<StatusNativo>("status");
export const pedirNotificacoesNativo = () => chamar<StatusNativo>("pedirNotificacoes");
export const abrirAjusteNativo = (tipo: "exatos" | "telaCheia" | "bateria" | "notificacoes") => chamar<void>("abrirAjuste", { tipo });
export const testarAlarmeNativo = () => chamar<void>("testar");

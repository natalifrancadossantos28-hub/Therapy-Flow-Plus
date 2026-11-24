/** Abre a conversa do WhatsApp com o texto pronto, no WhatsApp Web ou no aplicativo (escolha salva neste computador). */

export type WhatsAppModo = "web" | "app";
const KEY = "nfs_whatsapp_modo";
const JANELA = "whatsapp_nfs";

export function lerModoWhatsApp(): WhatsAppModo {
  try { return localStorage.getItem(KEY) === "app" ? "app" : "web"; } catch { return "web"; }
}

export function gravarModoWhatsApp(m: WhatsAppModo) {
  try { localStorage.setItem(KEY, m); } catch { /* sem storage */ }
}

/** `phone` só com dígitos (com 55) ou vazio para escolher o contato no WhatsApp. */
export function abrirWhatsApp(phone: string | null | undefined, msg: string) {
  const t = encodeURIComponent(msg);
  const ph = phone ? `phone=${phone}&` : "";
  if (lerModoWhatsApp() === "app") {
    // Aplicativo instalado: o navegador não abre aba nenhuma.
    window.location.href = `whatsapp://send?${ph}text=${t}`;
    return;
  }
  // Direto no WhatsApp Web, sem a página do wa.me. O WhatsApp Web corta o vínculo com a aba que o abriu
  // (Cross-Origin-Opener-Policy), então cada mensagem abre uma aba nova: feche com Ctrl+W depois de enviar.
  const w = window.open(`https://web.whatsapp.com/send?${ph}text=${t}`, JANELA);
  if (w) w.focus();
}

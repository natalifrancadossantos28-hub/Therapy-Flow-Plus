import { chavePush, registrarPush, removerPush } from "./agenda-exec-rpc";

// Avisos no celular (Web Push). No iPhone só funciona com o app na Tela de Início (iOS 16.4+).

export const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const ehAndroid = () => /android/i.test(navigator.userAgent);
export const instalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function chaveBytes(b64u: string): Uint8Array {
  const b64 = (b64u + "=".repeat((4 - (b64u.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function registroSW(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration("/"))) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function assinaturaAtual(): Promise<PushSubscription | null> {
  if (!pushSuportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

function descreverAparelho() {
  const ua = navigator.userAgent;
  const so = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "Outro";
  return `${so}${instalado() ? " · app" : " · navegador"}`;
}

/** Pede permissão, cria a assinatura e grava no servidor. Chamar direto no toque do botão. */
export async function ativarAvisos(): Promise<void> {
  if (!pushSuportado()) throw new Error(ehIOS() && !instalado()
    ? "No iPhone, primeiro adicione o app à Tela de Início e abra pelo ícone."
    : "Este navegador não recebe avisos. Use o Chrome no Android ou o app instalado no iPhone.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("As notificações foram bloqueadas. Libere nas configurações do celular para o NFs.");
  const chave = await chavePush();
  if (!chave) throw new Error("Os avisos ainda não foram configurados no servidor (falta a chave).");
  const reg = await registroSW();
  let sub = await reg.pushManager.getSubscription();
  const atual = sub?.options.applicationServerKey;
  if (sub && atual && btoa(String.fromCharCode(...new Uint8Array(atual))).replace(/=+$/, "") !==
      btoa(String.fromCharCode(...chaveBytes(chave))).replace(/=+$/, "")) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) as BufferSource });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("Não foi possível ativar neste aparelho.");
  await registrarPush(j.endpoint, j.keys.p256dh, j.keys.auth, descreverAparelho());
}

export async function desativarAvisos(): Promise<void> {
  const sub = await assinaturaAtual();
  if (!sub) return;
  await removerPush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

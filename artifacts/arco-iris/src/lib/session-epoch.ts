import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  clearDeviceEnrollment,
  getCompanySession,
  setCompanySession,
} from "@/lib/portal-session";

// Número de sessão da empresa: quando a Administração clica em
// "Desconectar todos os computadores" ele muda e todo login antigo cai.
export async function fetchSessionEpoch(slug: string): Promise<number | null> {
  if (!supabase || !slug) return null;
  const { data, error } = await supabase.rpc("get_session_epoch", { p_slug: slug });
  if (error || typeof data !== "number") return null;
  return data;
}

export async function stampSessionEpoch(): Promise<void> {
  const session = getCompanySession();
  if (!session?.companySlug) return;
  const epoch = await fetchSessionEpoch(session.companySlug);
  if (epoch === null) return;
  setCompanySession({ ...session, epoch });
}

export async function logoutAllDevices(): Promise<void> {
  const session = getCompanySession();
  if (!supabase || !session?.companySlug || !session.adminToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  const { data, error } = await supabase.rpc("logout_all_devices", {
    p_slug: session.companySlug,
    p_password: session.adminToken,
  });
  if (error) throw error;
  if (typeof data === "number") setCompanySession({ ...session, epoch: data });
}

async function checkSessionEpoch() {
  const session = getCompanySession();
  if (!session?.companySlug || session.type !== "company") return;
  const epoch = await fetchSessionEpoch(session.companySlug);
  if (epoch === null || session.epoch === epoch) return;
  sessionStorage.clear();
  clearDeviceEnrollment();
  window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/portal`;
}

export function useSessionEpochGuard() {
  useEffect(() => {
    void checkSessionEpoch();
    const id = window.setInterval(() => void checkSessionEpoch(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkSessionEpoch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

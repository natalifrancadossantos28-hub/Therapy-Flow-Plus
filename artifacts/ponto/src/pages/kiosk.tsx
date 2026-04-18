import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { Html5Qrcode } from "html5-qrcode";
import { useGetPontoEmployeeByCpf, useCreatePontoRecord } from "@/lib/ponto-hooks";
import { getCompanyBySlug } from "@/lib/ponto-rpc";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Zap, Building2, LogIn, Coffee, Utensils, LogOut, Camera, RefreshCw } from "lucide-react";
import {
  type CameraInfo,
  describeCameraError,
  isGetUserMediaSupported,
  isSecureContextOk,
  listCameras,
  pickPreferredCamera,
  requestCameraPermission,
} from "@/lib/camera";

// Play beep instantly — called at moment of QR detection, not after DB save
const playBeep = () => {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (_) {}
};

type ScanState = "idle" | "detected" | "success" | "error";
const RESET_DELAY_MS = 3500;

type PunchResult = {
  label: string;
  time: string;
  index: number;
  type: string;
};

const PUNCH_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ENTRADA_DIARIA: LogIn,
  SAIDA_ALMOCO: Utensils,
  RETORNO_ALMOCO: Coffee,
  SAIDA_FINAL: LogOut,
};

const PUNCH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ENTRADA_DIARIA: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
  SAIDA_ALMOCO:   { bg: "bg-amber-500/10", text: "text-amber-400",  border: "border-amber-500/30" },
  RETORNO_ALMOCO: { bg: "bg-blue-500/10",  text: "text-blue-400",   border: "border-blue-500/30" },
  SAIDA_FINAL:    { bg: "bg-rose-500/10",  text: "text-rose-400",   border: "border-rose-500/30" },
};

async function initCompanyContext(slug: string): Promise<{ id: number; name: string } | null> {
  try {
    const company = await getCompanyBySlug(slug);
    if (!company) return null;
    sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
      type: "kiosk",
      companyId: company.id,
      companyName: company.name,
      companySlug: slug.toLowerCase().trim(),
    }));
    return { id: company.id, name: company.name };
  } catch { return null; }
}

type CameraState = "checking" | "blocked" | "missing" | "ready";

export default function KioskPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scannedCpf, setScannedCpf] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [punchResult, setPunchResult] = useState<PunchResult | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("checking");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [permissionAttempt, setPermissionAttempt] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("c");
    if (!slug) {
      const existing = JSON.parse(sessionStorage.getItem("nfs_ponto_session") || "{}");
      if (existing.type === "kiosk") setCompanyName(existing.companyName ?? null);
      return;
    }
    setCompanyLoading(true);
    initCompanyContext(slug).then(company => {
      if (company) setCompanyName(company.name);
      else setCompanyError(`Empresa "${slug}" não encontrada ou inativa.`);
      setCompanyLoading(false);
    });
  }, []);

  const { data: employee, isFetching: isLoadingEmployee } = useGetPontoEmployeeByCpf(
    scannedCpf || "",
    { query: { enabled: !!scannedCpf, retry: false } }
  );

  const createRecord = useCreatePontoRecord();

  const pauseScanner = useCallback(() => {
    try { (scannerRef.current as unknown as { pause: (b?: boolean) => void } | null)?.pause(true); } catch (_) {}
  }, []);
  const resumeScanner = useCallback(() => {
    try { (scannerRef.current as unknown as { resume: (b?: boolean) => void } | null)?.resume(true); } catch (_) {}
  }, []);

  const scheduleReset = useCallback((delay = RESET_DELAY_MS) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setScanState("idle");
      setScannedCpf(null);
      setErrorMessage(null);
      setPunchResult(null);
      processingRef.current = false;
      resumeScanner();
    }, delay);
  }, [resumeScanner]);

  const showError = useCallback((msg: string) => {
    setScanState("error");
    setErrorMessage(msg);
    scheduleReset(4000);
  }, [scheduleReset]);

  const handleScan = useCallback((decodedText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    pauseScanner();
    playBeep();
    setScanState("detected");
    setScannedCpf(decodedText.trim());
  }, [pauseScanner]);

  // DB lookup complete → register punch
  useEffect(() => {
    if (!scannedCpf || scanState !== "detected") return;
    if (isLoadingEmployee) return;
    if (!employee) { showError("Funcionário não encontrado. Verifique seu crachá."); return; }

    createRecord.mutate(
      { data: { employeeId: employee.id, type: "ENTRADA_DIARIA" } }, // type overridden by server
      {
        onSuccess: (data: any) => {
          setPunchResult({
            label: data.punchTypeLabel ?? "ponto",
            time: format(new Date(data.punchedAt), "HH:mm"),
            index: data.punchIndex ?? 1,
            type: data.type ?? "ENTRADA_DIARIA",
          });
          setScanState("success");
          scheduleReset();
        },
        onError: (err: any) => {
          const msg = (err?.data as any)?.error ?? err?.message ?? "Erro ao registrar ponto. Tente novamente.";
          showError(msg);
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedCpf, scanState, isLoadingEmployee, employee]);

  // 1) Ask for camera permission up-front, then list cameras and pick the best
  //    one (prefer USB webcam). Re-runs when the user clicks "Tentar novamente".
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setCameraState("checking");
      setCameraError(null);

      if (!isGetUserMediaSupported()) {
        if (!cancelled) {
          setCameraState("blocked");
          setCameraError("Seu navegador não suporta acesso à câmera. Use Chrome, Edge ou Firefox atualizados.");
        }
        return;
      }
      if (!isSecureContextOk()) {
        if (!cancelled) {
          setCameraState("blocked");
          setCameraError("Abra o site por HTTPS. A câmera não funciona em HTTP fora de localhost.");
        }
        return;
      }

      const perm = await requestCameraPermission();
      if (cancelled) return;
      if (!perm.granted) {
        setCameraState("blocked");
        setCameraError(perm.error ?? "Permissão de câmera negada.");
        return;
      }

      const list = await listCameras();
      if (cancelled) return;
      if (list.length === 0) {
        setCameraState("missing");
        setCameraError("Nenhuma câmera detectada. Conecte uma webcam USB e clique em 'Tentar novamente'.");
        return;
      }

      setCameras(list);
      setActiveCameraId((current) => current ?? pickPreferredCamera(list)?.deviceId ?? list[0].deviceId);
      setCameraState("ready");
    }
    init();
    return () => { cancelled = true; };
  }, [permissionAttempt]);

  // 2) Start / restart the Html5Qrcode scanner against the active camera.
  //    Keep this isolated from permission/listing so switching cameras is cheap.
  useEffect(() => {
    if (cameraState !== "ready" || !activeCameraId) return;

    let cancelled = false;
    const container = document.getElementById("reader");
    if (!container) return;

    const scanner = new Html5Qrcode("reader", /* verbose */ false);
    scannerRef.current = scanner;

    scanner
      .start(
        { deviceId: { exact: activeCameraId } },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => handleScan(decodedText),
        () => { /* ignore per-frame scan misses */ }
      )
      .catch((err) => {
        if (cancelled) return;
        setCameraState("blocked");
        setCameraError(describeCameraError(err));
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      // stop() may reject if the camera never actually started; swallow.
      Promise.resolve()
        .then(() => s.stop())
        .catch(() => {})
        .finally(() => { try { s.clear(); } catch (_) {} });
    };
  }, [cameraState, activeCameraId, handleScan]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const isIdle    = scanState === "idle";
  const isDetect  = scanState === "detected";
  const isSuccess = scanState === "success";
  const isError   = scanState === "error";

  if (companyError) return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-8 bg-background text-center">
      <Building2 className="w-16 h-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-foreground mb-2">Empresa não encontrada</h1>
      <p className="text-muted-foreground">{companyError}</p>
    </div>
  );

  const punchColors = punchResult ? (PUNCH_COLORS[punchResult.type] ?? PUNCH_COLORS.ENTRADA_DIARIA) : PUNCH_COLORS.ENTRADA_DIARIA;
  const PunchIcon = punchResult ? (PUNCH_ICONS[punchResult.type] ?? CheckCircle2) : CheckCircle2;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-primary tracking-tight">
          {companyLoading ? "Carregando..." : companyName ?? "NFs – Bater Ponto"}
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Aproxime seu crachá da câmera para registrar o ponto
        </p>
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col items-center mt-24">

        {/* Scanner */}
        <div className={`w-full max-w-lg aspect-square relative rounded-3xl overflow-hidden glass-card transition-all duration-300 ${isIdle ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none absolute"}`}>
          <div id="reader" className="w-full h-full [&>div]:border-none [&>div]:bg-transparent" />
          <div className="absolute inset-0 pointer-events-none border-[12px] border-background/50 rounded-3xl z-10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] pointer-events-none z-20">
            <div className="w-full h-full border-2 border-primary/50 rounded-xl relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/80 shadow-[0_0_20px_rgba(var(--primary),0.8)] animate-[scan_2s_ease-in-out_infinite]" />
            </div>
          </div>

          {/* Camera state overlays — keep same dark-neon glass look */}
          {cameraState === "checking" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm text-center px-6">
              <Camera className="w-12 h-12 text-primary/70 mb-4 animate-pulse" />
              <p className="text-muted-foreground">Iniciando câmera…</p>
            </div>
          )}
          {(cameraState === "blocked" || cameraState === "missing") && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm text-center px-6">
              <XCircle className="w-14 h-14 text-destructive mb-4" />
              <h3 className="text-lg font-bold text-foreground mb-2">
                {cameraState === "blocked" ? "Câmera bloqueada" : "Câmera não encontrada"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-5">
                {cameraError ?? "Libere o acesso à câmera para registrar o ponto."}
              </p>
              <button
                type="button"
                onClick={() => setPermissionAttempt((n) => n + 1)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition"
              >
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Camera picker — shown only when 2+ cameras are available */}
        {cameraState === "ready" && cameras.length > 1 && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Camera className="w-4 h-4 text-muted-foreground" />
            <label htmlFor="kiosk-camera-picker" className="text-muted-foreground">
              Câmera:
            </label>
            <select
              id="kiosk-camera-picker"
              value={activeCameraId ?? ""}
              onChange={(e) => setActiveCameraId(e.target.value)}
              className="bg-background/60 border border-white/10 rounded-md px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId} className="bg-background text-foreground">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Detected */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-200 z-20 bg-background/95 backdrop-blur-xl ${isDetect ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"}`}>
          <div className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-pulse">
            <Zap className="w-14 h-14 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-primary mb-2">QR Code Lido!</h2>
          <p className="text-muted-foreground text-lg animate-pulse">Registrando ponto…</p>
        </div>

        {/* Success */}
        {employee && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-300 z-30 bg-background/95 backdrop-blur-xl ${isSuccess ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}>
            <div className="max-w-2xl w-full flex flex-col items-center px-4">
              {/* Photo */}
              <div className="relative mb-6">
                <div className="w-56 h-56 md:w-72 md:h-72 rounded-full border-4 border-primary overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.3)] bg-muted">
                  {employee.photo ? (
                    <img src={employee.photo} alt={employee.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl text-muted-foreground bg-secondary">{employee.name.charAt(0)}</div>
                  )}
                </div>
                <div className={`absolute -bottom-4 -right-4 w-20 h-20 rounded-full flex items-center justify-center border-4 border-background shadow-lg ${punchColors.bg} ${punchColors.border} border-2`}>
                  <PunchIcon className={`w-10 h-10 ${punchColors.text}`} />
                </div>
              </div>

              {/* Name + Role */}
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground text-center mb-1">{employee.name}</h2>
              <p className="text-xl text-primary font-medium mb-6">{employee.role}</p>

              {/* Punch result */}
              {punchResult && (
                <div className={`${punchColors.bg} border ${punchColors.border} px-8 py-4 rounded-2xl flex flex-col items-center gap-2 mb-4 w-full max-w-sm text-center`}>
                  <div className={`text-2xl font-bold capitalize ${punchColors.text}`}>
                    {punchResult.label.charAt(0).toUpperCase() + punchResult.label.slice(1)} ✓
                  </div>
                  <div className="font-mono text-4xl font-bold text-foreground">{punchResult.time}</div>
                  <div className="text-sm text-muted-foreground">Batida {punchResult.index} de 4 do dia</div>
                </div>
              )}

              {/* Progress dots */}
              {punchResult && (
                <div className="flex gap-3 mt-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all ${i <= punchResult.index ? `${punchColors.bg} ${punchColors.border}` : "border-white/20 bg-white/5"}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-300 z-30 bg-background/95 backdrop-blur-xl ${isError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}>
          <div className="w-32 h-32 rounded-full bg-destructive/20 flex items-center justify-center mb-8">
            <XCircle className="w-16 h-16 text-destructive" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-4">Atenção</h2>
          <p className="text-xl text-muted-foreground text-center max-w-md">{errorMessage}</p>
        </div>
      </div>

      {/* Admin link */}
      <div className="absolute bottom-8 right-8 z-40">
        <Link href="/admin/login" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Acesso Administrativo
        </Link>
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 0%;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        #reader video { filter: contrast(1.15) brightness(1.05) !important; object-fit: cover !important; }
        #reader { background: transparent !important; border: none !important; }
        #reader__scan_region { background: transparent !important; }
        #reader__header_message { display: none !important; }
        #reader__dashboard_section_csr span { color: hsl(var(--foreground)) !important; }
        #reader__dashboard_section_swaplink { color: hsl(var(--primary)) !important; text-decoration: none !important; }
        #reader button {
          background-color: hsl(var(--primary)) !important;
          color: hsl(var(--primary-foreground)) !important;
          border: none !important;
          border-radius: var(--radius) !important;
          padding: 8px 16px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
        }
      `}</style>
    </div>
  );
}

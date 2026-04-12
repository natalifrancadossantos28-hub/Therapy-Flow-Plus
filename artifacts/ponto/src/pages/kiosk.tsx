import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import { useGetPontoEmployeeByCpf, useCreatePontoRecord, useGetPontoRecords } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, ScanLine, XCircle, Zap } from "lucide-react";

// Play beep instantly — called at moment of QR detection, not after DB save
const playBeep = () => {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, ctx.currentTime);  // C6 — sharp, recognizable
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    // ignore
  }
};

// State machine:
//  idle      → waiting for QR
//  detected  → QR captured; beep played; scanner paused; DB lookup pending
//  success   → record saved; showing employee card
//  error     → something went wrong
type ScanState = "idle" | "detected" | "success" | "error";

const RESET_DELAY_MS = 2000; // 2 s — ready for the next person

export default function KioskPage() {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const processingRef = useRef(false);            // guard against double-fires
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scannedCpf, setScannedCpf] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: employee, isFetching: isLoadingEmployee } = useGetPontoEmployeeByCpf(
    scannedCpf || "",
    { query: { enabled: !!scannedCpf, retry: false } }
  );

  const { data: todayRecords } = useGetPontoRecords(
    { employeeId: employee?.id, date: format(new Date(), "yyyy-MM-dd") },
    { query: { enabled: !!employee?.id } }
  );

  const createRecord = useCreatePontoRecord();

  // ─── helpers ─────────────────────────────────────────────────────────────

  const pauseScanner = useCallback(() => {
    try { scannerRef.current?.pause(true); } catch (_) {}
  }, []);

  const resumeScanner = useCallback(() => {
    try { scannerRef.current?.resume(); } catch (_) {}
  }, []);

  const scheduleReset = useCallback((delay = RESET_DELAY_MS) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setScanState("idle");
      setScannedCpf(null);
      setErrorMessage(null);
      processingRef.current = false;
      resumeScanner();
    }, delay);
  }, [resumeScanner]);

  const showError = useCallback((msg: string) => {
    setScanState("error");
    setErrorMessage(msg);
    scheduleReset(3000); // slightly longer for error messages
  }, [scheduleReset]);

  // ─── QR detected (immediate) ─────────────────────────────────────────────

  const handleScan = useCallback((decodedText: string) => {
    if (processingRef.current) return;       // already handling one
    processingRef.current = true;

    pauseScanner();      // stop loop immediately — no more frames processed
    playBeep();          // instant audio feedback

    setScanState("detected");
    setScannedCpf(decodedText.trim());
  }, [pauseScanner]);

  // ─── DB lookup complete ───────────────────────────────────────────────────

  useEffect(() => {
    if (!scannedCpf || scanState !== "detected") return;
    if (isLoadingEmployee) return;

    if (!employee) {
      showError("Funcionário não encontrado. O QR Code pode ser inválido.");
      return;
    }

    if (todayRecords === undefined) return;   // still loading records

    const sortedRecords = [...todayRecords].sort(
      (a, b) => new Date(b.punchedAt).getTime() - new Date(a.punchedAt).getTime()
    );
    const nextType =
      sortedRecords.length === 0 || sortedRecords[0].type === "saida"
        ? "entrada"
        : "saida";

    createRecord.mutate(
      { data: { employeeId: employee.id, type: nextType } },
      {
        onSuccess: () => {
          setScanState("success");
          scheduleReset();
        },
        onError: (err: any) => {
          const msg =
            err?.response?.data?.error ??
            err?.message ??
            "Erro ao registrar ponto. Tente novamente.";
          showError(msg);
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedCpf, scanState, isLoadingEmployee, employee, todayRecords]);

  // ─── scanner initialisation ───────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!document.getElementById("reader")) return;

      const scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,                           // ← was 15, reduced to lower CPU load
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width:  { ideal: 640 },          // ← was 1920, now 640
            height: { ideal: 480 },          // ← was 1080, now 480
          },
        },
        false
      );

      scanner.render(
        (text) => handleScan(text),
        () => {}                             // scan-frame error — ignore
      );

      scannerRef.current = scanner;
    }, 100);

    return () => {
      clearTimeout(timer);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      try { scannerRef.current?.clear(); } catch (_) {}
    };
  }, [handleScan]);

  // ─── UI ──────────────────────────────────────────────────────────────────

  const isIdle    = scanState === "idle";
  const isDetect  = scanState === "detected";
  const isSuccess = scanState === "success";
  const isError   = scanState === "error";

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-primary tracking-tight">
          NFs – Bater Ponto
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Aproxime seu crachá da câmera para registrar o ponto
        </p>
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col items-center mt-24">

        {/* ── Scanner ── */}
        <div
          className={`w-full max-w-lg aspect-square relative rounded-3xl overflow-hidden glass-card transition-all duration-300 ${
            isIdle ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none absolute"
          }`}
        >
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
        </div>

        {/* ── Detected (instant feedback — shows before DB finishes) ── */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-200 z-20 bg-background/95 backdrop-blur-xl ${
            isDetect ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
          }`}
        >
          <div className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-pulse">
            <Zap className="w-14 h-14 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-primary mb-2">QR Code Lido!</h2>
          <p className="text-muted-foreground text-lg animate-pulse">Registrando ponto…</p>
        </div>

        {/* ── Success ── */}
        {employee && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-300 z-30 bg-background/95 backdrop-blur-xl ${
              isSuccess ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
            }`}
          >
            <div className="max-w-2xl w-full flex flex-col items-center">
              <div className="relative mb-8">
                <div className="w-64 h-64 md:w-80 md:h-80 rounded-full border-4 border-primary overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.3)] bg-muted">
                  {employee.photo ? (
                    <img src={employee.photo} alt={employee.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl text-muted-foreground bg-secondary">
                      {employee.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-green-500 rounded-full flex items-center justify-center border-4 border-background shadow-lg">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
              </div>

              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground text-center mb-2">
                {employee.name}
              </h2>
              <p className="text-xl text-primary font-medium mb-8">{employee.role}</p>

              <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-8 py-4 rounded-2xl text-2xl font-semibold flex items-center gap-4">
                <CheckCircle2 className="w-7 h-7" />
                Ponto Registrado com Sucesso!
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-300 z-30 bg-background/95 backdrop-blur-xl ${
            isError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          }`}
        >
          <div className="w-32 h-32 rounded-full bg-destructive/20 flex items-center justify-center mb-8">
            <XCircle className="w-16 h-16 text-destructive" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-4">Ops, ocorreu um erro</h2>
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
        #reader video {
          filter: contrast(1.15) brightness(1.05) !important;
          object-fit: cover !important;
        }
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

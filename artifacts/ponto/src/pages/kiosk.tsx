import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import { useGetPontoEmployeeByCpf, useCreatePontoRecord, useGetPontoRecords } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// AudioContext for beep sound
const playBeep = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

type ScanState = "idle" | "scanning" | "success" | "error";

export default function KioskPage() {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scannedCpf, setScannedCpf] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: employee, isFetching: isLoadingEmployee } = useGetPontoEmployeeByCpf(
    scannedCpf || "", 
    { query: { enabled: !!scannedCpf, retry: false } }
  );

  const { data: todayRecords } = useGetPontoRecords(
    { employeeId: employee?.id, date: format(new Date(), 'yyyy-MM-dd') },
    { query: { enabled: !!employee?.id } }
  );

  const createRecord = useCreatePontoRecord();

  const resetKiosk = useCallback(() => {
    setScanState("idle");
    setScannedCpf(null);
    setErrorMessage(null);
    
    // Resume scanner if it was paused
    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch (e) {
        // Might fail if not scanning, ignore
      }
    }
  }, []);

  const handleScan = useCallback((decodedText: string) => {
    if (scanState !== "idle" && scanState !== "scanning") return;
    
    // Pause scanner to prevent multiple reads
    if (scannerRef.current) {
      try {
        scannerRef.current.pause(true);
      } catch (e) {
        // ignore
      }
    }
    
    setScanState("scanning");
    setScannedCpf(decodedText);
  }, [scanState]);

  useEffect(() => {
    // If employee is not found after query runs and finishes
    if (scannedCpf && !isLoadingEmployee && employee === undefined) {
      setScanState("error");
      setErrorMessage("Funcionário não encontrado. O QRCode pode ser inválido.");
      const timer = setTimeout(resetKiosk, 5000);
      return () => clearTimeout(timer);
    }
  }, [scannedCpf, isLoadingEmployee, employee, resetKiosk]);

  useEffect(() => {
    if (employee && todayRecords !== undefined && scanState === "scanning") {
      // Determine type based on today's records
      let nextType = "entrada";
      if (todayRecords.length > 0) {
        const sortedRecords = [...todayRecords].sort((a, b) => 
          new Date(b.punchedAt).getTime() - new Date(a.punchedAt).getTime()
        );
        const lastRecord = sortedRecords[0];
        nextType = lastRecord.type === "entrada" ? "saida" : "entrada";
      }

      createRecord.mutate(
        { data: { employeeId: employee.id, type: nextType } },
        {
          onSuccess: () => {
            playBeep();
            setScanState("success");
            const timer = setTimeout(resetKiosk, 5000);
            return () => clearTimeout(timer);
          },
          onError: () => {
            setScanState("error");
            setErrorMessage("Erro ao registrar ponto. Tente novamente.");
            const timer = setTimeout(resetKiosk, 5000);
            return () => clearTimeout(timer);
          }
        }
      );
    }
  }, [employee, todayRecords, scanState, createRecord, resetKiosk]);

  // Initialize Scanner
  useEffect(() => {
    const initializeScanner = () => {
      if (document.getElementById("reader")) {
        const scanner = new Html5QrcodeScanner(
          "reader",
          { 
            fps: 10, 
            qrbox: { width: 300, height: 300 },
            aspectRatio: 1,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            videoConstraints: {
              facingMode: "user" // Default to front camera for kiosk, usually
            }
          },
          false
        );
        
        scanner.render(
          (decodedText) => handleScan(decodedText),
          () => { /* ignore scan errors */ }
        );
        
        scannerRef.current = scanner;
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initializeScanner, 100);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          scannerRef.current.clear().catch(e => console.error(e));
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [handleScan]);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-primary tracking-tight">NFs – Bater Ponto</h1>
        <p className="text-muted-foreground mt-2 text-lg">Aproxime seu crachá da câmera para registrar o ponto</p>
      </div>

      <div className="w-full max-w-4xl mx-auto flex flex-col items-center mt-24">
        {/* Scanner View */}
        <div className={`w-full max-w-lg aspect-square relative rounded-3xl overflow-hidden glass-card transition-all duration-500 ${scanState !== 'idle' ? 'opacity-0 scale-95 pointer-events-none absolute' : 'opacity-100 scale-100'}`}>
          <div id="reader" className="w-full h-full [&>div]:border-none [&>div]:bg-transparent"></div>
          
          {/* Scanning Overlay Decoration */}
          <div className="absolute inset-0 pointer-events-none border-[12px] border-background/50 rounded-3xl z-10"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] pointer-events-none z-20">
            <div className="w-full h-full border-2 border-primary/50 rounded-xl relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl"></div>
              
              {/* Animated scan line */}
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/80 shadow-[0_0_20px_rgba(var(--primary),0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 z-20 ${scanState === 'scanning' ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}>
          <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <ScanLine className="w-12 h-12 text-primary animate-bounce" />
          </div>
          <h2 className="mt-8 text-2xl font-semibold text-foreground animate-pulse">Lendo crachá...</h2>
        </div>

        {/* Success State */}
        {employee && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 z-30 bg-background/95 backdrop-blur-xl ${scanState === 'success' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
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
                <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-green-500 rounded-full flex items-center justify-center border-4 border-background shadow-lg scale-in">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground text-center mb-2">
                {employee.name}
              </h2>
              <p className="text-xl text-primary font-medium mb-8">{employee.role}</p>
              
              <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-8 py-4 rounded-2xl text-2xl font-semibold flex items-center gap-4">
                Ponto Registrado com Sucesso!
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 z-30 bg-background/95 backdrop-blur-xl ${scanState === 'error' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
          <div className="w-32 h-32 rounded-full bg-destructive/20 flex items-center justify-center mb-8">
            <XCircle className="w-16 h-16 text-destructive" />
          </div>
          <h2 className="text-3xl font-display font-bold text-foreground mb-4">Ops, ocorreu um erro</h2>
          <p className="text-xl text-muted-foreground text-center max-w-md">{errorMessage}</p>
        </div>
      </div>

      {/* Admin Link (subtle) */}
      <div className="absolute bottom-8 right-8 z-40">
        <Link href="/admin/login" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Acesso Administrativo
        </Link>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
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

// Shared camera helpers for kiosk and employee-form.
//
// Why this exists:
// - getUserMedia on desktop browsers does NOT prefer USB webcams by default;
//   it picks whatever the OS marks as the system default. On many setups that
//   is the integrated laptop camera instead of the external USB one the user
//   actually wants for the kiosk.
// - Hard-coded facingMode constraints ("environment" / "user") don't match
//   USB webcams at all — webcams usually have no facingMode label — so the
//   constraint silently falls back and the camera that starts is not the one
//   we want.
// - Mixed iframe / permissions-policy and HTTPS edge cases produce cryptic
//   NotAllowedError / NotFoundError messages. We wrap them into friendly
//   Portuguese text so the UI can render a useful error.

export type CameraInfo = {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
};

export type PermissionState = "granted" | "denied" | "prompt" | "unavailable";

const USB_LABEL_HINTS = [
  "usb",
  "webcam",
  "logitech",
  "c920",
  "c922",
  "c525",
  "c270",
  "brio",
  "razer",
  "external",
  "hd pro",
  "uvc",
  "microsoft lifecam",
];

const INTEGRATED_LABEL_HINTS = [
  "integrated",
  "facetime",
  "built-in",
  "builtin",
  "embedded",
  "internal",
  "laptop",
];

export function isGetUserMediaSupported(): boolean {
  return !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

// Ask the browser for camera access, stop the stream immediately.
// Returns granted=true if user accepted (even if no device available).
export async function requestCameraPermission(): Promise<{
  granted: boolean;
  error?: string;
}> {
  if (!isGetUserMediaSupported()) {
    return { granted: false, error: "Navegador sem suporte a câmera." };
  }
  if (!isSecureContextOk()) {
    return {
      granted: false,
      error:
        "A câmera só funciona em HTTPS ou localhost. Abra o site pelo endereço https://.",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err: unknown) {
    return { granted: false, error: describeCameraError(err) };
  }
}

export function describeCameraError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name || "";
  const msg = e?.message || "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Permissão de câmera negada. Clique no ícone da câmera na barra de endereço do navegador e marque 'Permitir'.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhuma câmera detectada. Conecte uma webcam USB ou verifique os drivers do sistema.";
    case "NotReadableError":
    case "TrackStartError":
      return "A câmera está em uso por outro aplicativo. Feche outros programas (Zoom, Meet, Teams, OBS) e tente novamente.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Nenhuma câmera compatível com as configurações pedidas. Tente selecionar outra câmera.";
    case "SecurityError":
      return "Acesso à câmera bloqueado por segurança. Verifique se o site está em HTTPS.";
    case "AbortError":
      return "Abertura da câmera foi cancelada. Tente novamente.";
    default:
      return msg || "Falha ao acessar a câmera.";
  }
}

// Enumerate video inputs. Labels are only populated if the user has already
// granted camera permission at least once; otherwise they come back empty.
export async function listCameras(): Promise<CameraInfo[]> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || "Câmera sem identificação",
      kind: d.kind,
    }));
}

// Pick the best default camera for the kiosk.
// Priority:
//   1. A device whose label matches known USB webcam hints.
//   2. A device whose label does NOT match integrated/built-in hints.
//   3. The last device in the list (USB cameras usually appear last).
//   4. The first available camera.
export function pickPreferredCamera(cameras: CameraInfo[]): CameraInfo | null {
  if (cameras.length === 0) return null;
  if (cameras.length === 1) return cameras[0];

  const lower = (s: string) => s.toLowerCase();

  const usbMatch = cameras.find((c) =>
    USB_LABEL_HINTS.some((hint) => lower(c.label).includes(hint))
  );
  if (usbMatch) return usbMatch;

  const nonIntegrated = cameras.find(
    (c) => !INTEGRATED_LABEL_HINTS.some((hint) => lower(c.label).includes(hint))
  );
  if (nonIntegrated) return nonIntegrated;

  return cameras[cameras.length - 1] ?? cameras[0];
}

export async function getCameraPermissionState(): Promise<PermissionState> {
  if (
    typeof navigator === "undefined" ||
    !("permissions" in navigator) ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== "function"
  ) {
    return "unavailable";
  }
  try {
    // PermissionName includes "camera" in modern browsers, but TS lib may lag.
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state as PermissionState;
  } catch {
    return "unavailable";
  }
}

import { useEffect, useRef, useCallback } from "react";

/**
 * Visibility-aware interval that pauses when the tab is hidden.
 * Resumes immediately with a fresh call when the tab becomes visible again.
 */
export function useVisibleInterval(callback: () => void, delayMs: number) {
  const savedCb = useRef(callback);
  savedCb.current = callback;

  const tick = useCallback(() => savedCb.current(), []);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      tick();
      id = setInterval(tick, delayMs);
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs, tick]);
}

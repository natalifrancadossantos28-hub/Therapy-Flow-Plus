import { useEffect } from "react";

const BASE = "NFs gestão";

export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · ${BASE}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [page]);
}

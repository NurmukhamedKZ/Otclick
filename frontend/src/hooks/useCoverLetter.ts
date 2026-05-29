"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CoverLetterResult } from "@/lib/types";

export function useCoverLetter() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (vacancyId: string, resumeId: string): Promise<CoverLetterResult | null> => {
      setBusyId(vacancyId);
      setError(null);
      try {
        return await apiFetch<CoverLetterResult>("/api/cover-letters/generate", {
          method: "POST",
          body: JSON.stringify({ vacancy_id: vacancyId, resume_id: resumeId }),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "generate failed");
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  return { generate, busyId, error };
}

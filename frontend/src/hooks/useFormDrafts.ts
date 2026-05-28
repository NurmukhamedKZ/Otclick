"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type FormAnswer = {
  task_id: number | string;
  question: string;
  type: "choice" | "text";
  options?: { id: string; text: string }[];
  answer_id?: string;
  answer: string;
};

export type FormDraft = {
  id: string;
  vacancy_id: string;
  resume_id: string;
  vacancy_title: string | null;
  employer_name: string | null;
  vacancy_url: string | null;
  answers: FormAnswer[];
  letter: string | null;
  status: string;
  created_at: string;
};

export function useFormDrafts() {
  const [drafts, setDrafts] = useState<FormDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<FormDraft[]>("/api/forms/drafts");
      setDrafts(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const approve = useCallback(
    async (id: string, answers: FormAnswer[], letter: string) => {
      await apiFetch(`/api/forms/drafts/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ answers, letter }),
      });
      await refresh();
    },
    [refresh],
  );

  const discard = useCallback(
    async (id: string) => {
      await apiFetch(`/api/forms/drafts/${id}/discard`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  return { drafts, loading, error, refresh, approve, discard };
}

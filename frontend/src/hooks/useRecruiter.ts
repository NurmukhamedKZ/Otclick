"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type Draft = {
  id: string;
  negotiation_id: string;
  draft_text: string;
  reason: string | null;
  question_text: string | null;
  created_at: string;
};

export type Todo = {
  id: string;
  negotiation_id: string;
  title: string;
  detail: string | null;
  link: string | null;
  created_at: string;
};

export function useRecruiter() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        apiFetch<Draft[]>("/api/recruiter/drafts"),
        apiFetch<Todo[]>("/api/recruiter/todos"),
      ]);
      setDrafts(d);
      setTodos(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sendDraft = useCallback(async (id: string, message: string) => {
    await apiFetch(`/api/recruiter/drafts/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const discardDraft = useCallback(async (id: string) => {
    await apiFetch(`/api/recruiter/drafts/${id}/discard`, { method: "POST" });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const resolveTodo = useCallback(async (id: string, action: "done" | "dismiss") => {
    await apiFetch(`/api/recruiter/todos/${id}/${action}`, { method: "POST" });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { drafts, todos, loading, error, refresh, sendDraft, discardDraft, resolveTodo };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type ChatSummary = {
  id: string;
  vacancy_id: string | null;
  vacancy_name: string | null;
  employer_name: string | null;
  employer_logo: string | null;
  state_id: string | null;
  state_name: string | null;
  updated_at: string | null;
  unread: number;
  has_updates: boolean;
};

export type ChatMessage = {
  id: string;
  text: string;
  created_at: string | null;
  from_employer: boolean;
  viewed_by_me: boolean;
  kind?: "response" | "message";
};

type ListResponse = {
  items: ChatSummary[];
  page: number;
  pages: number;
  per_page: number;
  found: number;
};

export function useChats(unreadOnly: boolean) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [found, setFound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ListResponse>(
        `/api/chats?per_page=50&unread_only=${unreadOnly ? "true" : "false"}`,
      );
      setChats(res.items);
      setFound(res.found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { chats, found, error, loading, refresh };
}

export function useChatMessages(
  negotiationId: string | null,
  vacancyId: string | null = null,
) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const refresh = useCallback(async () => {
    if (!negotiationId) {
      setMessages(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const qs = vacancyId ? `?vacancy_id=${encodeURIComponent(vacancyId)}` : "";
      const res = await apiFetch<{ items: ChatMessage[] }>(
        `/api/chats/${negotiationId}/messages${qs}`,
      );
      if (id === reqId.current) setMessages(res.items);
    } catch (e) {
      if (id === reqId.current) {
        setError(e instanceof Error ? e.message : "load failed");
        setMessages([]);
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [negotiationId, vacancyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const send = useCallback(
    async (message: string) => {
      if (!negotiationId) return;
      await apiFetch(`/api/chats/${negotiationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      await refresh();
    },
    [negotiationId, refresh],
  );

  return { messages, error, loading, refresh, send };
}

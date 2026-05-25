"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BlacklistCreate, BlacklistEntry } from "@/lib/types";

export function useBlacklist() {
  const [items, setItems] = useState<BlacklistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<BlacklistEntry[]>("/api/blacklist");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (body: BlacklistCreate) => {
    const row = await apiFetch<BlacklistEntry>("/api/blacklist", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setItems((prev) => {
      const rest = prev ? prev.filter((e) => e.id !== row.id) : [];
      return [row, ...rest];
    });
    return row;
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/api/blacklist/${id}`, { method: "DELETE" });
    setItems((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
  }, []);

  return { items, error, reload: load, add, remove };
}

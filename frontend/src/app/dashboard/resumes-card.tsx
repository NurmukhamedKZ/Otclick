"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Resume, ResumesList } from "@/lib/types";

export default function ResumesCard() {
  const [items, setItems] = useState<Resume[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ResumesList>("/api/resumes");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const data = await apiFetch<ResumesList>("/api/resumes/sync", {
        method: "POST",
      });
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="mb-6 rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Резюме</h2>
        <button
          onClick={sync}
          disabled={syncing}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {syncing ? "Синхронизация…" : "Sync с hh"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {items === null ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Пусто. Нажми Sync.
        </p>
      ) : (
        <ul className="text-sm divide-y divide-gray-100">
          {items.map((r) => (
            <li key={r.id} className="py-2 flex justify-between">
              <span>{r.title ?? r.hh_resume_id}</span>
              <span className="text-gray-500">{r.status ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

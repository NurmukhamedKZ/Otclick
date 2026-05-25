"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Application } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  captcha: "bg-yellow-100 text-yellow-800",
  skipped: "bg-gray-100 text-gray-500",
  form_required: "bg-blue-100 text-blue-800",
  vacancy_gone: "bg-gray-100 text-gray-500",
};

const LIMIT = 20;

export default function ApplicationsCard() {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((data ?? []) as Application[]);
    setError(null);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await load();

      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel("applications-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "applications", filter },
          (payload) => {
            const row = payload.new as Application;
            setRows((prev) => [row, ...(prev ?? []).filter((r) => r.id !== row.id)].slice(0, LIMIT));
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "applications", filter },
          (payload) => {
            const row = payload.new as Application;
            setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? row : r)));
          },
        )
        .subscribe();

      pollId = setInterval(load, 30_000);
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pollId) clearInterval(pollId);
    };
  }, [load, supabase]);

  return (
    <section className="mb-6 rounded border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Последние отклики</h2>
        <button
          onClick={load}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {rows === null ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Пусто. Запусти worker.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span
                className={`rounded px-2 py-0.5 text-xs whitespace-nowrap ${
                  STATUS_COLOR[a.status] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {a.status}
              </span>
              <a
                href={`https://hh.ru/vacancy/${a.vacancy_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-blue-700 hover:underline"
              >
                vacancy {a.vacancy_id}
              </a>
              {a.error && (
                <span className="max-w-[40%] truncate text-xs text-red-600" title={a.error}>
                  {a.error}
                </span>
              )}
              <span className="whitespace-nowrap text-xs text-gray-400">
                {new Date(a.created_at).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

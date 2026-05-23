"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  apply_success: "bg-green-100 text-green-800",
  captcha: "bg-yellow-100 text-yellow-800",
  limit_reached: "bg-yellow-100 text-yellow-800",
  worker_stop: "bg-gray-200 text-gray-800",
  token_dead: "bg-red-100 text-red-800",
  resume_missing: "bg-orange-100 text-orange-800",
};

export default function NotificationsCard() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,payload,read,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((data ?? []) as NotificationRow[]);
    setError(null);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          setRows((prev) => [payload.new as NotificationRow, ...(prev ?? [])].slice(0, 30));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  async function markAllRead() {
    setBusy(true);
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false);
    setBusy(false);
    if (error) setError(error.message);
    else load();
  }

  async function clearAll() {
    if (!confirm("Удалить все уведомления?")) return;
    setBusy(true);
    const { error } = await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setBusy(false);
    if (error) setError(error.message);
    else setRows([]);
  }

  return (
    <section className="mb-6 rounded border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Уведомления</h2>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={markAllRead}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Прочитать все
          </button>
          <button
            onClick={clearAll}
            disabled={busy}
            className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Очистить
          </button>
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {rows === null ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Пусто.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {rows.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-2">
              <span
                className={`rounded px-2 py-0.5 text-xs whitespace-nowrap ${
                  TYPE_COLOR[n.type] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {n.type}
              </span>
              <span className="flex-1 text-gray-700">
                {n.payload ? (
                  <code className="text-xs">{JSON.stringify(n.payload)}</code>
                ) : (
                  "—"
                )}
              </span>
              <span className="whitespace-nowrap text-xs text-gray-400">
                {new Date(n.created_at).toLocaleTimeString()}
              </span>
              {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500" title="unread" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

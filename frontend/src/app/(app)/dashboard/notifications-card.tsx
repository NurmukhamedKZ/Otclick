"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { SkeletonList } from "@/components/ui/skeleton";

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
    <Card>
      <CardHeader
        title="Уведомления"
        action={
          <div className="flex gap-1.5">
            <Button onClick={markAllRead} disabled={busy} size="sm">
              Прочитать все
            </Button>
            <Button onClick={clearAll} disabled={busy} variant="danger" size="sm">
              Очистить
            </Button>
          </div>
        }
      />

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {rows === null ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <Empty title="Пусто" hint="Тут появятся события воркера." />
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
    </Card>
  );
}

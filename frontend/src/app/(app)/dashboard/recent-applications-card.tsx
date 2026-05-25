"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { SkeletonList } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { STATUS_COLOR } from "@/lib/status";
import type { Application } from "@/lib/types";

const LIMIT = 10;

export default function RecentApplicationsCard() {
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

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await load();
      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel("dashboard-applications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "applications", filter },
          (payload) => {
            const row = payload.new as Application;
            setRows((prev) =>
              [row, ...(prev ?? []).filter((r) => r.id !== row.id)].slice(0, LIMIT),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "applications", filter },
          (payload) => {
            const row = payload.new as Application;
            setRows((prev) =>
              (prev ?? []).map((r) => (r.id === row.id ? row : r)),
            );
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  return (
    <Card>
      <CardHeader
        title="Последние отклики"
        action={
          <Link href="/applications">
            <Button variant="ghost" size="sm">
              Все →
            </Button>
          </Link>
        }
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <SkeletonList rows={5} />
      ) : rows.length === 0 ? (
        <Empty
          title="Пусто"
          hint="Запусти worker сверху — отклики появятся здесь в реальном времени."
        />
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs ${
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
              <span className="hidden whitespace-nowrap text-xs text-gray-400 sm:inline">
                {new Date(a.created_at).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

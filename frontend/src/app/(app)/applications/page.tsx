"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { SkeletonList } from "@/components/ui/skeleton";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/status";
import type { Application } from "@/lib/types";

const PAGE_SIZE = 25;
const STATUSES = ["all", "queued", "sent", "failed", "captcha", "skipped", "form_required", "vacancy_gone"] as const;

export default function ApplicationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Application[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setRows(null);
    let q = supabase
      .from("applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (status !== "all") q = q.eq("status", status);
    if (searchDebounced) {
      q = q.or(
        `vacancy_id.ilike.%${searchDebounced}%,employer_id.ilike.%${searchDebounced}%`,
      );
    }

    const { data, count, error } = await q;
    if (error) {
      setError(error.message);
      return;
    }
    setRows((data ?? []) as Application[]);
    setTotal(count ?? 0);
    setError(null);
  }, [supabase, page, status, searchDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel("applications-page")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "applications", filter },
          () => {
            if (page === 0) load();
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, load, page]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Отклики</h1>
          <p className="text-sm text-gray-500">{total} всего</p>
        </div>
      </header>

      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "все статусы" : STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="vacancy_id / employer_id…"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <Button onClick={load} size="sm">
            Refresh
          </Button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {rows === null ? (
          <SkeletonList rows={8} />
        ) : rows.length === 0 ? (
          <Empty
            title="Откликов нет"
            hint="Поменяй фильтр или запусти воркер сверху."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-2 text-left font-medium">статус</th>
                  <th className="py-2 text-left font-medium">vacancy</th>
                  <th className="py-2 text-left font-medium hidden md:table-cell">employer</th>
                  <th className="py-2 text-left font-medium hidden md:table-cell">ошибка</th>
                  <th className="py-2 text-right font-medium">когда</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          STATUS_COLOR[a.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <a
                        href={`https://hh.ru/vacancy/${a.vacancy_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        {a.vacancy_id}
                      </a>
                    </td>
                    <td className="py-2 text-gray-600 hidden md:table-cell">
                      {a.employer_id ?? "—"}
                    </td>
                    <td className="py-2 hidden max-w-[20rem] truncate text-xs text-red-600 md:table-cell">
                      {a.error ?? ""}
                    </td>
                    <td className="py-2 whitespace-nowrap text-right text-xs text-gray-400">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span>
              Стр. {page + 1} / {pages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ←
              </Button>
              <Button
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

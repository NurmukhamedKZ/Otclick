"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Resume, ResumesList } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { SkeletonList } from "@/components/ui/skeleton";

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
    <Card>
      <CardHeader
        title="Резюме"
        action={
          <Button onClick={sync} disabled={syncing} size="sm">
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Синк…" : "Sync hh"}
          </Button>
        }
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {items === null ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <Empty
          title="Резюме не найдены"
          hint="Нажми Sync — подтянем из hh."
        />
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span className="truncate">{r.title ?? r.hh_resume_id}</span>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                  r.status === "published"
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {r.status ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

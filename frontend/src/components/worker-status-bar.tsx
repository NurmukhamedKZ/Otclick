"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type {
  WorkerStartResponse,
  WorkerStatus,
  WorkerStopResponse,
} from "@/lib/types";

const STATE_LABEL: Record<WorkerStatus["state"], string> = {
  running: "Работает",
  paused_captcha: "Капча",
  paused_limit: "Лимит",
  stopped: "Остановлен",
};

const STATE_DOT: Record<WorkerStatus["state"], string> = {
  running: "bg-green-500",
  paused_captcha: "bg-yellow-500",
  paused_limit: "bg-yellow-500",
  stopped: "bg-gray-400",
};

export default function WorkerStatusBar() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["worker-status"],
    queryFn: () => apiFetch<WorkerStatus>("/api/worker/status"),
    refetchInterval: 5000,
  });

  const startM = useMutation({
    mutationFn: () =>
      apiFetch<WorkerStartResponse>("/api/worker/start", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worker-status"] }),
  });

  const stopM = useMutation({
    mutationFn: () =>
      apiFetch<WorkerStopResponse>("/api/worker/stop", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worker-status"] }),
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["worker-status"] });
    setTimeout(() => setRefreshing(false), 400);
  }, [qc]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        refresh();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh]);

  const state = status?.state ?? "stopped";
  const isRunning =
    state === "running" || state === "paused_captcha" || state === "paused_limit";
  const busy = startM.isPending || stopM.isPending;

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6">
        <div className="flex items-center gap-3 text-gray-700">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
            <span className="font-medium">{STATE_LABEL[state]}</span>
          </span>
          {status && (
            <>
              <span className="text-gray-400">·</span>
              <span>
                Сегодня <b>{status.today_count}</b> / {status.daily_limit}
              </span>
              <span className="text-gray-400">·</span>
              <span>В очереди {status.queued}</span>
              {status.next_run_at && (
                <>
                  <span className="text-gray-400 hidden sm:inline">·</span>
                  <span className="hidden sm:inline">
                    next {new Date(status.next_run_at).toLocaleTimeString()}
                  </span>
                </>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isRunning ? (
            <button
              onClick={() => startM.mutate()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded bg-black px-2.5 py-1 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Play size={11} />
              Старт
            </button>
          ) : (
            <button
              onClick={() => stopM.mutate()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              <Square size={11} />
              Стоп
            </button>
          )}
          <button
            onClick={refresh}
            className="rounded border border-gray-300 p-1 hover:bg-gray-50"
            title="Refresh (⌘⇧R)"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {status?.last_error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-1 text-xs text-red-700 sm:px-6">
          Ошибка: {status.last_error}
        </div>
      )}
    </div>
  );
}

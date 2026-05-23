"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { WorkerStartResponse, WorkerStatus, WorkerStopResponse } from "@/lib/types";

const STATE_LABEL: Record<WorkerStatus["state"], string> = {
  running: "Работает",
  paused_captcha: "Пауза: капча",
  paused_limit: "Пауза: лимит",
  stopped: "Остановлен",
};

const STATE_COLOR: Record<WorkerStatus["state"], string> = {
  running: "bg-green-100 text-green-800",
  paused_captcha: "bg-yellow-100 text-yellow-800",
  paused_limit: "bg-yellow-100 text-yellow-800",
  stopped: "bg-gray-100 text-gray-700",
};

export default function WorkerCard() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<WorkerStatus>("/api/worker/status");
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status load failed");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<WorkerStartResponse>("/api/worker/start", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "start failed");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<WorkerStopResponse>("/api/worker/stop", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "stop failed");
    } finally {
      setBusy(false);
    }
  }

  const state = status?.state ?? "stopped";
  const isRunning = state === "running" || state === "paused_captcha" || state === "paused_limit";

  return (
    <section className="mb-6 rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Worker</h2>
          <span className={`rounded px-2 py-0.5 text-xs ${STATE_COLOR[state]}`}>
            {STATE_LABEL[state]}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={start}
            disabled={busy || isRunning}
            className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Старт
          </button>
          <button
            onClick={stop}
            disabled={busy || !isRunning}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Стоп
          </button>
          <button
            onClick={load}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {status && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
          <dt>Сегодня</dt>
          <dd>
            {status.today_count} / {status.daily_limit}
          </dd>
          <dt>В очереди</dt>
          <dd>{status.queued}</dd>
          <dt>Next run</dt>
          <dd>{status.next_run_at ? new Date(status.next_run_at).toLocaleTimeString() : "—"}</dd>
          {status.last_error && (
            <>
              <dt>Last error</dt>
              <dd className="text-red-600">{status.last_error}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

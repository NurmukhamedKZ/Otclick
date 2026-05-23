"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Action = {
  label: string;
  path: string;
  className?: string;
};

const ACTIONS: Action[] = [
  { label: "Mark token invalid", path: "/api/_debug/token/invalid", className: "border-red-300 text-red-700 hover:bg-red-50" },
  { label: "Restore token", path: "/api/_debug/token/restore" },
  { label: "Saturate day counter", path: "/api/_debug/counter/saturate", className: "border-yellow-300 text-yellow-700 hover:bg-yellow-50" },
  { label: "Reset day counter", path: "/api/_debug/counter/reset" },
];

const NOTIFY_TYPES = [
  "apply_success",
  "captcha",
  "limit_reached",
  "worker_stop",
  "token_dead",
  "resume_missing",
];

export default function DebugCard() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(path: string, body?: object) {
    setBusy(true);
    try {
      const res = await apiFetch<Record<string, unknown>>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setLog((l) => [`${path} → ${JSON.stringify(res)}`, ...l].slice(0, 10));
    } catch (e) {
      setLog((l) => [`${path} ❌ ${e instanceof Error ? e.message : String(e)}`, ...l].slice(0, 10));
    } finally {
      setBusy(false);
    }
  }

  async function fireNotify(type_: string) {
    const q = `?type_=${encodeURIComponent(type_)}`;
    await run(`/api/_debug/notify${q}`);
  }

  return (
    <section className="mb-6 rounded border border-dashed border-orange-400 bg-orange-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">Debug</h2>
        <span className="rounded bg-orange-200 px-2 py-0.5 text-xs">DEBUG_ENDPOINTS=true only</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.path}
            onClick={() => run(a.path)}
            disabled={busy}
            className={`rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 ${a.className ?? ""}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs text-gray-600">Fire notification:</p>
        <div className="flex flex-wrap gap-2">
          {NOTIFY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => fireNotify(t)}
              disabled={busy}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {log.length > 0 && (
        <pre className="max-h-32 overflow-auto rounded bg-white p-2 text-xs text-gray-700">
          {log.join("\n")}
        </pre>
      )}
    </section>
  );
}

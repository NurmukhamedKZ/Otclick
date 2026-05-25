"use client";

import { useEffect, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastPayload = {
  id?: string;
  kind?: ToastKind;
  title: string;
  body?: string;
  duration?: number;
};

const EVENT = "app-toast";

export function pushToast(t: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: t }));
}

type ToastInternal = Required<Pick<ToastPayload, "id" | "kind" | "title" | "duration">> & {
  body?: string;
};

const KIND_STYLE: Record<ToastKind, string> = {
  info: "border-gray-300 bg-white",
  success: "border-green-300 bg-green-50",
  warning: "border-yellow-300 bg-yellow-50",
  error: "border-red-300 bg-red-50",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      const t: ToastInternal = {
        id: detail.id ?? crypto.randomUUID(),
        kind: detail.kind ?? "info",
        title: detail.title,
        body: detail.body,
        duration: detail.duration ?? 5000,
      };
      setToasts((prev) => [...prev, t]);
      const handle = setTimeout(() => {
        timeouts.delete(t.id);
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, t.duration);
      timeouts.set(t.id, handle);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timeouts.forEach((h) => clearTimeout(h));
      timeouts.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded border p-3 shadow-sm ${KIND_STYLE[t.kind]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">{t.title}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-xs text-gray-400 hover:text-gray-700"
              aria-label="dismiss"
            >
              ✕
            </button>
          </div>
          {t.body && <p className="mt-1 text-xs text-gray-600">{t.body}</p>}
        </div>
      ))}
    </div>
  );
}

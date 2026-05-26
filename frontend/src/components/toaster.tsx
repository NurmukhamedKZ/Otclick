"use client";

import { useEffect, useRef, useState } from "react";
import { StatusDot } from "@/components/otclick/ui";

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

const KIND_DOT: Record<ToastKind, "ok" | "warn" | "err" | "muted"> = {
  info: "muted",
  success: "ok",
  warning: "warn",
  error: "err",
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
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "var(--ink)",
            color: "#F5F1E6",
            padding: "12px 16px",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            animation: "oc-slidein .3s cubic-bezier(.2,.8,.2,1)",
            minWidth: 280,
            maxWidth: 380,
            pointerEvents: "auto",
          }}
        >
          <StatusDot tone={KIND_DOT[t.kind]} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
            {t.body && <div style={{ fontSize: 12, color: "#ffffff80", marginTop: 2 }}>{t.body}</div>}
          </div>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label="dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff80",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Btn, StatusDot } from "@/components/otclick/ui";

type HHStatus = {
  connected: boolean;
  expires_at: string | null;
  last_refreshed_at: string | null;
  hh_user_id: string | null;
};

function classify(s: HHStatus | null): "ok" | "warn" | "err" | null {
  if (!s) return null;
  if (!s.connected) return "err";
  if (s.expires_at) {
    const t = new Date(s.expires_at).getTime();
    if (t - Date.now() < 24 * 3600 * 1000) return "warn";
  }
  return "ok";
}

export default function HHBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<HHStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HHStatus>("/api/hh/status")
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "status failed"));
  }, []);

  if (error) {
    return (
      <div
        style={{
          background: "var(--coral-soft)",
          color: "#7C2A1E",
          borderRadius: 18,
          padding: "14px 18px",
          marginBottom: 18,
          fontSize: 13,
        }}
      >
        hh status: {error}
      </div>
    );
  }

  const kind = classify(status);
  if (!kind || kind === "ok") {
    if (kind === "ok") return null;
    return (
      <div
        style={{
          background: "var(--bg-deep)",
          borderRadius: 18,
          padding: "14px 18px",
          marginBottom: 18,
          height: 50,
          opacity: 0.6,
        }}
      />
    );
  }

  const map = {
    warn: {
      bg: "var(--yellow-soft)",
      label: "токен скоро истечёт",
      sub: "мы обновим его автоматически",
      dot: "warn" as const,
    },
    err: {
      bg: "var(--coral-soft)",
      label: "нет связи с hh",
      sub: "переподключи аккаунт, чтобы продолжить",
      dot: "err" as const,
    },
  }[kind];

  return (
    <div
      style={{
        background: map.bg,
        borderRadius: 18,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 18,
      }}
    >
      <StatusDot tone={map.dot} size={10} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{map.label}</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", opacity: 0.8 }}>{map.sub}</div>
      </div>
      <Btn kind="primary" size="sm" onClick={() => router.push("/onboarding")}>
        переподключить
      </Btn>
    </div>
  );
}

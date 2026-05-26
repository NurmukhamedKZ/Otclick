"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { WorkerStatus } from "@/lib/types";
import { Card } from "@/components/otclick/ui";
import { IBolt } from "@/components/otclick/icons";
import { createClient } from "@/lib/supabase/client";

type HourBucket = { h: number; sent: number; capt: number };

function buildHours(rows: { created_at: string; status: string }[]): HourBucket[] {
  const now = new Date();
  const buckets: HourBucket[] = [];
  for (let i = 8; i >= 0; i--) {
    const dt = new Date(now);
    dt.setHours(now.getHours() - i, 0, 0, 0);
    buckets.push({ h: dt.getHours(), sent: 0, capt: 0 });
  }
  for (const row of rows) {
    const dt = new Date(row.created_at);
    const idx = buckets.findIndex((b) => b.h === dt.getHours());
    if (idx < 0) continue;
    if (row.status === "sent") buckets[idx].sent += 1;
    else if (row.status === "captcha") buckets[idx].capt += 1;
  }
  return buckets;
}

export default function TodayResultsCard() {
  const supabase = useMemo(() => createClient(), []);
  const { data: status } = useQuery({
    queryKey: ["worker-status"],
    queryFn: () => apiFetch<WorkerStatus>("/api/worker/status"),
    refetchInterval: 15000,
  });

  const [hours, setHours] = useState<HourBucket[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setHours(since.getHours() - 9, 0, 0, 0);
      const { data } = await supabase
        .from("applications")
        .select("created_at,status")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setHours(buildHours((data ?? []) as { created_at: string; status: string }[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const todayCount = status?.today_count ?? 0;
  const dailyLimit = status?.daily_limit ?? 0;
  const captchaCount = hours.reduce((a, b) => a + b.capt, 0);
  const lastHour = hours[hours.length - 1]?.sent ?? 0;

  const W = 520;
  const H = 180;
  const PAD = 10;
  const maxY = Math.max(40, ...hours.map((h) => h.sent + 4));
  const xFor = (i: number) => PAD + (i / Math.max(1, hours.length - 1)) * (W - PAD * 2);
  const yFor = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);

  const pts = hours.map((h, i) => [xFor(i), yFor(h.sent)] as const);
  const smooth = (p: readonly (readonly [number, number])[]) => {
    if (p.length < 2) return "";
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };
  const linePath = smooth(pts);
  const areaPath =
    pts.length > 1
      ? linePath + ` L ${pts[pts.length - 1][0]} ${H - PAD} L ${pts[0][0]} ${H - PAD} Z`
      : "";

  return (
    <Card tone="cream" style={{ padding: 24, height: "100%", overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 700,
            }}
          >
            что бот сделал за сегодня
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.5, lineHeight: 0.85 }}>
              {todayCount}
            </span>
            <span className="serif" style={{ fontSize: 26 }}>откликов</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "var(--ink)",
                color: "var(--yellow)",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ↑ {lastHour} за час
            </span>
            {captchaCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "var(--coral-soft)",
                  color: "#7C2A1E",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                · {captchaCount} на капчу
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: "var(--ink)",
            color: "var(--yellow)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <IBolt size={16} />
        </div>
      </div>

      <div style={{ position: "relative", marginTop: 22 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180, display: "block" }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--yellow)", stopOpacity: 0.75 }} />
              <stop offset="100%" style={{ stopColor: "var(--yellow)", stopOpacity: 0.05 }} />
            </linearGradient>
            <pattern id="dotgrid" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="var(--muted-2)" opacity="0.5" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="url(#dotgrid)" opacity="0.5" />
          {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}
          {linePath && (
            <path d={linePath} stroke="var(--ink)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          )}
          {hours.map((h, i) =>
            h.capt > 0 ? (
              <circle key={i} cx={xFor(i)} cy={yFor(h.sent) - 12} r="3.5" fill="var(--coral)" />
            ) : null,
          )}
          {pts.length > 0 && (
            <>
              <line
                x1={xFor(hours.length - 1)}
                y1="0"
                x2={xFor(hours.length - 1)}
                y2={H}
                stroke="var(--ink)"
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity="0.3"
              />
              <circle
                cx={xFor(hours.length - 1)}
                cy={yFor(hours[hours.length - 1].sent)}
                r="14"
                fill="var(--yellow)"
                opacity="0.25"
              >
                <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={xFor(hours.length - 1)}
                cy={yFor(hours[hours.length - 1].sent)}
                r="6"
                fill="var(--yellow)"
                stroke="var(--ink)"
                strokeWidth="2"
              />
            </>
          )}
        </svg>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            padding: "0 6px",
          }}
        >
          {hours.map((h, i) => (
            <span
              key={i}
              className="mono"
              style={{
                fontSize: 10,
                color: i === hours.length - 1 ? "var(--ink)" : "var(--muted)",
                fontWeight: i === hours.length - 1 ? 700 : 400,
              }}
            >
              {h.h.toString().padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          marginTop: 22,
          padding: "14px 0 0",
          borderTop: "1px solid var(--line)",
        }}
      >
        {[
          { v: status?.today_count ?? 0, u: "", l: "сегодня" },
          { v: status?.queued ?? 0, u: "", l: "в очереди" },
          { v: dailyLimit, u: "", l: "дневной лимит" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              paddingLeft: i ? 16 : 0,
              borderLeft: i ? "1px solid var(--line)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{s.v}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.u}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

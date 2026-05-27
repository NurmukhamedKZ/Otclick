"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/otclick/ui";
import { IChevDown } from "@/components/otclick/icons";

const DAYS_RU = ["П", "В", "С", "Ч", "П", "С", "В"];
const MONTHS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export default function ActivityCalendar() {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [maxCount, setMaxCount] = useState(0);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data } = await supabase
        .from("applications")
        .select("created_at,status")
        .gte("created_at", start)
        .lt("created_at", end)
        .in("status", ["sent", "form_sent"]);
      if (cancelled) return;
      const m = new Map<number, number>();
      let mx = 0;
      for (const row of (data ?? []) as { created_at: string }[]) {
        const d = new Date(row.created_at).getDate();
        const next = (m.get(d) ?? 0) + 1;
        m.set(d, next);
        if (next > mx) mx = next;
      }
      setCounts(m);
      setMaxCount(mx);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, year, month]);

  const cells: number[] = [];
  for (let i = 0; i < daysInMonth; i++) cells.push(i + 1);

  function paletteFor(day: number) {
    if (day === today) {
      return { bg: "var(--yellow)", fg: "var(--ink)", border: "none", fw: 700 };
    }
    const c = counts.get(day) ?? 0;
    if (c === 0) {
      return { bg: "transparent", fg: "#ffffff70", border: "1px solid #ffffff15", fw: 400 };
    }
    const intensity = maxCount > 0 ? c / maxCount : 0;
    const opacity = Math.min(0.15 + intensity * 0.5, 0.7);
    return {
      bg: `rgba(255,255,255,${opacity.toFixed(2)})`,
      fg: "#F5F1E6",
      border: "none",
      fw: 500,
    };
  }

  return (
    <Card tone="dark" style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700 }}>Активность за месяц</div>
        <button
          type="button"
          style={{
            background: "#ffffff10",
            color: "#F5F1E6",
            border: "none",
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          {MONTHS_RU[month]} <IChevDown size={12} />
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 8,
        }}
      >
        {DAYS_RU.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#ffffff60" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cells.map((d) => {
          const p = paletteFor(d);
          return (
            <div
              key={d}
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                background: p.bg,
                color: p.fg,
                border: p.border,
                fontWeight: p.fw,
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 16,
          fontSize: 11,
          color: "#ffffff80",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--yellow)" }} />{" "}
          сегодня
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#ffffff50" }} />{" "}
          отклики
        </span>
      </div>
    </Card>
  );
}

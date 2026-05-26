"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFilters } from "@/hooks/useFilters";
import { Card } from "@/components/otclick/ui";
import { IChevRight, IFilter, IList, IUser } from "@/components/otclick/icons";
import { openFiltersDrawer } from "@/components/filters-drawer";
import { createClient } from "@/lib/supabase/client";

export default function QuickActions() {
  const { items: filters } = useFilters();
  const supabase = createClient();
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true });
      if (cancelled) return;
      setTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const activeFilters = filters?.filter((f) => f.enabled).length ?? 0;

  const items = [
    {
      key: "filters",
      icon: <IFilter size={16} />,
      label: "Фильтры",
      sub: `${activeFilters} активных`,
      tone: "yellow",
      onClick: openFiltersDrawer,
    },
    {
      key: "applications",
      icon: <IList size={16} />,
      label: "Все отклики",
      sub: total !== null ? `${total} всего` : "—",
      tone: "dark",
      href: "/applications",
    },
    {
      key: "account",
      icon: <IUser size={16} />,
      label: "Аккаунт",
      sub: "настройки",
      tone: "light",
      href: "/account",
    },
  ] as const;

  return (
    <Card tone="cream" style={{ padding: 18 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        Быстрые действия
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => {
          const palette =
            it.tone === "yellow"
              ? { bg: "var(--yellow)", fg: "var(--ink)" }
              : it.tone === "dark"
                ? { bg: "var(--ink)", fg: "#F5F1E6" }
                : { bg: "#fff", fg: "var(--ink)" };
          const content = (
            <div
              style={{
                border: "none",
                textAlign: "left",
                background: palette.bg,
                color: palette.fg,
                padding: "14px 16px",
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                width: "100%",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: it.tone === "light" ? "var(--bg-deep)" : "#ffffff20",
                  display: "grid",
                  placeItems: "center",
                  color: palette.fg,
                }}
              >
                {it.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{it.sub}</div>
              </div>
              <IChevRight size={16} />
            </div>
          );
          if ("href" in it && it.href) {
            return (
              <Link key={it.key} href={it.href} style={{ textDecoration: "none" }}>
                {content}
              </Link>
            );
          }
          return (
            <button
              type="button"
              key={it.key}
              onClick={it.onClick}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                width: "100%",
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

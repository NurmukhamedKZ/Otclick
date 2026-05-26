"use client";

import Link from "next/link";
import { Btn } from "@/components/otclick/ui";
import { IBolt, IFilter, ISearch } from "@/components/otclick/icons";
import { openFiltersDrawer } from "@/components/filters-drawer";

export default function Topbar({
  greeting,
  subtitle,
}: {
  greeting: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "6px 0 18px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{greeting}</div>
        {subtitle && (
          <div style={{ color: "var(--muted)", marginTop: 2, fontSize: 14 }}>{subtitle}</div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--surface)",
          borderRadius: 999,
          padding: "8px 18px",
          minWidth: 240,
        }}
      >
        <ISearch size={18} stroke="var(--muted)" />
        <input
          placeholder="поиск по вакансиям, работодателям…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 14,
            color: "var(--ink)",
            fontFamily: "inherit",
            minWidth: 0,
          }}
        />
        <kbd
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--muted)",
            background: "var(--bg-deep)",
            padding: "2px 6px",
            borderRadius: 6,
          }}
        >
          ⌘K
        </kbd>
      </div>
      <Btn kind="ghost" icon={<IFilter size={16} />} onClick={openFiltersDrawer}>
        Фильтры
      </Btn>
      <Link href="/billing">
        <Btn kind="primary" icon={<IBolt size={16} />}>
          Pro
        </Btn>
      </Link>
    </div>
  );
}

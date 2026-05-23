"use client";

import { useState } from "react";
import type { Filter, FilterPreview, VacancyPreviewItem } from "@/lib/types";

type Props = {
  filter: Filter;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPreview: (id: string) => Promise<FilterPreview>;
};

function fmtSalary(s: Record<string, unknown> | null): string {
  if (!s) return "";
  const from = s.from as number | null | undefined;
  const to = s.to as number | null | undefined;
  const cur = (s.currency as string | null | undefined) ?? "";
  if (!from && !to) return "";
  return `${from ?? ""}${to ? `–${to}` : "+"} ${cur}`.trim();
}

export default function FilterRow({
  filter,
  onToggle,
  onDelete,
  onPreview,
}: Props) {
  const [preview, setPreview] = useState<FilterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePreview() {
    if (preview) {
      setPreview(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(await onPreview(filter.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "preview failed");
    } finally {
      setBusy(false);
    }
  }

  const tags: string[] = [];
  if (filter.text) tags.push(filter.text);
  if (filter.area === 40) tags.push("KZ");
  if (filter.area === 113) tags.push("RU");
  if (filter.salary_min) tags.push(`от ${filter.salary_min}`);
  if (filter.experience) tags.push(filter.experience);
  if (filter.schedule) tags.push(filter.schedule);
  if (filter.employment) tags.push(filter.employment);

  return (
    <li className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {tags.length ? tags.join(" · ") : "(пустой фильтр)"}
          </div>
          {filter.excluded_regex && (
            <div className="text-xs text-gray-500 mt-1 truncate">
              exclude: {filter.excluded_regex}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs flex items-center gap-1">
            <input
              type="checkbox"
              checked={filter.enabled}
              onChange={(e) => onToggle(filter.id, e.target.checked)}
            />
            вкл
          </label>
          <button
            onClick={togglePreview}
            disabled={busy}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? "…" : preview ? "Скрыть" : "Preview"}
          </button>
          <button
            onClick={() => {
              if (confirm("Удалить фильтр?")) onDelete(filter.id);
            }}
            className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {preview && (
        <div className="mt-3 border-t pt-3">
          <div className="text-xs text-gray-500 mb-2">
            Найдено: {preview.found}
          </div>
          <ul className="space-y-1 text-sm">
            {preview.items.map((v: VacancyPreviewItem) => (
              <li key={v.id} className="flex justify-between gap-2">
                <a
                  href={v.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-blue-700 hover:underline"
                >
                  {v.name}
                </a>
                <span className="text-xs text-gray-500 shrink-0">
                  {v.employer} · {fmtSalary(v.salary)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useFilters } from "@/hooks/useFilters";
import FilterForm from "@/app/(app)/dashboard/filters/filter-form";
import FilterRow from "@/app/(app)/dashboard/filters/filter-row";
import BlacklistSection from "@/app/(app)/dashboard/filters/blacklist-section";
import { SkeletonList } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";

const EVENT = "filters-drawer";

export function openFiltersDrawer() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { open: true } }));
}

export default function FiltersDrawer() {
  const [open, setOpen] = useState(false);
  const { items, error, create, update, remove, preview } = useFilters();

  useEffect(() => {
    function onToggle(e: Event) {
      const detail = (e as CustomEvent<{ open: boolean }>).detail;
      setOpen(!!detail?.open);
    }
    window.addEventListener(EVENT, onToggle);
    return () => window.removeEventListener(EVENT, onToggle);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold">Фильтры поиска</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterForm onSubmit={async (body) => void (await create(body))} />

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {items === null ? (
            <SkeletonList rows={3} />
          ) : items.length === 0 ? (
            <Empty
              title="Нет фильтров"
              hint="Добавь первый — worker подберёт подходящие вакансии."
            />
          ) : (
            <ul className="space-y-2">
              {items.map((f) => (
                <FilterRow
                  key={f.id}
                  filter={f}
                  onToggle={async (id, enabled) => {
                    await update(id, { enabled });
                  }}
                  onDelete={remove}
                  onPreview={preview}
                />
              ))}
            </ul>
          )}

          <BlacklistSection />
        </div>
      </aside>
    </div>
  );
}

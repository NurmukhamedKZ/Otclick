"use client";

import Link from "next/link";
import { useFilters } from "@/hooks/useFilters";
import FilterForm from "./filter-form";
import FilterRow from "./filter-row";
import BlacklistSection from "./blacklist-section";

export default function FiltersPage() {
  const { items, error, create, update, remove, preview } = useFilters();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Фильтры</h1>
        <Link
          href="/dashboard"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Dashboard
        </Link>
      </header>

      <FilterForm onSubmit={async (body) => void (await create(body))} />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {items === null ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Нет фильтров. Добавь первый.
        </p>
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
    </main>
  );
}

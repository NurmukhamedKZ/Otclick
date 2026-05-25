"use client";

import { useState } from "react";
import { useBlacklist } from "@/hooks/useBlacklist";

const REASON_LABEL: Record<string, string> = {
  manual: "вручную",
  auto_already_applied: "уже откликались",
};

export default function BlacklistSection() {
  const { items, error, add, remove } = useBlacklist();
  const [employerId, setEmployerId] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const id = employerId.trim();
    if (!id) return;
    setBusy(true);
    setFormError(null);
    try {
      await add({
        employer_id: id,
        employer_name: employerName.trim() || null,
        reason: "manual",
      });
      setEmployerId("");
      setEmployerName("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold mb-1">Чёрный список</h2>
      <p className="text-xs text-gray-500 mb-3">
        Компании из списка пропускаются. Worker добавляет сюда автоматически тех,
        кому уже отправлен отклик.
      </p>

      <form onSubmit={onAdd} className="flex flex-wrap gap-2 mb-3">
        <input
          value={employerId}
          onChange={(e) => setEmployerId(e.target.value)}
          placeholder="ID работодателя (hh employer_id)"
          className="flex-1 min-w-[12rem] rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          value={employerName}
          onChange={(e) => setEmployerName(e.target.value)}
          placeholder="Название (необязательно)"
          className="flex-1 min-w-[10rem] rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !employerId.trim()}
          className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "…" : "Добавить"}
        </button>
      </form>

      {(formError || error) && (
        <p className="text-sm text-red-600 mb-3">{formError || error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Список пуст.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {b.employer_name || `employer #${b.employer_id}`}
                </div>
                <div className="text-xs text-gray-500">
                  id {b.employer_id}
                  {b.reason ? ` · ${REASON_LABEL[b.reason] ?? b.reason}` : ""}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm("Убрать из чёрного списка?")) remove(b.id);
                }}
                className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

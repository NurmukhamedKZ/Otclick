"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFilters } from "@/hooks/useFilters";
import { useCoverLetter } from "@/hooks/useCoverLetter";
import type { Filter, FilterPreview, Resume, ResumesList, VacancyPreviewItem } from "@/lib/types";

export default function CoverLetterPage() {
  const { items: filters } = useFilters();
  const { generate, busyId, error } = useCoverLetter();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [filterId, setFilterId] = useState<string>("");
  const [vacancies, setVacancies] = useState<VacancyPreviewItem[]>([]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    apiFetch<ResumesList>("/api/resumes")
      .then((d) => {
        setResumes(d.items);
        if (d.items[0]) setResumeId(d.items[0].id);
      })
      .catch(() => setResumes([]));
  }, []);

  async function loadPreview() {
    if (!filterId) return;
    setLoadingPreview(true);
    try {
      const data = await apiFetch<FilterPreview>(`/api/filters/${filterId}/preview`);
      setVacancies(data.items.filter((v) => v.id));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onGenerate(vacancyId: string) {
    if (!resumeId) return;
    const res = await generate(vacancyId, resumeId);
    if (res) {
      setLetters((prev) => ({ ...prev, [vacancyId]: res.text }));
      setRemaining(res.remaining);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Сопроводительные письма
      </h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
          style={{ padding: 8, borderRadius: 8 }}
        >
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title ?? r.hh_resume_id}
            </option>
          ))}
        </select>

        <select
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
          style={{ padding: 8, borderRadius: 8 }}
        >
          <option value="">— выбери фильтр —</option>
          {(filters ?? []).map((f: Filter) => (
            <option key={f.id} value={f.id}>
              {f.text ?? f.id}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={loadPreview}
          disabled={!filterId || loadingPreview}
          style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
        >
          {loadingPreview ? "Загрузка…" : "Показать вакансии"}
        </button>
      </div>

      {remaining !== null && (
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
          Осталось бесплатных генераций сегодня: {remaining}
        </p>
      )}
      {error && (
        <p style={{ color: "var(--coral, #d44)", marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {vacancies.map((v) => (
          <div
            key={v.id!}
            style={{
              border: "1px solid var(--line-2, #eee)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{v.name}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{v.employer}</div>
              </div>
              <button
                type="button"
                onClick={() => onGenerate(v.id!)}
                disabled={busyId === v.id || !resumeId}
                style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {busyId === v.id ? "Генерация…" : "Сгенерировать письмо"}
              </button>
            </div>
            {letters[v.id!] && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  readOnly
                  value={letters[v.id!]}
                  style={{ width: "100%", minHeight: 140, padding: 10, borderRadius: 8 }}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(letters[v.id!])}
                  style={{ marginTop: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}
                >
                  Копировать
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

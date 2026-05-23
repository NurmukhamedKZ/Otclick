"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { FilterCreate, Resume, ResumesList } from "@/lib/types";

type Props = {
  onSubmit: (body: FilterCreate) => Promise<void>;
};

const AREAS = [
  { value: "", label: "— регион —" },
  { value: "40", label: "Казахстан" },
  { value: "113", label: "Россия" },
];

const EXPERIENCE = [
  { value: "", label: "— опыт —" },
  { value: "noExperience", label: "Без опыта" },
  { value: "between1And3", label: "1–3 года" },
  { value: "between3And6", label: "3–6 лет" },
  { value: "moreThan6", label: "> 6 лет" },
];

const SCHEDULE = [
  { value: "", label: "— график —" },
  { value: "fullDay", label: "Полный день" },
  { value: "remote", label: "Удалённо" },
  { value: "flexible", label: "Гибкий" },
  { value: "shift", label: "Сменный" },
];

const EMPLOYMENT = [
  { value: "", label: "— занятость —" },
  { value: "full", label: "Полная" },
  { value: "part", label: "Частичная" },
  { value: "project", label: "Проектная" },
  { value: "probation", label: "Стажировка" },
];

export default function FilterForm({ onSubmit }: Props) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [text, setText] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [area, setArea] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [experience, setExperience] = useState("");
  const [schedule, setSchedule] = useState("");
  const [employment, setEmployment] = useState("");
  const [excludedRegex, setExcludedRegex] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResumesList>("/api/resumes")
      .then((d) => setResumes(d.items))
      .catch(() => undefined);
  }, []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        text: text || null,
        resume_id: resumeId || null,
        area: area ? Number(area) : null,
        salary_min: salaryMin ? Number(salaryMin) : null,
        experience: experience || null,
        schedule: schedule || null,
        employment: employment || null,
        excluded_regex: excludedRegex || null,
        enabled: true,
      });
      setText("");
      setResumeId("");
      setArea("");
      setSalaryMin("");
      setExperience("");
      setSchedule("");
      setEmployment("");
      setExcludedRegex("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded border border-gray-300 px-2 py-1.5 text-sm bg-white";

  return (
    <form
      onSubmit={handle}
      className="rounded border border-gray-200 bg-white p-4 mb-6"
    >
      <h2 className="font-semibold mb-3">Новый фильтр</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className={inputCls}
          placeholder="Текст поиска (например: python)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          className={inputCls}
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
        >
          <option value="">— резюме (любое) —</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title ?? r.hh_resume_id}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          {AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          type="number"
          min={0}
          placeholder="Зарплата от"
          value={salaryMin}
          onChange={(e) => setSalaryMin(e.target.value)}
        />
        <select
          className={inputCls}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
        >
          {EXPERIENCE.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        >
          {SCHEDULE.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={employment}
          onChange={(e) => setEmployment(e.target.value)}
        >
          {EMPLOYMENT.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Excluded regex (опц.)"
          value={excludedRegex}
          onChange={(e) => setExcludedRegex(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black text-white px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "Сохранение…" : "Добавить"}
        </button>
      </div>
    </form>
  );
}

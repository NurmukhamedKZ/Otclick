"use client";

import { useEffect, useState } from "react";
import { useFilters } from "@/hooks/useFilters";
import { useBlacklist } from "@/hooks/useBlacklist";
import { Btn, Card, Toggle } from "@/components/otclick/ui";
import { IClose, IFilter, IPlus, ITrash } from "@/components/otclick/icons";
import type { Filter, FilterCreate, Resume, ResumesList } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { pushToast } from "@/components/toaster";

const EVENT = "filters-drawer";

export function openFiltersDrawer() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { open: true } }));
}

const AREAS = [
  { value: "", label: "— регион —" },
  { value: "40", label: "Казахстан" },
  { value: "113", label: "Россия" },
];

const EXPERIENCE = [
  { value: "", label: "не важно" },
  { value: "noExperience", label: "без опыта" },
  { value: "between1And3", label: "1–3 года" },
  { value: "between3And6", label: "3–6 лет" },
  { value: "moreThan6", label: "> 6 лет" },
];

const SCHEDULE = [
  { value: "", label: "— график —" },
  { value: "fullDay", label: "полный день" },
  { value: "remote", label: "удалённо" },
  { value: "flexible", label: "гибкий" },
  { value: "shift", label: "сменный" },
];

type Tab = "filters" | "blacklist" | "ai";

function filterTitle(f: Filter): string {
  if (f.text) return f.text;
  const parts: string[] = [];
  if (f.area === 40) parts.push("KZ");
  if (f.area === 113) parts.push("RU");
  if (f.salary_min) parts.push(`от ${f.salary_min}`);
  return parts.length ? parts.join(" · ") : "пустой фильтр";
}

export default function FiltersDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("filters");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [creating, setCreating] = useState(false);

  const { items: filters, error: filterError, create, update, remove } = useFilters();
  const { items: blacklist, error: blacklistError, add: addBl, remove: removeBl } = useBlacklist();
  const [newCompany, setNewCompany] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");

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

  useEffect(() => {
    if (open) {
      apiFetch<ResumesList>("/api/resumes")
        .then((d) => setResumes(d.items))
        .catch(() => undefined);
    }
  }, [open]);

  useEffect(() => {
    if (filters && filters.length > 0 && !selectedId) {
      setSelectedId(filters[0].id);
    }
    if (filters && selectedId && !filters.find((f) => f.id === selectedId)) {
      setSelectedId(filters[0]?.id ?? null);
    }
  }, [filters, selectedId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const row = await create({ enabled: true });
      setSelectedId(row.id);
      pushToast({ kind: "success", title: "фильтр создан" });
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : "create failed" });
    } finally {
      setCreating(false);
    }
  }

  const selected = filters?.find((f) => f.id === selectedId) ?? null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .25s",
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(640px, 96vw)",
          background: "var(--bg)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .3s cubic-bezier(.2,.8,.2,1)",
          zIndex: 51,
          padding: 24,
          overflow: "auto",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Фильтры и чёрный список</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              Управляй, на какие вакансии бот откликается
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background: "var(--surface)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            <IClose size={18} />
          </button>
        </div>

        <div
          style={{
            display: "inline-flex",
            background: "var(--surface)",
            padding: 6,
            borderRadius: 999,
            marginBottom: 18,
          }}
        >
          {(["filters", "blacklist", "ai"] as const).map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              style={{
                border: "none",
                padding: "7px 16px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                background: tab === id ? "var(--ink)" : "transparent",
                color: tab === id ? "#F5F1E6" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              {id === "filters" ? "Фильтры" : id === "blacklist" ? "Чёрный список" : "AI-настройки"}
            </button>
          ))}
        </div>

        {tab === "filters" && (
          <>
            {filterError && (
              <p style={{ color: "var(--err)", fontSize: 13, marginBottom: 10 }}>{filterError}</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {filters === null && (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>загрузка…</div>
              )}
              {filters?.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  style={{
                    cursor: "pointer",
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: selectedId === f.id ? "var(--ink)" : "var(--surface)",
                    color: selectedId === f.id ? "#F5F1E6" : "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    outline: selectedId === f.id ? "2px solid var(--yellow)" : "none",
                    outlineOffset: -2,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      flexShrink: 0,
                      background: f.enabled ? "var(--yellow)" : "var(--bg-deep)",
                      color: "var(--ink)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <IFilter size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      «{filterTitle(f)}»
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: selectedId === f.id ? "#ffffff70" : "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      {[f.area === 40 ? "KZ" : f.area === 113 ? "RU" : null, f.schedule, f.experience]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Toggle
                      on={f.enabled}
                      onChange={async (next) => {
                        await update(f.id, { enabled: next });
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  border: "1.5px dashed var(--muted-2)",
                  background: "transparent",
                  borderRadius: 14,
                  padding: 14,
                  color: "var(--muted)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontFamily: "inherit",
                }}
              >
                <IPlus size={14} /> {creating ? "создаём…" : "новый фильтр"}
              </button>
            </div>

            {selected && (
              <FilterEditor
                key={selected.id}
                filter={selected}
                resumes={resumes}
                onUpdate={(patch) => update(selected.id, patch)}
                onDelete={async () => {
                  if (!confirm("Удалить фильтр?")) return;
                  await remove(selected.id);
                }}
              />
            )}
          </>
        )}

        {tab === "blacklist" && (
          <Card tone="light">
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>
              Бот не будет откликаться в эти компании, даже если вакансия подходит по фильтру.
            </div>
            {blacklistError && (
              <p style={{ color: "var(--err)", fontSize: 13, marginBottom: 10 }}>{blacklistError}</p>
            )}
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}
            >
              {blacklist === null && (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>загрузка…</span>
              )}
              {blacklist?.length === 0 && (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>список пуст</span>
              )}
              {blacklist?.map((b) => (
                <span
                  key={b.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    background: "var(--bg-deep)",
                    borderRadius: 999,
                    fontSize: 13,
                  }}
                >
                  {b.employer_name ?? `id ${b.employer_id}`}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Убрать из чёрного списка?")) removeBl(b.id);
                    }}
                    aria-label="remove"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      display: "inline-flex",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <IClose size={12} />
                  </button>
                </span>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCompanyId.trim()) return;
                try {
                  await addBl({
                    employer_id: newCompanyId.trim(),
                    employer_name: newCompany.trim() || null,
                    reason: "manual",
                  });
                  setNewCompany("");
                  setNewCompanyId("");
                } catch (err) {
                  pushToast({
                    kind: "error",
                    title: err instanceof Error ? err.message : "add failed",
                  });
                }
              }}
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <input
                value={newCompanyId}
                onChange={(e) => setNewCompanyId(e.target.value)}
                placeholder="employer_id"
                style={{
                  flex: "1 1 120px",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  outline: "none",
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              />
              <input
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="название (опц.)"
                style={{
                  flex: "2 1 180px",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  outline: "none",
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              />
              <Btn type="submit" kind="primary" icon={<IPlus size={14} />}>
                добавить
              </Btn>
            </form>
          </Card>
        )}

        {tab === "ai" && (
          <Card tone="light">
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              AI-сопроводительное
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
              Шаблон применяется на бэкенде. Редактирование шаблона из UI — в разработке.
            </div>
            <textarea
              disabled
              defaultValue={`Здравствуйте!

Меня заинтересовала вакансия {{vacancy}} в {{employer}}. У меня опыт в {{key_skills}}.

Готов обсудить детали в удобное время.`}
              style={{
                width: "100%",
                minHeight: 160,
                padding: 16,
                borderRadius: 14,
                border: "1px solid var(--line)",
                background: "var(--bg-deep)",
                outline: "none",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 13,
                lineHeight: 1.6,
                resize: "vertical",
                color: "var(--muted)",
              }}
            />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              Скоро: редактирование из UI · OpenAI GPT-4o-mini
            </div>
          </Card>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            padding: "16px 0",
            borderTop: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            изменения сохраняются автоматически
          </span>
          <Btn kind="primary" onClick={() => setOpen(false)}>
            готово
          </Btn>
        </div>
      </div>
    </>
  );
}

function FilterEditor({
  filter,
  resumes,
  onUpdate,
  onDelete,
}: {
  filter: Filter;
  resumes: Resume[];
  onUpdate: (patch: Partial<FilterCreate>) => Promise<unknown>;
  onDelete: () => Promise<void>;
}) {
  const [text, setText] = useState(filter.text ?? "");
  const [salaryMin, setSalaryMin] = useState(filter.salary_min ? String(filter.salary_min) : "");
  const [area, setArea] = useState(filter.area ? String(filter.area) : "");
  const [schedule, setSchedule] = useState(filter.schedule ?? "");
  const [experience, setExperience] = useState(filter.experience ?? "");
  const [resumeId, setResumeId] = useState(filter.resume_id ?? "");
  const [excludedRegex, setExcludedRegex] = useState(filter.excluded_regex ?? "");

  async function commit(patch: Partial<FilterCreate>) {
    try {
      await onUpdate(patch);
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : "save failed" });
    }
  }

  const expPills = EXPERIENCE.filter((e) => e.value);

  return (
    <Card tone="light" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>«{filterTitle(filter)}»</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            редактировать параметры поиска
          </div>
        </div>
        <Btn kind="ghost" size="sm" icon={<ITrash size={13} />} onClick={onDelete}>
          удалить
        </Btn>
      </div>

      <EditorField label="ключевые слова">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (filter.text ?? "") && commit({ text: text || null })}
          placeholder="python, django, fastapi"
          style={inputStyle}
        />
      </EditorField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <EditorField label="зарплата от">
          <input
            type="number"
            min={0}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            onBlur={() =>
              salaryMin !== (filter.salary_min ? String(filter.salary_min) : "") &&
              commit({ salary_min: salaryMin ? Number(salaryMin) : null })
            }
            placeholder="например 250000"
            style={inputStyle}
          />
        </EditorField>
        <EditorField label="регион">
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              commit({ area: e.target.value ? Number(e.target.value) : null });
            }}
            style={inputStyle}
          >
            {AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </EditorField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <EditorField label="график">
          <select
            value={schedule}
            onChange={(e) => {
              setSchedule(e.target.value);
              commit({ schedule: e.target.value || null });
            }}
            style={inputStyle}
          >
            {SCHEDULE.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </EditorField>
        <EditorField label="резюме">
          <select
            value={resumeId}
            onChange={(e) => {
              setResumeId(e.target.value);
              commit({ resume_id: e.target.value || null });
            }}
            style={inputStyle}
          >
            <option value="">— любое —</option>
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title ?? r.hh_resume_id}
              </option>
            ))}
          </select>
        </EditorField>
      </div>

      <div style={{ marginTop: 6, marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          опыт работы
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setExperience("");
              commit({ experience: null });
            }}
            style={pillStyle(experience === "")}
          >
            не важно
          </button>
          {expPills.map((e) => (
            <button
              type="button"
              key={e.value}
              onClick={() => {
                setExperience(e.value);
                commit({ experience: e.value });
              }}
              style={pillStyle(experience === e.value)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <EditorField label="excluded regex (опц.)">
        <input
          value={excludedRegex}
          onChange={(e) => setExcludedRegex(e.target.value)}
          onBlur={() =>
            excludedRegex !== (filter.excluded_regex ?? "") &&
            commit({ excluded_regex: excludedRegex || null })
          }
          placeholder="например (junior|стажёр)"
          style={inputStyle}
        />
      </EditorField>
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 14,
  color: "var(--ink)",
};

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    background: active ? "var(--ink)" : "var(--bg-deep)",
    color: active ? "#F5F1E6" : "var(--ink)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

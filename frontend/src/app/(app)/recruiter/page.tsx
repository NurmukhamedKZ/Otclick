"use client";

import { useState } from "react";
import Topbar from "@/components/otclick/topbar";
import { Btn, Card } from "@/components/otclick/ui";
import { useRecruiter, type Draft } from "@/hooks/useRecruiter";

function DraftCard({
  draft,
  onSend,
  onDiscard,
}: {
  draft: Draft;
  onSend: (id: string, msg: string) => void;
  onDiscard: (id: string) => void;
}) {
  const [text, setText] = useState(draft.draft_text);
  return (
    <Card style={{ display: "grid", gap: 10 }}>
      {draft.reason && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Причина: {draft.reason}</div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          resize: "vertical",
          padding: 10,
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "var(--bg-deep)",
          color: "var(--ink)",
          fontSize: 14,
          lineHeight: 1.4,
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="primary" size="sm" onClick={() => onSend(draft.id, text)}>
          Отправить
        </Btn>
        <Btn kind="ghost" size="sm" onClick={() => onDiscard(draft.id)}>
          Отклонить
        </Btn>
      </div>
    </Card>
  );
}

export default function RecruiterPage() {
  const { drafts, todos, loading, error, sendDraft, discardDraft, resolveTodo } = useRecruiter();

  return (
    <>
      <Topbar greeting="Переписка" subtitle={`${drafts.length} черновиков · ${todos.length} задач`} />

      {error && <div style={{ color: "var(--err)", padding: 16 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 16, color: "var(--muted)" }}>Загрузка…</div>
      ) : (
        <div style={{ display: "grid", gap: 28, padding: 16 }}>
          <section style={{ display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Черновики ответов ({drafts.length})</h2>
            {drafts.length === 0 && (
              <div style={{ fontSize: 14, color: "var(--muted)" }}>Нет черновиков.</div>
            )}
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onSend={sendDraft} onDiscard={discardDraft} />
            ))}
          </section>

          <section style={{ display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Задачи ({todos.length})</h2>
            {todos.length === 0 && (
              <div style={{ fontSize: 14, color: "var(--muted)" }}>Нет задач.</div>
            )}
            {todos.map((t) => (
              <Card key={t.id} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.detail && <div style={{ fontSize: 14 }}>{t.detail}</div>}
                {t.link && (
                  <a
                    href={t.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 14, color: "var(--coral)", textDecoration: "underline" }}
                  >
                    {t.link}
                  </a>
                )}
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <Btn kind="primary" size="sm" onClick={() => resolveTodo(t.id, "done")}>
                    Готово
                  </Btn>
                  <Btn kind="ghost" size="sm" onClick={() => resolveTodo(t.id, "dismiss")}>
                    Скрыть
                  </Btn>
                </div>
              </Card>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

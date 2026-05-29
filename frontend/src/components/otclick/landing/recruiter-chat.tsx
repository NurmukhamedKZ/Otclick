"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Btn, Card, Tag } from "@/components/otclick/ui";
import { ICheck, IList } from "@/components/otclick/icons";

/* scripted beats: HR message → AI typing → AI draft → todo */
const STEPS = 4;

export function RecruiterChat() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? STEPS : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setStep((s) => (s >= STEPS ? 1 : s + 1));
    }, 1700);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <Card tone="light" style={{ padding: 22, minHeight: 320 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* incoming HR */}
        {step >= 1 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "var(--bg-deep)",
              padding: "10px 14px",
              borderRadius: 14,
              fontSize: 13,
              alignSelf: "flex-start",
              maxWidth: "85%",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>
              Анна · Яндекс
            </div>
            Созвон в четверг 15:00?
          </motion.div>
        )}

        {/* AI thinking */}
        <AnimatePresence>
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                alignSelf: "flex-end",
                background: "var(--yellow-soft)",
                borderRadius: 14,
                padding: "10px 14px",
                display: "flex",
                gap: 4,
              }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                  style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ink)" }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI draft */}
        {step >= 3 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            style={{
              background: "var(--yellow)",
              padding: "10px 14px",
              borderRadius: 14,
              fontSize: 13,
              alignSelf: "flex-end",
              maxWidth: "85%",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>✨ otclick предлагает</div>
            Подходит. Скиньте ссылку — добавлю в календарь.
          </motion.div>
        )}

        {step >= 3 && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ display: "flex", gap: 6, marginTop: 2 }}
          >
            <Btn kind="primary" size="sm" icon={<ICheck size={12} />}>
              отправить
            </Btn>
            <Btn kind="ghost" size="sm">
              переписать
            </Btn>
          </motion.div>
        )}

        {/* todo created */}
        {step >= 4 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
            style={{
              marginTop: 6,
              padding: 12,
              background: "var(--bg-deep)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <IList size={16} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>Созвон · Яндекс</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>чт, 15:00 · в задачах</div>
            </div>
            <Tag tone="coral" dot>
              план
            </Tag>
          </motion.div>
        )}
      </div>
    </Card>
  );
}

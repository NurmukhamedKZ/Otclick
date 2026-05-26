"use client";

import { ButtonHTMLAttributes, CSSProperties, ReactNode, forwardRef } from "react";

// ============ Card ============
export type CardTone = "light" | "dark" | "cream";

const CARD_BASE: CSSProperties = { borderRadius: 22, padding: 22, position: "relative" };
const CARD_TONE: Record<CardTone, CSSProperties> = {
  light: { background: "var(--surface)", color: "var(--ink)" },
  dark: { background: "var(--ink)", color: "#F5F1E6" },
  cream: { background: "var(--bg-deep)", color: "var(--ink)" },
};

export function Card({
  tone = "light",
  style,
  children,
  className,
  ...rest
}: {
  tone?: CardTone;
  style?: CSSProperties;
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} style={{ ...CARD_BASE, ...CARD_TONE[tone], ...style }} {...rest}>
      {children}
    </div>
  );
}

// ============ Btn ============
export type BtnKind =
  | "primary"
  | "yellow"
  | "coral"
  | "ghost"
  | "ghostDark"
  | "soft"
  | "white";
export type BtnSize = "sm" | "md" | "lg";

const KIND: Record<BtnKind, CSSProperties> = {
  primary: { background: "var(--ink)", color: "#fff", border: "1px solid var(--ink)" },
  yellow: { background: "var(--yellow)", color: "var(--ink)", border: "1px solid var(--yellow)" },
  coral: { background: "var(--coral)", color: "#fff", border: "1px solid var(--coral)" },
  ghost: { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" },
  ghostDark: { background: "transparent", color: "#F5F1E6", border: "1px solid #ffffff22" },
  soft: { background: "var(--bg-deep)", color: "var(--ink)", border: "1px solid transparent" },
  white: { background: "#fff", color: "var(--ink)", border: "1px solid var(--line)" },
};

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: BtnKind;
  size?: BtnSize;
  icon?: ReactNode;
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { kind = "ghost", size = "md", icon, children, style, ...rest },
  ref,
) {
  const pad = size === "sm" ? "7px 12px" : size === "lg" ? "14px 22px" : "10px 16px";
  const fs = size === "sm" ? 13 : size === "lg" ? 15 : 14;
  return (
    <button
      ref={ref}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: pad,
        borderRadius: 999,
        fontSize: fs,
        fontWeight: 600,
        lineHeight: 1,
        cursor: "pointer",
        transition: "transform .15s ease, opacity .15s ease",
        ...KIND[kind],
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

// ============ Tag ============
export type TagTone = "neutral" | "ok" | "warn" | "err" | "yellow" | "coral" | "dark";

const TAG: Record<TagTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: "#F1ECE1", fg: "var(--ink)", dot: "var(--muted)" },
  ok: { bg: "#E2EEDB", fg: "#2F5C36", dot: "var(--ok)" },
  warn: { bg: "#FBEACB", fg: "#7A5418", dot: "var(--warn)" },
  err: { bg: "#F8D9D2", fg: "#7C2A1E", dot: "var(--err)" },
  yellow: { bg: "var(--yellow)", fg: "var(--ink)", dot: "var(--ink)" },
  coral: { bg: "var(--coral-soft)", fg: "#7C2A1E", dot: "var(--coral)" },
  dark: { bg: "var(--ink)", fg: "#F5F1E6", dot: "var(--yellow)" },
};

export function Tag({
  tone = "neutral",
  dot,
  children,
  style,
}: {
  tone?: TagTone;
  dot?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const p = TAG[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: p.bg,
        color: p.fg,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: 999, background: p.dot, flexShrink: 0 }}
        />
      )}
      {children}
    </span>
  );
}

// ============ StatusDot ============
export type StatusTone = "ok" | "warn" | "err" | "muted";

export function StatusDot({
  tone = "ok",
  size = 8,
  glow = true,
}: {
  tone?: StatusTone;
  size?: number;
  glow?: boolean;
}) {
  const c =
    tone === "ok"
      ? "var(--ok)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "err"
          ? "var(--err)"
          : "var(--muted-2)";
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        background: c,
        boxShadow: glow ? `0 0 0 3px ${c}22` : "none",
        flexShrink: 0,
      }}
    />
  );
}

// ============ Toggle ============
export function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange?.(!on)}
      disabled={disabled}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        position: "relative",
        background: on ? "var(--ink)" : "var(--muted-2)",
        transition: "background .2s",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left .2s",
        }}
      />
    </button>
  );
}

// ============ Field (read-only-ish) ============
export function Field({
  label,
  value,
  mono,
  readonly,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  readonly?: boolean;
}) {
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
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          background: readonly ? "var(--bg-deep)" : "transparent",
          border: readonly ? "none" : "1px solid var(--line)",
          fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
          fontSize: 14,
          color: readonly ? "var(--muted)" : "var(--ink)",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

// ============ TextInput / TextArea (editable) ============
export function TextInput({
  label,
  ...rest
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label && (
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
      )}
      <input
        {...rest}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "#fff",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 14,
          color: "var(--ink)",
          ...rest.style,
        }}
      />
    </label>
  );
}

export function Select({
  label,
  children,
  ...rest
}: { label?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label && (
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
      )}
      <select
        {...rest}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "#fff",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 14,
          color: "var(--ink)",
          ...rest.style,
        }}
      >
        {children}
      </select>
    </label>
  );
}

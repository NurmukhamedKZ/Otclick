"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { Btn, Card, Tag } from "@/components/otclick/ui";
import { IBolt, ICheck } from "@/components/otclick/icons";
import type { BillingStatus, SubscribeParams } from "@/lib/types";
import { pushToast } from "@/components/toaster";

const CP_SCRIPT = "https://widget.cloudpayments.ru/bundles/cloudpayments.js";

type CPWidget = {
  pay: (
    type: "auth" | "charge",
    options: Record<string, unknown>,
    callbacks: {
      onSuccess?: () => void;
      onFail?: (reason: string) => void;
      onComplete?: () => void;
    },
  ) => void;
};

declare global {
  interface Window {
    cp?: { CloudPayments: new () => CPWidget };
  }
}

function loadWidgetScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.cp) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CP_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("widget load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = CP_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("widget load failed"));
    document.head.appendChild(s);
  });
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("ru-RU") : "—";
}

const PERKS = [
  "150 откликов / день",
  "∞ фильтров",
  "AI-сопроводительные",
  "антибан + обход капчи",
  "realtime уведомления",
  "приоритетная поддержка",
];

export default function BillingPage() {
  const supabase = createClient();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await apiFetch<BillingStatus>("/api/billing/status"));
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : "status failed" });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    loadStatus();
  }, [supabase, loadStatus]);

  async function subscribe() {
    setBusy(true);
    try {
      const p = await apiFetch<SubscribeParams>("/api/billing/subscribe", { method: "POST" });
      await loadWidgetScript();
      if (!window.cp) throw new Error("CloudPayments widget unavailable");
      const widget = new window.cp.CloudPayments();
      widget.pay(
        "charge",
        {
          publicId: p.public_id,
          description: p.description,
          amount: p.amount,
          currency: p.currency,
          accountId: p.account_id,
          invoiceId: p.invoice_id,
          email: email ?? undefined,
          data: {
            CloudPayments: {
              recurrent: { interval: p.interval, period: p.period },
            },
          },
        },
        {
          onSuccess: () => {
            pushToast({ kind: "success", title: "платёж принят" });
            setTimeout(loadStatus, 3000);
            setTimeout(loadStatus, 10000);
          },
          onFail: (reason) => pushToast({ kind: "error", title: `платёж не прошёл: ${reason}` }),
          onComplete: () => setBusy(false),
        },
      );
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : "subscribe failed" });
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Отменить подписку? Доступ сохранится до конца оплаченного периода.")) return;
    try {
      await apiFetch("/api/billing/cancel", { method: "POST" });
      await loadStatus();
      pushToast({ kind: "info", title: "подписка отменена" });
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : "cancel failed" });
    }
  }

  const plan = status?.plan ?? "…";
  const isActive = plan === "active";

  return (
    <>
      {status && !status.has_access && (
        <div
          style={{
            background: "var(--coral-soft, #fde2dd)",
            color: "var(--ink)",
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 18,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ⚠ Доступ неактивен — trial закончился или нет подписки. Worker не запустится, пока не оформите тариф.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginBottom: 18 }}>
        <Card tone="dark">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div>
              <div className="serif" style={{ fontSize: 14, color: "var(--yellow)" }}>
                otclick pro
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>999 ₽ / мес</div>
            </div>
            <Tag tone={isActive ? "ok" : "neutral"} dot>
              {isActive ? "активна" : "не активна"}
            </Tag>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PERKS.map((p) => (
              <div
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#F5F1E6",
                }}
              >
                <ICheck size={14} stroke="var(--yellow)" />
                {p}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isActive ? (
              <Btn kind="coral" size="md" onClick={cancel}>
                отменить подписку
              </Btn>
            ) : (
              <Btn kind="yellow" size="md" icon={<IBolt size={14} />} onClick={subscribe} disabled={busy}>
                {busy ? "открываем…" : "оформить"}
              </Btn>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Статус</div>
          <Row k="план" v={plan} />
          {status?.trial_ends && <Row k="trial до" v={fmtDate(status.trial_ends)} />}
          {status?.plan_expires_at && (
            <Row k="действует до" v={fmtDate(status.plan_expires_at)} />
          )}
          {status?.next_charge_at && (
            <Row k="следующее списание" v={fmtDate(status.next_charge_at)} />
          )}
        </Card>
      </div>

      <Card>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>История платежей</div>
        {!status ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>загрузка…</p>
        ) : status.history.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>платежей пока нет</p>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 120px",
                gap: 14,
                padding: "8px 0",
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              <div>дата</div>
              <div>сумма</div>
              <div>статус</div>
            </div>
            {status.history.map((p) => (
              <div
                key={p.provider_payment_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 120px",
                  gap: 14,
                  padding: "12px 0",
                  fontSize: 13,
                  borderBottom: "1px solid var(--line-2)",
                }}
              >
                <div>{fmtDate(p.created_at)}</div>
                <div className="mono">{p.amount ?? "—"} ₽</div>
                <div>{p.status}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );
}

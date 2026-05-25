"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BillingStatus, SubscribeParams } from "@/lib/types";

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
  return s ? new Date(s).toLocaleDateString() : "—";
}

export default function BillingPage() {
  const supabase = createClient();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await apiFetch<BillingStatus>("/api/billing/status"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "status failed");
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    loadStatus();
  }, [supabase, loadStatus]);

  async function subscribe() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const p = await apiFetch<SubscribeParams>("/api/billing/subscribe", {
        method: "POST",
      });
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
            setMsg("Платёж принят. Подписка активируется в течение минуты.");
            // Activation lands via webhook; re-poll a couple of times.
            setTimeout(loadStatus, 3000);
            setTimeout(loadStatus, 10000);
          },
          onFail: (reason) => setErr(`Платёж не прошёл: ${reason}`),
          onComplete: () => setBusy(false),
        },
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "subscribe failed");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Отменить подписку? Доступ сохранится до конца оплаченного периода.")) return;
    try {
      await apiFetch("/api/billing/cancel", { method: "POST" });
      await loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "cancel failed");
    }
  }

  const plan = status?.plan ?? "…";
  const isActive = plan === "active";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Биллинг</h1>
        <p className="text-sm text-gray-500">Тариф {plan}</p>
      </header>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}

      <Card>
        <CardHeader title="Подписка" />
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">Статус</dt>
          <dd className={isActive ? "font-medium text-green-700" : ""}>{plan}</dd>
          {status?.trial_ends && (
            <>
              <dt className="text-gray-500">Trial до</dt>
              <dd>{fmtDate(status.trial_ends)}</dd>
            </>
          )}
          {status?.plan_expires_at && (
            <>
              <dt className="text-gray-500">Действует до</dt>
              <dd>{fmtDate(status.plan_expires_at)}</dd>
            </>
          )}
          {status?.next_charge_at && (
            <>
              <dt className="text-gray-500">Следующее списание</dt>
              <dd>{fmtDate(status.next_charge_at)}</dd>
            </>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {isActive ? (
            <Button variant="danger" size="sm" onClick={cancel}>
              Отменить подписку
            </Button>
          ) : (
            <Button variant="primary" onClick={subscribe} disabled={busy}>
              {busy ? "Открываем…" : "Подписаться — 999 ₽/мес"}
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="История платежей" />
        {!status ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : status.history.length === 0 ? (
          <p className="text-sm text-gray-500">Платежей пока нет.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 font-medium">Дата</th>
                <th className="py-1 font-medium">Сумма</th>
                <th className="py-1 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {status.history.map((p) => (
                <tr key={p.provider_payment_id} className="border-t border-gray-100">
                  <td className="py-1.5">{fmtDate(p.created_at)}</td>
                  <td className="py-1.5">{p.amount ?? "—"} ₽</td>
                  <td className="py-1.5">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

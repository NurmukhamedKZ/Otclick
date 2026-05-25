"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tab = "profile" | "plan" | "integrations" | "danger";

type HHStatus = {
  connected: boolean;
  expires_at: string | null;
  last_refreshed_at: string | null;
  hh_user_id: string | null;
};

export default function AccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hh, setHH] = useState<HHStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    })();
    apiFetch<HHStatus>("/api/hh/status")
      .then(setHH)
      .catch((e) => setErr(e instanceof Error ? e.message : "hh status failed"));
  }, [supabase]);

  async function disconnectHH() {
    if (!confirm("Отключить hh аккаунт? Воркер остановится.")) return;
    try {
      await apiFetch("/api/hh/disconnect", { method: "POST" });
      const next = await apiFetch<HHStatus>("/api/hh/status");
      setHH(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "disconnect failed");
    }
  }

  async function refreshHH() {
    try {
      await apiFetch("/api/hh/refresh", { method: "POST" });
      const next = await apiFetch<HHStatus>("/api/hh/status");
      setHH(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "refresh failed");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "profile", label: "Профиль" },
    { key: "plan", label: "Тариф" },
    { key: "integrations", label: "Интеграции" },
    { key: "danger", label: "Опасная зона" },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Аккаунт</h1>
        <p className="text-sm text-gray-500">{email ?? userId ?? "…"}</p>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 ${
              tab === t.key
                ? "border-gray-900 font-medium text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <p className="text-sm text-red-600">{err}</p>
      )}

      {tab === "profile" && (
        <Card>
          <CardHeader title="Профиль" />
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-gray-500">Email</dt>
            <dd>{email ?? "—"}</dd>
            <dt className="text-gray-500">User ID</dt>
            <dd className="font-mono text-xs text-gray-600">{userId ?? "—"}</dd>
          </dl>
          <p className="mt-4 text-xs text-gray-500">
            Изменение email/пароля — пока через Supabase напрямую (раннее MVP).
          </p>
        </Card>
      )}

      {tab === "plan" && (
        <Card>
          <CardHeader title="Тариф" />
          <p className="text-sm text-gray-700">
            Управление подпиской и история платежей — на странице биллинга.
          </p>
          <Link href="/billing">
            <Button variant="primary" className="mt-3">
              Перейти к биллингу
            </Button>
          </Link>
        </Card>
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="hh аккаунт" />
            {!hh ? (
              <p className="text-sm text-gray-500">Загрузка…</p>
            ) : hh.connected ? (
              <div className="space-y-2 text-sm">
                <p>
                  Статус:{" "}
                  <span className="font-medium text-green-700">подключён</span>
                </p>
                {hh.hh_user_id && (
                  <p className="text-gray-600">hh user id: {hh.hh_user_id}</p>
                )}
                {hh.expires_at && (
                  <p className="text-gray-600">
                    refresh expires:{" "}
                    {new Date(hh.expires_at).toLocaleString()}
                  </p>
                )}
                {hh.last_refreshed_at && (
                  <p className="text-gray-600">
                    last refresh:{" "}
                    {new Date(hh.last_refreshed_at).toLocaleString()}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={refreshHH} size="sm">
                    Обновить токен
                  </Button>
                  <Link href="/onboarding">
                    <Button size="sm">Переподключить</Button>
                  </Link>
                  <Button onClick={disconnectHH} variant="danger" size="sm">
                    Отключить
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">hh не подключён.</p>
                <Link href="/onboarding">
                  <Button variant="primary" size="sm">
                    Подключить
                  </Button>
                </Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Telegram уведомления" />
            <p className="text-sm text-gray-700">
              TG-бот для пушей — v2 плана.
            </p>
            <Button className="mt-3" disabled>
              Привязать TG (скоро)
            </Button>
          </Card>
        </div>
      )}

      {tab === "danger" && (
        <Card>
          <CardHeader title="Опасная зона" />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium">Выйти</p>
                <p className="text-xs text-gray-500">
                  Завершить текущую сессию.
                </p>
              </div>
              <Button onClick={signOut} variant="secondary" size="sm">
                Выйти
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-3">
              <div>
                <p className="text-sm font-medium text-red-800">Удалить аккаунт</p>
                <p className="text-xs text-red-700">
                  Cascade: токены, отклики, фильтры — всё. Необратимо.
                </p>
              </div>
              <Button variant="danger" size="sm" disabled>
                Удалить (скоро)
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

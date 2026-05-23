"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useHHConnect } from "@/hooks/useHHConnect";

type HHStatus = {
  connected: boolean;
  expires_at: string | null;
  last_refreshed_at: string | null;
  hh_user_id: string | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const {
    phase,
    screenshotUrl,
    error,
    submitting,
    start,
    submitCaptcha,
    reset,
  } = useHHConnect();

  const [statusLoading, setStatusLoading] = useState(true);
  const [hhStatus, setHhStatus] = useState<HHStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [solution, setSolution] = useState("");

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusErr(null);
    try {
      const data = await apiFetch<HHStatus>("/api/hh/status");
      setHhStatus(data);
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : "status check failed");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (phase === "success") {
      const t = setTimeout(() => router.push("/dashboard"), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, router]);

  const disconnect = async () => {
    try {
      await apiFetch("/api/hh/disconnect", { method: "POST" });
      reset();
      await loadStatus();
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : "disconnect failed");
    }
  };

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">Подключить hh аккаунт</h1>

      {statusLoading && <p className="text-gray-500">Проверка статуса...</p>}
      {statusErr && (
        <p className="text-red-600 text-sm mb-4">{statusErr}</p>
      )}

      {!statusLoading && hhStatus?.connected && phase !== "success" && (
        <div className="mb-6 rounded border border-green-300 bg-green-50 p-4">
          <p className="font-semibold text-green-800">Уже подключён</p>
          {hhStatus.expires_at && (
            <p className="text-sm text-gray-600">
              token expires: {new Date(hhStatus.expires_at).toLocaleString()}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded bg-black text-white px-4 py-2 text-sm"
            >
              На дашборд
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="rounded border px-4 py-2 text-sm"
            >
              Отключить
            </button>
          </div>
        </div>
      )}

      {!statusLoading && !hhStatus?.connected && phase === "idle" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(username, password);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm mb-1">Логин hh (email/телефон)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full border rounded px-3 py-2"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2"
              autoComplete="current-password"
            />
          </div>
          <p className="text-xs text-gray-500">
            Пароль используется один раз для логина. Не сохраняем.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-black text-white py-2 disabled:opacity-50"
          >
            {submitting ? "Запуск..." : "Подключить"}
          </button>
        </form>
      )}

      {phase === "running" && (
        <div className="rounded border p-4">
          <p className="font-medium">Логинимся в hh...</p>
          <p className="text-sm text-gray-500 mt-1">
            Playwright крутится на бэке. ~10-30 секунд.
          </p>
        </div>
      )}

      {phase === "captcha_required" && (
        <div className="rounded border border-yellow-300 bg-yellow-50 p-4">
          <p className="font-medium mb-2">Капча 🤖</p>
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt="captcha"
              className="mb-3 max-w-full border rounded"
            />
          ) : (
            <p className="text-sm text-gray-500">Скриншот грузится...</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitCaptcha(solution);
              setSolution("");
            }}
            className="space-y-2"
          >
            <input
              type="text"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              required
              autoFocus
              className="w-full border rounded px-3 py-2"
              placeholder="Введите символы с картинки"
            />
            <button
              type="submit"
              disabled={submitting || !solution}
              className="w-full rounded bg-black text-white py-2 disabled:opacity-50"
            >
              Отправить
            </button>
          </form>
        </div>
      )}

      {phase === "success" && (
        <div className="rounded border border-green-300 bg-green-50 p-4">
          <p className="font-semibold text-green-800">Подключено ✓</p>
          <p className="text-sm text-gray-600">Перенаправление на дашборд...</p>
        </div>
      )}

      {phase === "failed" && (
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800 mb-1">Ошибка</p>
          <p className="text-sm text-gray-700 mb-3">{error ?? "unknown"}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded border px-4 py-2 text-sm"
          >
            Попробовать снова
          </button>
        </div>
      )}
    </main>
  );
}

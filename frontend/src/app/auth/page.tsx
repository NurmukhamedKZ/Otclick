"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setErr(error.message);
      router.push("/dashboard");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) return setErr(error.message);
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMsg("Проверь почту — отправлена ссылка подтверждения.");
      }
    }
  }

  async function google() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  const isLogin = mode === "login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <Link
          href="/"
          className="mb-6 block text-xs text-gray-500 hover:text-gray-900"
        >
          ← на главную
        </Link>

        <div className="mb-5 flex rounded-md border border-gray-200 p-0.5 text-sm">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded py-1.5 transition-colors ${
              isLogin ? "bg-gray-900 text-white" : "text-gray-600"
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded py-1.5 transition-colors ${
              !isLogin ? "bg-gray-900 text-white" : "text-gray-600"
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="email"
            autoComplete="email"
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={isLogin ? undefined : 6}
            placeholder={isLogin ? "пароль" : "пароль (мин 6)"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "…" : isLogin ? "Войти" : "Создать аккаунт"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          или
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <Button onClick={google} variant="secondary" className="w-full">
          Продолжить с Google
        </Button>

        {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </div>
    </main>
  );
}

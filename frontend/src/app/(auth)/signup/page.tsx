"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setMsg("Проверь почту — отправлена ссылка подтверждения.");
    }
  }

  async function onGoogle() {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">Регистрация</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="email"
          className="border px-3 py-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="пароль (мин 6)"
          className="border px-3 py-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white py-2 rounded disabled:opacity-50"
        >
          {loading ? "..." : "Создать"}
        </button>
      </form>
      <button
        onClick={onGoogle}
        className="mt-3 w-full border border-black py-2 rounded"
      >
        Google
      </button>
      {msg && <p className="text-green-700 mt-3 text-sm">{msg}</p>}
      {err && <p className="text-red-600 mt-3 text-sm">{err}</p>}
      <p className="mt-6 text-sm">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="underline">
          Вход
        </Link>
      </p>
    </main>
  );
}

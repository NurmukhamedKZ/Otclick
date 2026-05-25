"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import type { CaptchaRequest } from "@/lib/types";

const SCREENSHOT_BUCKET = "captcha-screenshots";

export default function CaptchaModal() {
  const [pending, setPending] = useState<CaptchaRequest | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshImage(row: CaptchaRequest) {
      if (!row.storage_path) {
        setImageUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(row.storage_path, 300);
      if (cancelled) return;
      setImageUrl(data?.signedUrl ?? null);
    }

    async function loadPending(userId: string) {
      const { data, error } = await supabase
        .from("captcha_requests")
        .select("*")
        .eq("user_id", userId)
        .eq("solved", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error || cancelled) return;
      const row = (data?.[0] ?? null) as CaptchaRequest | null;
      setPending(row);
      if (row) refreshImage(row);
      else setImageUrl(null);
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      await loadPending(user.id);

      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel("captcha-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "captcha_requests", filter },
          (payload) => {
            const row = payload.new as CaptchaRequest;
            if (!row.solved) {
              setPending(row);
              refreshImage(row);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "captcha_requests", filter },
          (payload) => {
            const row = payload.new as CaptchaRequest;
            setPending((prev) => {
              if (!prev || prev.id !== row.id) return prev;
              if (row.solved) {
                setImageUrl(null);
                return null;
              }
              return row;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function handleSolve() {
    if (!pending) return;
    try {
      await apiFetch(`/api/captcha/${pending.id}/solve`, { method: "POST" });
    } catch {
      /* re-check is best-effort; the 5s auto-poll will still fire */
    }
  }

  async function handleDismiss() {
    const id = pending?.id;
    setPending(null);
    setImageUrl(null);
    if (!id) return;
    try {
      await apiFetch(`/api/captcha/${id}/dismiss`, { method: "POST" });
    } catch {
      /* worker stop is best-effort */
    }
  }

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">Капча на hh</h2>
        <p className="mb-3 text-sm text-gray-700">
          hh попросил подтвердить, что ты человек. Открой ссылку, реши капчу — worker сам подхватит.
        </p>

        {imageUrl && (
          <img
            src={imageUrl}
            alt="captcha screenshot"
            className="mb-3 max-h-64 w-full rounded border border-gray-200 object-contain"
          />
        )}

        <div className="flex flex-col gap-2">
          {pending.captcha_url && (
            <a
              href={pending.captcha_url}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-black px-3 py-2 text-center text-sm text-white hover:bg-gray-800"
            >
              Открыть на hh
            </a>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSolve}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Я решил, проверить
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Закрыть
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Создано: {new Date(pending.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

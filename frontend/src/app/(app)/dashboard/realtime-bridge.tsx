"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushToast, type ToastKind } from "@/components/toaster";
import type { NotificationRow } from "@/lib/types";

const TYPE_KIND: Record<string, ToastKind> = {
  apply_success: "success",
  captcha: "warning",
  limit_reached: "warning",
  worker_stop: "info",
  token_dead: "error",
  account_banned: "error",
  resume_missing: "error",
};

const TYPE_TITLE: Record<string, string> = {
  apply_success: "Отклик отправлен",
  captcha: "Нужна капча на hh",
  limit_reached: "Достигнут дневной лимит",
  worker_stop: "Worker остановлен",
  token_dead: "Токен hh умер — переподключи аккаунт",
  account_banned: "Аккаунт hh заблокирован",
  resume_missing: "Резюме недоступно",
};

function formatBody(n: NotificationRow): string | undefined {
  if (!n.payload) return undefined;
  try {
    const parts = Object.entries(n.payload).map(([k, v]) => `${k}: ${String(v)}`);
    return parts.slice(0, 3).join(" · ");
  } catch {
    return undefined;
  }
}

export default function RealtimeBridge() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel("notifications-toast")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter },
          (payload) => {
            const n = payload.new as NotificationRow;
            pushToast({
              kind: TYPE_KIND[n.type] ?? "info",
              title: TYPE_TITLE[n.type] ?? n.type,
              body: formatBody(n),
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

  return null;
}

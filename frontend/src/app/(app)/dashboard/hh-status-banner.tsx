"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type HHStatus = {
  connected: boolean;
  expires_at: string | null;
};

export default function HHStatusBanner() {
  const [status, setStatus] = useState<HHStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HHStatus>("/api/hh/status")
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "status failed"));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <AlertTriangle size={16} />
        hh status: {error}
      </div>
    );
  }
  if (!status) {
    return <div className="h-12 animate-pulse rounded-lg bg-gray-100" />;
  }

  if (!status.connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <div className="flex items-center gap-2 text-sm text-yellow-900">
          <AlertTriangle size={16} />
          hh аккаунт не подключён. Без этого worker не работает.
        </div>
        <Link href="/onboarding">
          <Button variant="primary" size="sm">
            Подключить
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
      <CheckCircle2 size={16} />
      hh подключён
      {status.expires_at && (
        <span className="text-gray-600">
          · refresh expires {new Date(status.expires_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

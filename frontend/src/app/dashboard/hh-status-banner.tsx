"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
      <p className="mb-4 text-sm text-red-600">hh status: {error}</p>
    );
  }
  if (!status) return null;

  if (!status.connected) {
    return (
      <div className="mb-6 rounded border border-yellow-300 bg-yellow-50 p-4 flex items-center justify-between">
        <span className="text-sm">hh аккаунт не подключён.</span>
        <Link
          href="/onboarding"
          className="rounded bg-black text-white px-3 py-1.5 text-sm"
        >
          Подключить
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded border border-green-300 bg-green-50 p-4 text-sm">
      hh подключён
      {status.expires_at && (
        <span className="text-gray-600">
          {" "}
          · expires {new Date(status.expires_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

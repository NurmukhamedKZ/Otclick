"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { openFiltersDrawer } from "@/components/filters-drawer";
import { LogOut, Menu, SlidersHorizontal, X } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Дашборд" },
  { href: "/applications", label: "Отклики" },
  { href: "/billing", label: "Биллинг" },
  { href: "/account", label: "Аккаунт" },
];

export default function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-bold tracking-tight">
            AI Autoclicker
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openFiltersDrawer}
            className="hidden items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 sm:inline-flex"
            title="Фильтры поиска"
          >
            <SlidersHorizontal size={14} />
            Фильтры
          </button>
          {email && (
            <span className="hidden max-w-[14ch] truncate text-xs text-gray-500 sm:inline">
              {email}
            </span>
          )}
          <button
            onClick={signOut}
            className="hidden items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1.5 text-xs hover:bg-gray-50 sm:inline-flex"
          >
            <LogOut size={13} />
            Выйти
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-gray-300 p-1.5 sm:hidden"
            aria-label="menu"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-gray-200 bg-white px-4 py-2 sm:hidden">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`block rounded px-3 py-2 text-sm ${
                  active ? "bg-gray-900 text-white" : "text-gray-700"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={() => {
              setOpen(false);
              openFiltersDrawer();
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700"
          >
            Фильтры
          </button>
          <button
            onClick={signOut}
            className="block w-full rounded px-3 py-2 text-left text-sm text-red-700"
          >
            Выйти
          </button>
        </nav>
      )}
    </header>
  );
}

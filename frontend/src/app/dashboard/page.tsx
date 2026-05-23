import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import HHStatusBanner from "./hh-status-banner";
import ResumesCard from "./resumes-card";
import WorkerCard from "./worker-card";
import NotificationsCard from "./notifications-card";
import DebugCard from "./debug-card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-600">{user?.email ?? user?.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/filters"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Фильтры
          </Link>
          <SignOutButton />
        </div>
      </header>

      <HHStatusBanner />
      <ResumesCard />
      <WorkerCard />
      <NotificationsCard />
      <DebugCard />
    </main>
  );
}

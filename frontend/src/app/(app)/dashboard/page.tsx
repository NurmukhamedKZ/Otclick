import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SlidersHorizontal } from "lucide-react";
import HHStatusBanner from "./hh-status-banner";
import ResumesCard from "./resumes-card";
import NotificationsCard from "./notifications-card";
import RecentApplicationsCard from "./recent-applications-card";
import FiltersTriggerButton from "./filters-trigger-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
        <p className="text-sm text-gray-500">{user?.email ?? user?.id}</p>
      </header>

      <HHStatusBanner />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ResumesCard />
        <Card>
          <CardHeader title="Быстрые действия" />
          <div className="flex flex-wrap gap-2">
            <FiltersTriggerButton>
              <SlidersHorizontal size={14} />
              Фильтры
            </FiltersTriggerButton>
            <Link href="/applications">
              <Button variant="secondary">Все отклики →</Button>
            </Link>
            <Link href="/account">
              <Button variant="secondary">Аккаунт →</Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Нажми «Старт» в верхней панели — worker начнёт обходить твои фильтры
            и отправлять отклики с AI-сопроводительными.
          </p>
        </Card>
      </div>

      <RecentApplicationsCard />
      <NotificationsCard />
    </div>
  );
}

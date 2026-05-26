import { createClient } from "@/lib/supabase/server";
import Topbar from "@/components/otclick/topbar";
import HHBanner from "@/components/otclick/hh-banner";
import TodayResultsCard from "./today-results-card";
import ActivityCalendar from "./activity-calendar";
import LimitRing from "./limit-ring";
import WeeklyPlan from "./weekly-plan";
import QuickActions from "./quick-actions";
import RecentApplicationsCard from "./recent-applications-card";
import ResumesCard from "./resumes-card";
import NotificationsCard from "./notifications-card";

function greetingFor(email: string | null): string {
  const name = email ? email.split("@")[0].split(/[._-]/)[0] : "там";
  return `Привет, ${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Topbar
        greeting={greetingFor(user?.email ?? null)}
        subtitle="Посмотрим, что бот сделал за тебя сегодня"
      />
      <HHBanner />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <TodayResultsCard />
        <ActivityCalendar />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          marginTop: 18,
        }}
      >
        <LimitRing />
        <WeeklyPlan />
        <QuickActions />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)",
          gap: 18,
          marginTop: 18,
        }}
      >
        <RecentApplicationsCard />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ResumesCard />
          <NotificationsCard />
        </div>
      </div>
    </>
  );
}

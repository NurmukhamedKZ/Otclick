import HHBanner from "@/components/otclick/hh-banner";
import LimitRing from "./limit-ring";
import WeeklyPlan from "./weekly-plan";
import QuickActions from "./quick-actions";
import RecentApplicationsCard from "./recent-applications-card";
import ResumesCard from "./resumes-card";
import NotificationsCard from "./notifications-card";

export default async function DashboardPage() {
  return (
    <>
      <HHBanner />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
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

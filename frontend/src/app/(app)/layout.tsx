import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Providers } from "@/lib/providers";
import AppNav from "@/components/app-nav";
import WorkerStatusBar from "@/components/worker-status-bar";
import FiltersDrawer from "@/components/filters-drawer";
import CaptchaModal from "@/components/captcha-modal";
import Toaster from "@/components/toaster";
import RealtimeBridge from "@/app/(app)/dashboard/realtime-bridge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return (
    <Providers>
      <div className="min-h-screen bg-gray-50">
        <AppNav email={user.email ?? null} />
        <WorkerStatusBar />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <FiltersDrawer />
        <CaptchaModal />
        <RealtimeBridge />
        <Toaster />
      </div>
    </Providers>
  );
}

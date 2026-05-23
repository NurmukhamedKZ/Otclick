import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="mb-6 text-gray-700">Вошёл как: {user?.email ?? user?.id}</p>
      <p className="mb-8 text-sm text-gray-500">
        TODO: connect hh, filters, applications.
      </p>
      <SignOutButton />

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-gray-500">
          debug: access token
        </summary>
        <pre className="mt-2 p-3 bg-gray-100 text-xs break-all whitespace-pre-wrap rounded">
          {session?.access_token}
        </pre>
      </details>
    </main>
  );
}

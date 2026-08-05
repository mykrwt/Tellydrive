import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { userOverview } from "@/lib/services/stats";
import { getPlan } from "@/lib/services/users";
import { formatBytes } from "@/lib/config";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) {
    const { userId } = await auth();
    // Genuinely signed out — send them to Clerk's sign-in page.
    if (!userId) redirect("/sign-in");
    // A Clerk session exists but the app account couldn't be resolved.
    // Bouncing through /sign-in here would make Clerk redirect the signed-in
    // user back to the home page, producing the "dashboard → homepage" loop.
    throw new Error(
      "Unable to load your account. Please sign out and sign in again.",
    );
  }

  const plan = getPlan(user.plan_id);
  const overview = userOverview(user.id);
  const percent = plan.storage_bytes
    ? (overview.storageUsedBytes / plan.storage_bytes) * 100
    : 0;

  return (
    <div className="dashboard-shell">
      <DashboardNav
        planName={plan.name}
        used={formatBytes(overview.storageUsedBytes)}
        limitLabel={formatBytes(plan.storage_bytes)}
        percent={percent}
        isAdmin={Boolean(user.is_admin)}
      />
      <section className="dashboard-content">{children}</section>
    </div>
  );
}

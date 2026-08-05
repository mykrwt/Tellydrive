import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@/lib/auth";
import { getOrCreateUser, getPlan, type UserRow } from "@/lib/services/users";
import { userOverview } from "@/lib/services/stats";
import { formatBytes } from "@/lib/config";
import { DashboardNav } from "@/components/dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: UserRow | null = await currentUser();

  if (!user) {
    let userId: string | null = null;
    try {
      const authObj = await auth();
      userId = authObj.userId;
    } catch {
      // Clerk is not configured or auth() threw
    }

    if (!userId) {
      redirect("/sign-in");
    }

    // A Clerk session exists: try getting or creating the user directly
    try {
      user = getOrCreateUser(userId);
    } catch {
      // Failed to get or create user from DB
    }
  }

  if (!user) {
    return (
      <div className="dashboard-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
        <div className="card" style={{ maxWidth: "480px", width: "100%", textAlign: "center", padding: "2.5rem 2rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚠️</div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.5rem" }}>Unable to load account</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
            We couldn&apos;t load your account details right now. Reload to try again or sign out.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <a href="/dashboard" className="button button-primary" style={{ textDecoration: "none" }}>
              Reload page
            </a>
            <SignOutButton>
              <button className="button button-quiet">Sign out</button>
            </SignOutButton>
          </div>
        </div>
      </div>
    );
  }

  if (user.is_suspended) {
    return (
      <div className="dashboard-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: "2rem" }}>
        <div className="card" style={{ maxWidth: "480px", width: "100%", textAlign: "center", padding: "2.5rem 2rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🚫</div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.5rem" }}>Account suspended</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
            Your account has been suspended by an administrator. Please contact support.
          </p>
          <SignOutButton>
            <button className="button button-quiet">Sign out</button>
          </SignOutButton>
        </div>
      </div>
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

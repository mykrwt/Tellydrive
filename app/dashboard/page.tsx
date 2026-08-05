import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth";
import { databaseMode } from "@/lib/telegram-store";

export const metadata = { title: "Dashboard" };

function formatDate(value: string | null) {
  if (!value) return "First session";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function DashboardPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/sign-in?error=store");
  }
  if (!user) redirect("/sign-in");
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav"><Logo /><SignOutButton /></nav>
      <section className="dashboard-shell">
        <div className="success-banner"><span>✓</span><div><strong>You&apos;re signed in</strong><p>Your secure session is active.</p></div></div>
        <div className="welcome-row">
          <div><p className="eyebrow">Private workspace</p><h1>Good to see you, {user.name.split(" ")[0]}.</h1><p>Your Tellybase account is ready to use.</p></div>
          <div className="avatar">{initials}</div>
        </div>
        <div className="dashboard-grid">
          <article className="profile-card">
            <div className="card-label"><span>Profile</span><span className="verified-pill">Verified session</span></div>
            <dl>
              <div><dt>Full name</dt><dd>{user.name}</dd></div>
              <div><dt>Email address</dt><dd>{user.email}</dd></div>
              <div><dt>Account created</dt><dd>{formatDate(user.createdAt)}</dd></div>
              <div><dt>Last sign in</dt><dd>{formatDate(user.lastLoginAt)}</dd></div>
            </dl>
          </article>
          <aside className="storage-card">
            <div className="telegram-badge"><svg viewBox="0 0 32 32"><path d="M25.7 7.2 21.9 25c-.3 1.3-1 1.6-2.1 1l-5.8-4.3-2.8 2.7c-.3.3-.6.6-1.2.6l.4-5.9L21.2 9.3c.5-.4-.1-.7-.7-.3L7.2 17.4l-5.7-1.8c-1.2-.4-1.3-1.2.3-1.8L24.1 5.2c1-.4 1.9.2 1.6 2Z" /></svg></div>
            <p className="eyebrow">Database</p><h2>{databaseMode() === "telegram" ? "Telegram connected" : "Local development"}</h2>
            <p>{databaseMode() === "telegram" ? "Your account record is persisted as a versioned JSON document in your private Telegram chat." : "Add the Telegram environment variables before deploying to production."}</p>
            <div className="connection-line"><span className="status-dot" />Operational</div>
          </aside>
        </div>
      </section>
    </main>
  );
}

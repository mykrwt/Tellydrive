import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth";
import { databaseMode, getFilesForUser, findUserById } from "@/lib/telegram-store";
import { StorageSection } from "@/components/storage-section";
import { TelegramSettings } from "@/components/telegram-settings";

export const metadata = { title: "Dashboard" };

function formatDate(value: string | null) {
  if (!value) return "First session";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function DashboardPage() {
  let safeUser;
  try {
    safeUser = await getCurrentUser();
  } catch {
    redirect("/sign-in?error=store");
  }
  if (!safeUser) redirect("/sign-in");

  // Fetch full user data including telegram settings
  const user = await findUserById(safeUser.id);
  if (!user) redirect("/sign-in");

  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const files = await getFilesForUser(user.id);

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
          
          <TelegramSettings initialToken={user.telegramToken} initialChatId={user.telegramChatId} />
          
          <StorageSection files={files} />
        </div>
      </section>
    </main>
  );
}

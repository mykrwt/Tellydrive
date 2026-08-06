import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth";
import { findUserById, getFilesForUser, isTelegramSetupEnabled } from "@/lib/telegram-store";
import { Gallery } from "@/components/gallery";
import { TelegramSettings } from "@/components/telegram-settings";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  let safeUser;
  try {
    safeUser = await getCurrentUser();
  } catch {
    redirect("/sign-in?error=store");
  }
  if (!safeUser) redirect("/sign-in");

  const user = await findUserById(safeUser.id);
  if (!user) redirect("/sign-in");

  const files = await getFilesForUser(user.id, { sortBy: "date", sortOrder: "desc", limit: 48 });
  // Only pass safe fields to client — never expose telegramFileId, tokens, or channel IDs
  const safeFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    chunked: f.chunked,
    chunkCount: f.chunkCount,
    folderId: f.folderId,
    favorite: f.favorite,
    width: f.width,
    height: f.height,
    duration: f.duration,
  }));
  const showTelegramSetup = isTelegramSetupEnabled();

  return (
    <main className="dashboard-page gallery-page">
      <nav className="dashboard-nav gallery-nav">
        <Logo />
        <div className="gallery-nav-center">
          <span className="gallery-title">Tellybase</span>
          <span className="gallery-subtitle">Photos & Files</span>
        </div>
        <div className="gallery-nav-actions">
          <span className="gallery-user">
            {user.name.split(" ")[0]}
          </span>
          <SignOutButton />
        </div>
      </nav>

      {/* Hidden feature-flagged Telegram setup — not visible by default */}
      {showTelegramSetup && (
        <div className="telegram-setup-flagged">
          <TelegramSettings initialToken={user.telegramToken} initialChatId={user.telegramChatId} />
        </div>
      )}

      <section className="gallery-shell">
        <Gallery initialFiles={safeFiles} />
      </section>
    </main>
  );
}

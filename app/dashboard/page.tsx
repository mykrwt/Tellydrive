import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { findUserById, getFilesForUser, isTelegramSetupEnabled } from "@/lib/telegram-store";
import { isAdminUser } from "@/lib/admin";
import { Gallery } from "@/components/gallery";
import { DashboardNav } from "@/components/dashboard-nav";
import { TelegramSettings } from "@/components/telegram-settings";

export const metadata = { title: "Gallery" };

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

  const files = await getFilesForUser(user.id, { sortBy: "date", sortOrder: "desc", limit: 500 });
  // Gallery only shows photos & videos — filter before slicing so the first
  // paint isn't empty just because recent uploads were documents
  const media = files
    .filter((f) => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"))
    .slice(0, 48);
  // Only pass safe fields to client — never expose telegramFileId, tokens, or channel IDs
  const safeFiles = media.map((f) => ({
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
      <DashboardNav userName={user.name} isAdmin={isAdminUser(user)} />

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

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { findUserById, getFilesForUser } from "@/lib/telegram-store";
import { isAdminUser } from "@/lib/admin";
import { Gallery } from "@/components/gallery";
import { DashboardChrome } from "@/components/dashboard-chrome";
import { getDashboardSummary } from "@/lib/dashboard-summary";

export const metadata = { title: "Gallery" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; mime?: string }>;
}) {
  let safeUser;
  try {
    safeUser = await getCurrentUser();
  } catch {
    redirect("/sign-in?error=store");
  }
  if (!safeUser) redirect("/sign-in");

  const params = await searchParams;
  const query = typeof params.search === "string" ? params.search.trim().slice(0, 120) : "";
  const mime = params.mime === "image" || params.mime === "video" ? params.mime : "all";

  const user = await findUserById(safeUser.id);
  if (!user) redirect("/sign-in");

  const [summary, initialResults] = await Promise.all([
    getDashboardSummary(user.id),
    getFilesForUser(user.id, {
      section: "gallery",
      search: query,
      mime,
      sortBy: "date",
      sortOrder: "desc",
      limit: 49,
    }),
  ]);

  const media = initialResults
    .filter((file) => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/"))
    .slice(0, 48);

  const safeFiles = media.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    chunked: file.chunked,
    chunkCount: file.chunkCount,
    folderId: file.folderId,
    favorite: file.favorite,
    width: file.width,
    height: file.height,
    duration: file.duration,
  }));
  return (
    <DashboardChrome
      user={{ name: user.name, email: user.email, isAdmin: isAdminUser(user) }}
      summary={summary}
    >
      <Gallery
        initialFiles={safeFiles}
        initialHasMore={initialResults.length > 48}
        initialQuery={query}
        initialMime={mime}
        summary={summary}
      />
    </DashboardChrome>
  );
}

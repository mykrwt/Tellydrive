import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { getAnnouncement, getLatestPublishedRelease } from "@/lib/telegram-store";
import { mobileJson } from "@/app/api/mobile/v1/_shared";

/**
 * Authenticated app-state endpoint: the currently published release and the
 * active announcement. Only safe, application-level values are returned —
 * storage identifiers and upstream URLs never leave the backend. The app
 * treats this as a hint and downloads the APK through the proxied endpoint.
 */
export async function GET() {
  try {
    await authorizeRequest("account:read");
    const [release, announcement] = await Promise.all([getLatestPublishedRelease(), getAnnouncement()]);
    return mobileJson({
      state: {
        release: release
          ? {
              versionName: release.versionName,
              versionCode: release.versionCode,
              notes: release.notes,
              publishedAt: release.publishedAt,
              size: release.size,
              fileName: release.fileName,
              downloadPath: "/api/mobile/v1/releases/latest/download",
            }
          : null,
        announcement: announcement
          ? {
              message: announcement.message,
              updatedAt: announcement.updatedAt,
            }
          : null,
      },
    });
  } catch (error) {
    const failure = authorityErrorPayload(error);
    return mobileJson(failure.body, { status: failure.status });
  }
}

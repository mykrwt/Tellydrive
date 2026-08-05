import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listAnnouncements, maintenanceMode } from "@/lib/services/admin";
import { listTrashSettings } from "@/lib/services/plans";
import { AdminContent } from "@/components/admin-content";

export default async function AdminContentPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.is_admin) redirect("/dashboard");

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ADMIN · CONTENT & SETTINGS</p>
          <h1>Announcements & config</h1>
          <p>Manage announcements, maintenance mode and platform configuration.</p>
        </div>
      </div>
      <AdminContent
        initialAnnouncements={listAnnouncements()}
        maintenance={maintenanceMode()}
        retention={listTrashSettings()}
      />
    </>
  );
}

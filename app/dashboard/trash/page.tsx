import { currentUser } from "@/lib/auth";
import { listTrashedFiles } from "@/lib/services/files";
import { listTrashedFolders } from "@/lib/services/folders";
import { listTrashSettings } from "@/lib/services/plans";
import { TrashManager } from "@/components/trash-manager";

export default async function TrashPage() {
  const user = await currentUser();
  if (!user) return null;
  const retention = listTrashSettings();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> RECYCLE BIN</p>
          <h1>Recover deleted files</h1>
          <p>Deleted files and folders stay here for {retention} days.</p>
        </div>
      </div>
      <TrashManager
        initialFiles={listTrashedFiles(user.id)}
        initialFolders={listTrashedFolders(user.id)}
      />
    </>
  );
}

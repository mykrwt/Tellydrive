import { currentUser } from "@/lib/auth";
import { buildFolderTree } from "@/lib/services/folders";
import { getPlan } from "@/lib/services/users";
import { userOverview } from "@/lib/services/stats";
import { UploadCenter } from "@/components/upload-center";

export default async function UploadPage() {
  const user = await currentUser();
  if (!user) return null;
  const plan = getPlan(user.plan_id);
  const overview = userOverview(user.id);

  const tree = buildFolderTree(user.id);
  const options: { id: number; name: string; path: string }[] = [];
  const walk = (nodes: typeof tree, prefix = "") => {
    for (const n of nodes) {
      const path = prefix ? `${prefix} / ${n.name}` : n.name;
      options.push({ id: n.id, name: n.name, path });
      walk(n.children, path);
    }
  };
  walk(tree);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> UPLOAD CENTER</p>
          <h1>Add files to your library</h1>
          <p>Images and videos only in this version. Files are stored securely via the storage manager.</p>
        </div>
      </div>
      <div className="card">
        <UploadCenter
          folders={options}
          maxUploadBytes={plan.max_upload_bytes}
          quotaRemaining={Math.max(0, plan.storage_bytes - overview.storageUsedBytes)}
        />
      </div>
    </>
  );
}

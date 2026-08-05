import { currentUser } from "@/lib/auth";
import { buildFolderTree } from "@/lib/services/folders";
import { FoldersManager } from "@/components/folders-manager";

export default async function FoldersPage() {
  const user = await currentUser();
  if (!user) return null;
  const tree = buildFolderTree(user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> FOLDERS</p>
          <h1>Organize your library</h1>
          <p>Create nested folders, rename, move and delete to keep things tidy.</p>
        </div>
      </div>
      <FoldersManager initialTree={tree} />
    </>
  );
}

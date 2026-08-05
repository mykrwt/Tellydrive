import { currentUser } from "@/lib/auth";
import { listFiles } from "@/lib/services/files";
import { buildFolderTree } from "@/lib/services/folders";
import { Gallery } from "@/components/gallery";

export default async function GalleryPage() {
  const user = await currentUser();
  if (!user) return null;
  const files = listFiles({ userId: user.id, sort: "newest" });
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
          <p className="eyebrow"><span /> GALLERY</p>
          <h1>Your library</h1>
          <p>Preview, search, sort and manage your images and videos.</p>
        </div>
      </div>
      <Gallery initialFiles={files} folders={options} initialFolder={null} />
    </>
  );
}

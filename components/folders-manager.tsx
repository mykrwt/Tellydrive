"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { formatBytes } from "@/lib/format";

interface FolderNode {
  id: number;
  name: string;
  parent_id: number | null;
  children: FolderNode[];
  file_count: number;
  created_at: string;
}

interface FileType {
  id: number;
  name: string;
  size_bytes: number;
  is_image: number;
}

export function FoldersManager({ initialTree }: { initialTree: FolderNode[] }) {
  const [tree, setTree] = useState(initialTree);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [selected, setSelected] = useState<FolderNode | null>(null);
  const [contents, setContents] = useState<FileType[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);

  const reloadTree = async () => {
    const data = await api<{ tree: FolderNode[] }>("/api/folders");
    setTree(data.tree);
  };

  const create = async () => {
    if (!name.trim()) return;
    await api("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ? Number(parentId) : null }),
    });
    setName("");
    setCreating(false);
    reloadTree();
  };

  const act = async (folder: FolderNode, action: "rename" | "move" | "delete") => {
    if (action === "delete") {
      if (!confirm(`Move "${folder.name}" and its contents to the Recycle Bin?`)) return;
      await api(`/api/folders/${folder.id}`, { method: "DELETE" });
    } else if (action === "rename") {
      const n = prompt("Rename folder", folder.name);
      if (n && n !== folder.name) {
        await api(`/api/folders/${folder.id}`, { method: "PATCH", body: JSON.stringify({ name: n }) });
      }
    } else if (action === "move") {
      const p = prompt("New parent folder id (empty for root):", String(folder.parent_id ?? ""));
      if (p !== null) {
        await api(`/api/folders/${folder.id}`, {
          method: "PATCH",
          body: JSON.stringify({ parent_id: p === "" ? null : Number(p) }),
        });
      }
    }
    setOpen(null);
    reloadTree();
  };

  const openFolder = async (folder: FolderNode) => {
    setSelected(folder);
    const data = await api<{ files: FileType[] }>(`/api/files?folder_id=${folder.id}`);
    setContents(data.files);
  };

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: FolderNode, depth = 0) => {
    const isOpen = open === node.id;
    const hasKids = node.children.length > 0;
    return (
      <div key={node.id}>
        <div className="folder-row" style={{ paddingLeft: depth * 22 + 10 }}>
          <span className="folder-caret" onClick={() => hasKids && toggle(node.id)}>
            {hasKids ? (expanded.has(node.id) ? "⌄" : "›") : "·"}
          </span>
          <button className="folder-name" onClick={() => openFolder(node)}>
            ⌁ {node.name}
            <small>{node.file_count} file{node.file_count === 1 ? "" : "s"}</small>
          </button>
          <button className="kebab" onClick={() => setOpen(isOpen ? null : node.id)}>•••</button>
          {isOpen && (
            <div className="menu folder-menu">
              <button onClick={() => act(node, "rename")}>Rename</button>
              <button onClick={() => act(node, "move")}>Move</button>
              <button className="danger" onClick={() => act(node, "delete")}>Delete</button>
            </div>
          )}
        </div>
        {expanded.has(node.id) &&
          node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="folders-toolbar">
        <button className="button button-primary" onClick={() => setCreating(true)}>+ New folder</button>
        {creating && (
          <div className="inline-form">
            <input
              autoFocus
              placeholder="Folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Inside Library root</option>
              {flatten(tree).map((n) => (
                <option key={n.id} value={n.id}>Inside {n.name}</option>
              ))}
            </select>
            <button className="button button-primary" onClick={create}>Create</button>
            <button className="button button-quiet" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="folders-layout">
        <div className="card folder-tree">
          <h3>Folders</h3>
          {tree.length === 0 ? (
            <div className="empty-state small">
              <p>No folders yet. Create one to organize your files.</p>
            </div>
          ) : (
            tree.map((n) => renderNode(n))
          )}
        </div>

        <div className="card folder-contents">
          {selected ? (
            <>
              <h3>Contents of “{selected.name}”</h3>
              {contents.length === 0 ? (
                <div className="empty-state small"><p>This folder is empty.</p></div>
              ) : (
                contents.map((f) => (
                  <div key={f.id} className="folder-file-row">
                    <span>{f.is_image ? "▱" : "▶"}</span>
                    <b>{f.name}</b>
                    <small>{formatBytes(f.size_bytes)}</small>
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="empty-state small">
              <p>Select a folder to view its files.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function flatten(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (ns: FolderNode[]) => {
    for (const n of ns) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

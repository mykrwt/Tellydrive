export function fileIcon(type: string): string {
  if (type.includes("upload") || type.includes("file")) return "↥";
  if (type.includes("folder")) return "⌁";
  if (type.includes("delete") || type.includes("trash")) return "🗑";
  if (type.includes("restore")) return "↩";
  if (type.includes("rename") || type.includes("moved")) return "✎";
  if (type.includes("plan")) return "★";
  if (type.includes("account")) return "✓";
  return "·";
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}

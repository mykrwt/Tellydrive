"use client";

export type ClientFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  itemCount?: number;
};

export type ClientFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt?: string;
  chunked?: boolean;
  chunkCount?: number;
  folderId?: string | null;
  hasThumbnail?: boolean;
};

export type FileKind = "image" | "video" | "audio" | "archive" | "document" | "code" | "other";

export function fileExtension(name: string): string {
  const parts = name.split(".");
  if (parts.length <= 1) return "";
  return (parts.pop() ?? "").toLowerCase().trim();
}

export function fileKind(mime: string, name: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = fileExtension(name);
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso", "dmg", "apk"].includes(ext)) return "archive";
  if (["mp3", "wav", "ogg", "opus", "flac", "aac", "m4a", "wma", "aiff", "mid", "midi"].includes(ext)) return "audio";
  if (["js", "ts", "jsx", "tsx", "py", "html", "css", "json", "sql", "sh", "rs", "go", "cpp", "c", "java", "php", "yaml", "yml", "xml"].includes(ext)) return "code";
  if (
    [
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md",
      "log", "odt", "ods", "odp", "epub", "mobi", "ics", "vcf", "srt", "vtt",
    ].includes(ext)
  ) {
    return "document";
  }
  return "other";
}

export type KindColorMeta = {
  accent: string;
  bg: string;
  border: string;
  label: string;
};

export function getFileKindMeta(mime: string, name: string): KindColorMeta {
  const ext = fileExtension(name).toUpperCase();
  const kind = fileKind(mime, name);

  if (ext === "PDF") {
    return { accent: "#ff5252", bg: "rgba(255, 82, 82, 0.12)", border: "rgba(255, 82, 82, 0.25)", label: "PDF" };
  }
  if (["DOC", "DOCX"].includes(ext)) {
    return { accent: "#4285f4", bg: "rgba(66, 133, 244, 0.12)", border: "rgba(66, 133, 244, 0.25)", label: "DOC" };
  }
  if (["XLS", "XLSX", "CSV"].includes(ext)) {
    return { accent: "#0f9d58", bg: "rgba(15, 157, 88, 0.12)", border: "rgba(15, 157, 88, 0.25)", label: ext };
  }
  if (["PPT", "PPTX"].includes(ext)) {
    return { accent: "#ff7043", bg: "rgba(255, 112, 67, 0.12)", border: "rgba(255, 112, 67, 0.25)", label: "PPT" };
  }

  switch (kind) {
    case "image":
      return { accent: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", border: "rgba(56, 189, 248, 0.25)", label: ext || "IMG" };
    case "video":
      return { accent: "#a855f7", bg: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.25)", label: ext || "VID" };
    case "audio":
      return { accent: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.25)", label: ext || "AUDIO" };
    case "archive":
      return { accent: "#ec4899", bg: "rgba(236, 72, 153, 0.12)", border: "rgba(236, 72, 153, 0.25)", label: ext || "ZIP" };
    case "code":
      return { accent: "#10b981", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.25)", label: ext || "CODE" };
    case "document":
      return { accent: "#6366f1", bg: "rgba(99, 102, 241, 0.12)", border: "rgba(99, 102, 241, 0.25)", label: ext || "DOC" };
    default:
      return { accent: "#94a3b8", bg: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.25)", label: ext || "FILE" };
  }
}

// Shared by server and client code — keep the implementations in lib/format.ts
export { formatBytes, formatDate } from "@/lib/format";

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

export type FileKind = "image" | "video" | "audio" | "archive" | "document" | "other";

export function fileKind(mime: string, name: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = (name.toLowerCase().split(".").pop() ?? "").replace(/^\./, "");
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext)) return "archive";
  if (["mp3", "wav", "ogg", "opus", "flac", "aac", "m4a", "wma"].includes(ext)) return "audio";
  if (
    [
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md",
      "json", "xml", "yaml", "yml", "log", "odt", "ods", "odp", "epub", "mobi",
      "ics", "vcf", "srt", "vtt", "sql", "ttf", "otf", "woff", "woff2",
    ].includes(ext)
  ) {
    return "document";
  }
  return "other";
}

// Shared by server and client code — keep the implementations in lib/format.ts
export { formatBytes, formatDate } from "@/lib/format";

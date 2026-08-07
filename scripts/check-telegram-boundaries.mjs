#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const findings = [];
const sourceExtensions = new Set([
  ".css", ".dart", ".gradle", ".html", ".java", ".js", ".json", ".jsx",
  ".kt", ".kts", ".plist", ".properties", ".swift", ".ts", ".tsx", ".xml",
  ".yaml", ".yml",
]);
const ignoredDirectories = new Set([".dart_tool", ".git", ".next", "build", "dist", "node_modules", "out"]);

const forbiddenClientPatterns = [
  ["private Telegram environment variable", /\bTELEGRAM_(?:BOT_TOKEN|CHAT_ID|STORAGE_CHAT_ID|STORAGE_BOT_TOKEN|API_ID|API_HASH|API_BASE)\b/],
  ["server signing secret", /\bSESSION_SECRET\b/],
  ["client environment access", /\bprocess\.env\b/],
  ["publicly exposed sensitive environment variable", /\bNEXT_PUBLIC_[A-Z0-9_]*(?:TOKEN|SECRET|HASH|CHAT|CHANNEL|ADMIN|STORAGE)[A-Z0-9_]*\b/],
  ["Telegram Bot API URL", /https?:\/\/(?:api\.)?telegram\.org/i],
  ["Telegram bot file URL", /\/file\/bot[^/\s]+\//i],
  ["Telegram bot token-shaped value", /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/],
  ["private Telegram file identifier field", /\btelegramFileId\b/],
  ["private Telegram message identifier field", /\btelegramMessageId\b/],
  ["private Telegram thumbnail identifier field", /\bthumbnailFileId\b/],
];

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function inspectClientSource(file, source) {
  for (const [label, pattern] of forbiddenClientPatterns) {
    const match = pattern.exec(source);
    if (match) {
      findings.push(`${path.relative(root, file)}:${lineNumber(source, match.index)} — ${label}`);
    }
  }

  if (/from\s+["'][^"']*(?:backend-authority|telegram-storage|telegram-store|admin-telegram-config|admin-identity)["']/.test(source)) {
    findings.push(`${path.relative(root, file)}:1 — client imports a private backend Telegram module`);
  }
}

async function main() {
  const mobilePlatformDirectories = ["lib", "android", "ios", "web", "macos", "windows", "linux"];
  const mobileFiles = (
    await Promise.all(
      mobilePlatformDirectories.map((directory) =>
        walk(path.join(root, "tellybase_mobile", directory)),
      ),
    )
  ).flat();
  for (const file of mobileFiles) {
    inspectClientSource(file, await readFile(file, "utf8"));
  }

  for (const base of ["app", "components", "public"]) {
    const files = await walk(path.join(root, base));
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const extension = path.extname(file);
      const isStaticClientAsset = [".css", ".html", ".js", ".json"].includes(extension);
      if (isStaticClientAsset || /^\s*["']use client["'];/.test(source)) {
        inspectClientSource(file, source);
      }
    }
  }

  const privateModules = [
    "lib/backend-authority.ts",
    "lib/server/admin-identity.ts",
    "lib/server/admin-telegram-config.ts",
    "lib/telegram-storage.ts",
    "lib/telegram-store.ts",
  ];
  for (const relative of privateModules) {
    const source = await readFile(path.join(root, relative), "utf8");
    if (!/^import ["']server-only["'];/.test(source)) {
      findings.push(`${relative}:1 — private Telegram module is missing the server-only guard`);
    }
  }

  const storageSource = await readFile(path.join(root, "lib/telegram-storage.ts"), "utf8");
  if (/\buser(?:Token|ChatId)\b/.test(storageSource)) {
    findings.push("lib/telegram-storage.ts:1 — user input can override a System A storage credential");
  }
  if (!/createCipheriv\("aes-256-gcm"/.test(storageSource)) {
    findings.push("lib/telegram-storage.ts:1 — upload grants are not protected with authenticated encryption");
  }

  const apiRouteFiles = (await walk(path.join(root, "app/api"))).filter((file) => file.endsWith("route.ts"));
  for (const file of apiRouteFiles) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(root, file);
    const isPublicAuthEntry = relative.endsWith("auth/sign-in/route.ts") || relative.endsWith("auth/sign-up/route.ts");
    const hasBackendGate = isPublicAuthEntry
      ? /assert(?:IdentityCanStartSession|PublicSignupAllowed)/.test(source)
      : /authorizeRequest\(/.test(source);
    if (!hasBackendGate) findings.push(`${relative}:1 — API route is missing a backend authority gate`);
  }

  const authorityCriticalFiles = new Map([
    ["app/actions.ts", /assertIdentityCanStartSession/],
    ["app/dashboard/admin-actions.ts", /authorizeRequest\("admin:write"\)/],
    ["app/dashboard/page.tsx", /authorizeRequest\("storage:read"\)/],
    ["app/dashboard/files/page.tsx", /authorizeRequest\("storage:read"\)/],
    ["app/dashboard/admin/page.tsx", /requireAdmin\(/],
  ]);
  for (const [relative, requiredPattern] of authorityCriticalFiles) {
    const source = await readFile(path.join(root, relative), "utf8");
    if (!requiredPattern.test(source)) findings.push(`${relative}:1 — protected server entry is missing backend authority`);
  }

  const fileRouteSource = await readFile(path.join(root, "app/api/files/[id]/route.ts"), "utf8");
  if (/NextResponse\.redirect/.test(fileRouteSource)) {
    findings.push("app/api/files/[id]/route.ts:1 — file API redirects can expose a private upstream URL");
  }
  if (/NextResponse\.json\(\s*\{[^}]*\burls?\s*:/s.test(fileRouteSource)) {
    findings.push("app/api/files/[id]/route.ts:1 — file API serializes an upstream URL");
  }

  if (findings.length) {
    console.error("Telegram boundary check failed:\n");
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Telegram boundary check passed (${mobileFiles.length} mobile files checked).`);
}

await main();

import "server-only";

import { createHash } from "node:crypto";
import type { AdminBotUpdate } from "@/lib/server/admin-bot-gateway";
import { getAdminBotTelegramConfig } from "@/lib/server/admin-telegram-config";
import { isOperatorFloorAccount } from "@/lib/server/admin-identity";
import {
  addRelease,
  clearAnnouncement,
  deleteRelease,
  findUserByEmail,
  getActivityLog,
  getAdminAnalytics,
  getAdminOverview,
  getAnnouncement,
  getReleases,
  getReleaseById,
  getSystemAuthorityState,
  publishRelease,
  setAnnouncement,
  setMaintenanceState,
  setUserRole,
  updateReleaseDetails,
  updateUserAuthorityPolicy,
  type AdminUserRow,
  type AppRelease,
} from "@/lib/telegram-store";
import { APK_MAX_UPLOAD_BYTES, uploadApkToStorage } from "@/lib/telegram-storage";
import { formatBytes } from "@/lib/format";

/**
 * The Telegram admin console — backend brain.
 *
 * This module is the ONLY place that interprets admin-bot messages. It maps
 * commands/menu taps to validated backend store operations, then returns a
 * pure "outbound action plan" (Telegram API calls) for the bridge process to
 * execute. The bridge contains no business logic; everything here runs behind
 * the gateway authorization performed in app/api/admin-bot/update/route.ts.
 */

export type BotOutbound = {
  method: "sendMessage" | "editMessageText" | "answerCallbackQuery";
  params: Record<string, unknown>;
};

type KbButton = { text: string; callback_data: string };
type KbRow = KbButton[];

const USER_PAGE_SIZE = 8;
const LOG_PAGE_SIZE = 25;

type PendingState =
  | { kind: "release_version"; releaseId: string }
  | { kind: "release_notes"; releaseId: string }
  | { kind: "announcement" }
  | { kind: "search_users" }
  | { kind: "premium_custom"; userId: string };

type ChatSession = {
  pending: PendingState | null;
  usersPage: number;
};

// In-memory conversational state (business logic, backend-side). Keyed by the
// operator's Telegram chat id. Ephemeral: a restart simply resets any pending
// prompt and the operator can re-issue the command.
const sessions = new Map<number, ChatSession>();

function sessionFor(chatId: number): ChatSession {
  let session = sessions.get(chatId);
  if (!session) {
    session = { pending: null, usersPage: 0 };
    sessions.set(chatId, session);
  }
  return session;
}

// ── Outbound helpers ──

function kb(rows: KbRow[]) {
  return { inline_keyboard: rows };
}

function btn(text: string, data: string): KbButton {
  // Telegram caps inline button labels at 64 characters.
  return { text: text.slice(0, 60), callback_data: data };
}

function send(chatId: number, text: string, keyboard?: ReturnType<typeof kb>): BotOutbound {
  const params: Record<string, unknown> = { chat_id: chatId, text };
  if (keyboard) params.reply_markup = keyboard;
  return { method: "sendMessage", params };
}

function edit(chatId: number, messageId: number, text: string, keyboard?: ReturnType<typeof kb>): BotOutbound {
  const params: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text };
  if (keyboard) params.reply_markup = keyboard;
  return { method: "editMessageText", params };
}

function answer(callbackQueryId: string, text?: string): BotOutbound {
  const params: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) params.text = text;
  return { method: "answerCallbackQuery", params };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function statusBadge(user: AdminUserRow): string {
  const status = user.accountStatus === "active" ? "✅ active" : user.accountStatus === "suspended" ? "⏸ suspended" : "🚫 banned";
  return status;
}

function planLabel(user: AdminUserRow): string {
  const sub = user.subscription;
  if (sub.tier === "premium") {
    const expiry = sub.expiresAt ? ` · till ${fmtDate(sub.expiresAt)}` : "";
    return `💳 premium (${sub.status})${expiry}`;
  }
  return "💳 free";
}

function escapeText(value: string): string {
  return value.replace(/[\n\r]/g, " ").slice(0, 120);
}

// ── Main entry ──

export async function handleAdminBotUpdate(
  update: AdminBotUpdate,
  principal: { senderId: number; senderName: string },
): Promise<BotOutbound[]> {
  const actor = `telegram:${principal.senderId}`;

  if (update.callback_query) {
    const callback = update.callback_query;
    const message = callback.message;
    if (!message) return [];
    const chatId = message.chat.id;
    const session = sessionFor(chatId);
    const messageId = message.message_id;
    const data = (callback.data ?? "").trim();
    return handleCallback(data, {
      chatId,
      messageId,
      callbackQueryId: callback.id,
      actor,
      senderName: principal.senderName,
      session,
    });
  }

  const msg = update.message;
  if (!msg) return [];
  const chatId = msg.chat.id;
  const session = sessionFor(chatId);
  if (msg.chat.type !== "private") {
    return [send(chatId, "Please use this bot in a private chat.")];
  }

  if (msg.document) {
    return handleDocument(msg, chatId, actor, session);
  }

  const text = (msg.text ?? "").trim();
  if (!text) return [];

  if (session.pending) {
    const handled = await handlePendingText(text, chatId, actor, session);
    if (handled) return handled;
  }

  return handleCommand(text, chatId, actor, principal.senderName, session);
}

// ── Main menu & commands ──

function mainMenuKeyboard(): ReturnType<typeof kb> {
  return kb([
    [btn("📊 Statistics", "stats"), btn("📈 Analytics", "analytics")],
    [btn("👥 Users", "users"), btn("🔍 Search user", "search")],
    [btn("💳 Subscriptions", "subs")],
    [btn("🚀 Releases", "rels"), btn("📦 Upload APK", "apk")],
    [btn("📢 Announcement", "ann")],
    [btn("🔧 Maintenance", "maint")],
    [btn("📜 Logs", "logs")],
    [btn("❓ Help", "help")],
  ]);
}

function helpText(): string {
  return [
    "🛠 *TellyBase Admin Console*",
    "",
    "Commands:",
    "/menu — main menu",
    "/stats — current statistics",
    "/users — user list (paginated)",
    "/user <email or name> — find a user",
    "/ban <email> · /unban <email>",
    "/premium <email> <days> — grant premium",
    "/maintenance on|off [message]",
    "/announce <text> · /announce off",
    "/apk — upload a new APK release",
    "/releases — list releases",
    "/logs [n] — recent activity",
    "/analytics — trends & top users",
    "",
    "You can also send an email or name directly to search.",
  ].join("\n");
}

async function handleCommand(
  text: string,
  chatId: number,
  actor: string,
  senderName: string,
  session: ChatSession,
): Promise<BotOutbound[]> {
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.toLowerCase().replace(/^\/+/, "");
  const argText = args.join(" ").trim();

  if (command === "start" || command === "menu" || text === "Menu" || text === "☰ Menu") {
    return [send(chatId, `Welcome, ${senderName}. What would you like to do?`, mainMenuKeyboard())];
  }
  if (command === "help") return [send(chatId, helpText(), mainMenuKeyboard())];

  if (command === "stats") return statistics(chatId);
  if (command === "analytics") return analytics(chatId);
  if (command === "users") {
    session.usersPage = 0;
    return userListPage(chatId, 0, session);
  }
  if (command === "logs") {
    const limit = clampInt(argText, 1, 100, 25);
    return logs(chatId, limit);
  }
  if (command === "rels" || command === "releases") return releasesList(chatId);
  if (command === "apk") {
    return [
      send(
        chatId,
        [
          "📦 *APK upload*",
          "",
          `Send the release APK file here (max ${Math.floor(APK_MAX_UPLOAD_BYTES / 1024 / 1024)} MB, .apk only).`,
          "",
          "After the upload I'll ask you for the version details, then you can publish it.",
        ].join("\n"),
        kb([[btn("⬅️ Menu", "menu")]]),
      ),
    ];
  }
  if (command === "ann") return announcementMenu(chatId);
  if (command === "maint") return maintenanceMenu(chatId);
  if (command === "subs") return subscriptions(chatId);

  if (command === "user" || command === "search") {
    if (!argText) {
      session.pending = { kind: "search_users" };
      return [send(chatId, "🔍 Send a name, email, or part of one and I'll search the user database.", kb([[btn("⬅️ Menu", "menu")]]))];
    }
    return searchUsers(chatId, argText);
  }

  if (command === "ban" || command === "unban" || command === "premium") {
    if (!argText) {
      return [send(chatId, `Usage: /${command} <email>${command === "premium" ? " <days>" : ""}`)];
    }
    if (command === "ban") return banUnban(chatId, argText, "banned", actor);
    if (command === "unban") return banUnban(chatId, argText, "active", actor);
    const [email, daysText] = splitFirst(argText);
    const days = Number(daysText);
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      return [send(chatId, "Usage: /premium <email> <days> — days must be a positive integer.")];
    }
    return grantPremium(chatId, email, days, actor);
  }

  if (command === "maintenance") {
    const mode = args[0]?.toLowerCase();
    if (mode === "on" || mode === "off") {
      const message = mode === "on" ? (args.slice(1).join(" ") || null) : null;
      try {
        const state = await setMaintenanceState(mode === "on", message, actor);
        const status = state.maintenance.enabled ? "🟢 ON" : "⚪ OFF";
        const detail = state.maintenance.message ? `\nMessage: ${state.maintenance.message}` : "";
        return [send(chatId, `🔧 Maintenance mode: ${status}${detail}`, kb([[btn("⬅️ Menu", "menu")]]))];
      } catch (error) {
        return [send(chatId, `❌ ${errorText(error)}`)];
      }
    }
    return maintenanceMenu(chatId);
  }

  if (command === "announce") {
    if (argText.toLowerCase() === "off") {
      try {
        await clearAnnouncement(actor);
        return [send(chatId, "📢 Announcement cleared. Users will no longer see it.", kb([[btn("📢 Announcement", "ann")]]))];
      } catch (error) {
        return [send(chatId, `❌ ${errorText(error)}`)];
      }
    }
    if (!argText) {
      session.pending = { kind: "announcement" };
      return [send(chatId, "📢 Send the announcement text. It will be shown to every user inside the app.", kb([[btn("⬅️ Menu", "menu")]]))];
    }
    try {
      await setAnnouncement(argText, actor);
      return [
        send(
          chatId,
          `📢 Announcement published — all users will see it in the app:\n\n“${argText.slice(0, 200)}”`,
          kb([[btn("📢 Announcement", "ann")]]),
        ),
      ];
    } catch (error) {
      return [send(chatId, `❌ ${errorText(error)}`)];
    }
  }

  // Any other free text = user search convenience.
  if (!text.startsWith("/")) {
    return searchUsers(chatId, text);
  }

  return [send(chatId, `Unknown command “${rawCommand}”. Use /help or /menu.`)];
}

async function handlePendingText(
  text: string,
  chatId: number,
  actor: string,
  session: ChatSession,
): Promise<BotOutbound[] | null> {
  const pending = session.pending;
  if (!pending) return null;

  if (pending.kind === "search_users") {
    session.pending = null;
    return searchUsers(chatId, text);
  }

  if (pending.kind === "announcement") {
    session.pending = null;
    try {
      const announcement = await setAnnouncement(text, actor);
      return [
        send(
          chatId,
          `📢 Announcement published — all users will see it in the app:\n\n“${announcement.message.slice(0, 200)}”`,
          kb([[btn("📢 Announcement", "ann")]]),
        ),
      ];
    } catch (error) {
      return [send(chatId, `❌ ${errorText(error)}`)];
    }
  }

  if (pending.kind === "premium_custom") {
    const days = Number(text.trim());
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      return [send(chatId, "❌ Days must be a positive integer (max 3650). Send the number of days again.")];
    }
    session.pending = null;
    return applyPremium(pending.userId, days, chatId, actor);
  }

  if (pending.kind === "release_version" || pending.kind === "release_notes") {
    const releaseId = pending.releaseId;
    if (pending.kind === "release_notes") {
      try {
        await updateReleaseDetails(releaseId, { notes: text }, actor);
        session.pending = null;
        return [send(chatId, "📝 Notes saved.", kb([[btn("🚀 Release", `rel:${releaseId}`)]]))];
      } catch (error) {
        return [send(chatId, `❌ ${errorText(error)}`)];
      }
    }
    // release_version: "<name> <code> [notes...]"
    const tokens = text.split(/\s+/);
    if (tokens.length < 2) {
      return [
        send(chatId, "❌ Send the version as: `<versionName> <versionCode> [notes]`\nExample: `1.2.3 42 Fixed uploads and added dark mode`"),
      ];
    }
    const versionName = tokens[0].replace(/^v/i, "");
    const versionCode = Number(tokens[1]);
    const notes = tokens.slice(2).join(" ") || null;
    if (!/^[0-9][0-9A-Za-z._-]{0,39}$/.test(versionName)) {
      return [send(chatId, "❌ Version name must start with a digit (e.g. 1.2.3). Try again.")];
    }
    if (!Number.isInteger(versionCode) || versionCode < 0) {
      return [send(chatId, "❌ Version code must be a non-negative integer. Try again.")];
    }
    try {
      const release = await updateReleaseDetails(releaseId, { versionName, versionCode, notes }, actor);
      session.pending = null;
      return [send(chatId, releaseCardText(release), releaseKeyboard(release))];
    } catch (error) {
      return [send(chatId, `❌ ${errorText(error)}`)];
    }
  }

  return null;
}

// ── Statistics / analytics / logs ──

async function statistics(chatId: number): Promise<BotOutbound[]> {
  try {
    const overview = await getAdminOverview();
    const a = await getAdminAnalytics();
    const maintenance = overview.system.maintenance;
    const lines = [
      "📊 *Statistics*",
      "",
      `👥 Users: ${overview.totals.users} (admins ${a.admins} · banned ${a.banned} · suspended ${a.suspended})`,
      `💳 Premium active: ${a.premiumActive}`,
      `📁 Files: ${overview.totals.files} · 🗂 Folders: ${overview.totals.folders}`,
      `💾 Storage: ${formatBytes(overview.totals.bytes)} (🖼 ${overview.totals.images} · 🎬 ${overview.totals.videos} · 📄 ${overview.totals.documents})`,
      `🚀 Published release: ${a.publishedRelease ? `v${a.publishedRelease.versionName} (code ${a.publishedRelease.versionCode})` : "none"}`,
      `🔧 Maintenance: ${maintenance.enabled ? "🟢 ON" : "⚪ OFF"}${maintenance.enabled && maintenance.message ? ` — ${maintenance.message}` : ""}`,
      `📢 Announcement: ${(await getAnnouncement()) ? "set" : "none"}`,
      `🗄 DB mode: ${overview.mode} · revision ${overview.revision} · updated ${fmtDate(overview.updatedAt)}`,
    ];
    return [send(chatId, lines.join("\n"), kb([[btn("📈 Analytics", "analytics")], [btn("⬅️ Menu", "menu")]]))];
  } catch (error) {
    return [send(chatId, `❌ Could not load statistics: ${errorText(error)}`)];
  }
}

function bar(count: number, max: number): string {
  if (max <= 0) return "▁";
  const filled = Math.max(1, Math.round((count / max) * 8));
  return "▇".repeat(filled) + "▁".repeat(Math.max(0, 8 - filled));
}

async function analytics(chatId: number): Promise<BotOutbound[]> {
  try {
    const a = await getAdminAnalytics();
    const maxSignups = Math.max(1, ...a.signupsPerDay.map((d) => d.count));
    const signupLines = a.signupsPerDay
      .map((d) => `${d.day.slice(5)} ${bar(d.count, maxSignups)} ${d.count}`)
      .join("\n");
    const lines = [
      "📈 *Analytics*",
      "",
      `New users: 7d ${a.newUsers7d} · 30d ${a.newUsers30d}`,
      `Logins: 7d ${a.logins7d} · 30d ${a.logins30d}`,
      `Uploads: 7d ${a.uploads7d} · 30d ${a.uploads30d}`,
      `Storage: 🖼 ${formatBytes(a.totals.imagesBytes)} · 🎬 ${formatBytes(a.totals.videosBytes)} · 📄 ${formatBytes(a.totals.documentsBytes)}`,
      "",
      "Signups/day (last 7):",
      signupLines,
    ];
    if (a.topUsers.length) {
      lines.push("", "Top users by storage:");
      a.topUsers.forEach((user, index) => {
        lines.push(`${index + 1}. ${escapeText(user.name)} — ${formatBytes(user.bytes)} (${user.fileCount} files)`);
      });
    }
    return [send(chatId, lines.join("\n"), kb([[btn("📊 Statistics", "stats")], [btn("⬅️ Menu", "menu")]]))];
  } catch (error) {
    return [send(chatId, `❌ Could not load analytics: ${errorText(error)}`)];
  }
}

async function logs(chatId: number, limit: number): Promise<BotOutbound[]> {
  try {
    const entries = await getActivityLog(limit);
    if (!entries.length) {
      return [send(chatId, "📜 No activity recorded yet.", kb([[btn("⬅️ Menu", "menu")]]))];
    }
    const lines = ["📜 *Recent activity*", ""];
    for (const entry of entries) {
      const target = entry.target ? ` ${entry.target}` : "";
      const detail = entry.detail ? ` — ${entry.detail}` : "";
      lines.push(`${fmtDate(entry.at)} ${entry.action}${target}${detail} (${entry.actor})`);
      if (lines.length >= 42) break; // stay under Telegram's 4096 char limit
    }
    return [send(chatId, lines.join("\n"), kb([[btn("⬅️ Menu", "menu")]]))];
  } catch (error) {
    return [send(chatId, `❌ Could not load logs: ${errorText(error)}`)];
  }
}

// ── Users ──

async function overview(): Promise<Awaited<ReturnType<typeof getAdminOverview>>> {
  return getAdminOverview();
}

async function userListPage(chatId: number, page: number, session: ChatSession): Promise<BotOutbound[]> {
  try {
    const data = await overview();
    const users = data.users;
    const totalPages = Math.max(1, Math.ceil(users.length / USER_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    session.usersPage = safePage;
    const slice = users.slice(safePage * USER_PAGE_SIZE, (safePage + 1) * USER_PAGE_SIZE);

    const lines = [`👥 *Users* (${users.length}) — page ${safePage + 1}/${totalPages}`, ""];
    slice.forEach((user, index) => {
      lines.push(
        `${safePage * USER_PAGE_SIZE + index + 1}. ${escapeText(user.name)} — ${escapeText(user.email)}\n   ${statusBadge(user)} · ${user.role === "admin" ? "👑 admin" : "user"} · ${planLabel(user)}`,
      );
    });
    if (!slice.length) lines.push("No users yet.");

    const rows: KbRow[] = [];
    if (totalPages > 1) {
      const nav: KbButton[] = [];
      if (safePage > 0) nav.push(btn("◀️", `users:${safePage - 1}`));
      nav.push(btn(`${safePage + 1}/${totalPages}`, "users"));
      if (safePage < totalPages - 1) nav.push(btn("▶️", `users:${safePage + 1}`));
      rows.push(nav);
    }
    rows.push([btn("🔍 Search", "search")], [btn("⬅️ Menu", "menu")]);

    return [send(chatId, lines.join("\n"), kb(rows))];
  } catch (error) {
    return [send(chatId, `❌ Could not load users: ${errorText(error)}`)];
  }
}

async function searchUsers(chatId: number, query: string): Promise<BotOutbound[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [send(chatId, "❌ Search query is empty.")];
  try {
    const data = await overview();
    const matches = data.users.filter(
      (user) =>
        user.email.toLowerCase().includes(q) ||
        user.name.toLowerCase().includes(q) ||
        user.id.toLowerCase() === q,
    );
    if (!matches.length) {
      return [send(chatId, `🔍 No users match “${escapeText(query)}”.`, kb([[btn("🔍 Search", "search")], [btn("⬅️ Menu", "menu")]]))];
    }
    if (matches.length === 1) {
      return [send(chatId, userCardText(matches[0]), userCardKeyboard(matches[0]))];
    }
    const lines = [`🔍 ${matches.length} users match “${escapeText(query)}”:`, ""];
    const rows: KbRow[] = [];
    matches.slice(0, 10).forEach((user, index) => {
      lines.push(`${index + 1}. ${escapeText(user.name)} — ${escapeText(user.email)} (${statusBadge(user)})`);
      rows.push([btn(`👤 ${escapeText(user.name)}`, `user:${user.id}`)]);
    });
    if (matches.length > 10) lines.push(`…and ${matches.length - 10} more.`);
    rows.push([btn("⬅️ Menu", "menu")]);
    return [send(chatId, lines.join("\n"), kb(rows))];
  } catch (error) {
    return [send(chatId, `❌ Search failed: ${errorText(error)}`)];
  }
}

function userCardText(user: AdminUserRow): string {
  const lines = [
    `👤 ${escapeText(user.name)}`,
    `📧 ${escapeText(user.email)}`,
    `📅 Joined: ${fmtDate(user.createdAt)}`,
    `🕒 Last login: ${fmtDate(user.lastLoginAt)}`,
    `🎭 Role: ${user.role === "admin" ? "👑 admin" : "user"}`,
    `Status: ${statusBadge(user)}`,
    `🗄 Storage: ${user.storageAccess === "enabled" ? "enabled" : "🚫 disabled"}`,
    `💳 Plan: ${planLabel(user)}`,
    `📁 ${user.fileCount} files · 💾 ${formatBytes(user.totalBytes)}`,
  ];
  return lines.join("\n");
}

function userCardKeyboard(user: AdminUserRow): ReturnType<typeof kb> {
  const id = user.id;
  const rows: KbRow[] = [
    [btn("🚫 Ban", `user:${id}:ban`), btn("✅ Unban", `user:${id}:unban`)],
    [btn("⏸ Suspend", `user:${id}:suspend`), btn("▶️ Activate", `user:${id}:activate`)],
    [btn("💳 Premium", `premium:${id}`), btn("⛔ Cancel plan", `user:${id}:cancel_premium`)],
    [btn("🗄 Storage off", `user:${id}:storage_off`), btn("🗄 Storage on", `user:${id}:storage_on`)],
  ];
  if (user.role === "admin") {
    rows.push([btn("🙂 Remove admin", `user:${id}:deadmin`)]);
  } else {
    rows.push([btn("👑 Make admin", `user:${id}:admin`)]);
  }
  rows.push([btn("⬅️ Back", "users")]);
  return kb(rows);
}

async function userCard(chatId: number, userId: string): Promise<BotOutbound[]> {
  try {
    const data = await overview();
    const user = data.users.find((u) => u.id === userId);
    if (!user) return [send(chatId, "❌ User not found (they may have been removed).")];
    return [send(chatId, userCardText(user), userCardKeyboard(user))];
  } catch (error) {
    return [send(chatId, `❌ Could not load user: ${errorText(error)}`)];
  }
}

async function userById(userId: string): Promise<AdminUserRow | null> {
  const data = await overview();
  return data.users.find((u) => u.id === userId) ?? null;
}

function assertNotFloor(user: { email: string }): void {
  if (isOperatorFloorAccount(user)) {
    throw new Error("This is a bootstrap operator account (ADMIN_EMAILS) and cannot be modified.");
  }
}

async function applyUserStatus(userId: string, status: "active" | "banned" | "suspended", chatId: number, actor: string): Promise<BotOutbound[]> {
  try {
    const user = await userById(userId);
    if (!user) return [send(chatId, "❌ User not found.")];
    if (status !== "active") assertNotFloor(user);
    await updateUserAuthorityPolicy(userId, { accountStatus: status }, actor);
    const updated = (await userById(userId)) ?? user;
    const label = status === "banned" ? "🚫 Banned" : status === "suspended" ? "⏸ Suspended" : "✅ Activated";
    return [send(chatId, `${label} ${escapeText(user.email)}.`, userCardKeyboard(updated))];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

async function banUnban(chatId: number, email: string, status: "banned" | "active", actor: string): Promise<BotOutbound[]> {
  try {
    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) return [send(chatId, `❌ No account found for “${escapeText(email)}”.`)];
    if (status === "banned") assertNotFloor(user);
    await updateUserAuthorityPolicy(user.id, { accountStatus: status }, actor);
    const verb = status === "banned" ? "🚫 Banned" : "✅ Unbanned";
    return [send(chatId, `${verb} ${escapeText(user.email)}.`, kb([[btn("👤 View user", `user:${user.id}`)], [btn("⬅️ Menu", "menu")]]))];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

function grantPremium(chatId: number, email: string, days: number, actor: string): Promise<BotOutbound[]> {
  return findUserByEmail(email.trim().toLowerCase())
    .then((user) => {
      if (!user) return [send(chatId, `❌ No account found for “${escapeText(email)}”.`)];
      return applyPremium(user.id, days, chatId, actor);
    })
    .catch((error) => [send(chatId, `❌ ${errorText(error)}`)]);
}

async function applyPremium(userId: string, days: number, chatId: number, actor: string): Promise<BotOutbound[]> {
  try {
    const user = await userById(userId);
    if (!user) return [send(chatId, "❌ User not found.")];
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await updateUserAuthorityPolicy(
      userId,
      { subscription: { tier: "premium", status: "active", expiresAt } },
      actor,
    );
    const updated = (await userById(userId)) ?? user;
    return [
      send(
        chatId,
        `💳 Premium granted to ${escapeText(user.email)} for ${days} day${days === 1 ? "" : "s"} (until ${fmtDate(expiresAt)}).`,
        userCardKeyboard(updated),
      ),
    ];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

async function cancelPremium(userId: string, chatId: number, actor: string): Promise<BotOutbound[]> {
  try {
    const user = await userById(userId);
    if (!user) return [send(chatId, "❌ User not found.")];
    await updateUserAuthorityPolicy(userId, { subscription: { tier: "free", status: "active", expiresAt: null } }, actor);
    const updated = (await userById(userId)) ?? user;
    return [send(chatId, `⛔ Premium cancelled for ${escapeText(user.email)}.`, userCardKeyboard(updated))];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

async function toggleStorage(userId: string, enabled: boolean, chatId: number, actor: string): Promise<BotOutbound[]> {
  try {
    const user = await userById(userId);
    if (!user) return [send(chatId, "❌ User not found.")];
    if (!enabled) assertNotFloor(user);
    await updateUserAuthorityPolicy(userId, { storageAccess: enabled ? "enabled" : "disabled" }, actor);
    const updated = (await userById(userId)) ?? user;
    return [send(chatId, `${enabled ? "🗄 Storage enabled" : "🗄 Storage disabled"} for ${escapeText(user.email)}.`, userCardKeyboard(updated))];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

async function toggleAdmin(userId: string, makeAdmin: boolean, chatId: number, actor: string): Promise<BotOutbound[]> {
  try {
    const user = await userById(userId);
    if (!user) return [send(chatId, "❌ User not found.")];
    if (!makeAdmin) assertNotFloor(user);
    await setUserRole(userId, makeAdmin ? "admin" : "user", actor);
    const updated = (await userById(userId)) ?? user;
    return [
      send(chatId, `${makeAdmin ? "👑 Made" : "🙂 Removed"} ${escapeText(user.email)} ${makeAdmin ? "an admin" : "from admin"}.`, userCardKeyboard(updated)),
    ];
  } catch (error) {
    return [send(chatId, `❌ ${errorText(error)}`)];
  }
}

async function subscriptions(chatId: number): Promise<BotOutbound[]> {
  try {
    const data = await overview();
    const premium = data.users.filter((u) => u.subscription.tier === "premium");
    const active = premium.filter((u) => u.subscription.status === "active");
    const lines = [
      "💳 *Subscriptions*",
      "",
      `Premium accounts: ${premium.length} (${active.length} active)`,
      "",
    ];
    const rows: KbRow[] = [];
    premium.slice(0, 8).forEach((user) => {
      const expiry = user.subscription.expiresAt ? ` till ${fmtDate(user.subscription.expiresAt)}` : "";
      lines.push(`• ${escapeText(user.name)} — ${escapeText(user.email)} (${user.subscription.status})${expiry}`);
      rows.push([btn(`👤 ${escapeText(user.name)}`, `user:${user.id}`)]);
    });
    if (!premium.length) lines.push("No premium accounts yet.");
    lines.push("", "To change a plan, open the user or use /user <email>.");
    rows.push([btn("⬅️ Menu", "menu")]);
    return [send(chatId, lines.join("\n"), kb(rows))];
  } catch (error) {
    return [send(chatId, `❌ Could not load subscriptions: ${errorText(error)}`)];
  }
}

// ── Releases ──

function parseVersionHint(fileName: string): { versionName: string; versionCode: number } {
  const base = fileName.replace(/\.apk$/i, "");
  const match = base.match(/(?:^|[^\d])(v?(\d+\.\d+(?:\.\d+)?)(?:\+(\d+))?)$/i);
  if (match) {
    const versionName = match[2].replace(/^v/i, "");
    const versionCode = match[3] ? Number(match[3]) : 1;
    if (Number.isInteger(versionCode) && versionCode >= 0) return { versionName, versionCode };
  }
  return { versionName: "1.0", versionCode: 1 };
}

function releaseCardText(release: AppRelease): string {
  const status =
    release.status === "published" ? "🚀 published" : release.status === "archived" ? "🗄 archived" : "📝 draft";
  const lines = [
    `🚀 *Release* v${release.versionName} (code ${release.versionCode})`,
    `📦 ${release.fileName} · ${formatBytes(release.size)}`,
    `🔐 sha256: ${release.sha256.slice(0, 16)}…`,
    `📝 Notes: ${release.notes ? escapeText(release.notes) : "—"}`,
    `Status: ${status}`,
    `🗓 Created: ${fmtDate(release.createdAt)} · Published: ${fmtDate(release.publishedAt)}`,
  ];
  return lines.join("\n");
}

function releaseKeyboard(release: AppRelease): ReturnType<typeof kb> {
  const id = release.id;
  const rows: KbRow[] = [];
  if (release.status === "published") {
    rows.push([btn("↩️ Unpublish", `rel:${id}:unpublish`)]);
  } else {
    rows.push([btn("🚀 Publish", `rel:${id}:publish`)]);
  }
  rows.push([btn("✏️ Version", `rel:${id}:version`), btn("📝 Notes", `rel:${id}:notes`)]);
  rows.push([btn("🗑 Delete", `rel:${id}:delete`)]);
  rows.push([btn("⬅️ Back", "rels")]);
  return kb(rows);
}

async function releasesList(chatId: number): Promise<BotOutbound[]> {
  try {
    const releases = await getReleases(10);
    const lines = ["🚀 *Releases*", ""];
    const rows: KbRow[] = [];
    if (!releases.length) {
      lines.push("No releases yet. Use 📦 Upload APK to publish the first one.");
    } else {
      releases.forEach((release, index) => {
        const badge = release.status === "published" ? "🚀" : release.status === "archived" ? "🗄" : "📝";
        lines.push(`${index + 1}. ${badge} v${release.versionName} (code ${release.versionCode}) — ${formatBytes(release.size)}`);
        rows.push([btn(`v${release.versionName} · ${formatBytes(release.size)}`, `rel:${release.id}`)]);
      });
    }
    rows.push([btn("📦 Upload APK", "apk")], [btn("⬅️ Menu", "menu")]);
    return [send(chatId, lines.join("\n"), kb(rows))];
  } catch (error) {
    return [send(chatId, `❌ Could not load releases: ${errorText(error)}`)];
  }
}

async function releaseCard(chatId: number, releaseId: string): Promise<BotOutbound[]> {
  try {
    const release = await getReleaseById(releaseId);
    if (!release) return [send(chatId, "❌ Release not found.")];
    return [send(chatId, releaseCardText(release), releaseKeyboard(release))];
  } catch (error) {
    return [send(chatId, `❌ Could not load release: ${errorText(error)}`)];
  }
}

async function handleDocument(
  msg: NonNullable<AdminBotUpdate["message"]>,
  chatId: number,
  actor: string,
  session: ChatSession,
): Promise<BotOutbound[]> {
  const document = msg.document;
  if (!document) return [];
  const fileName = document.file_name ?? "release.apk";
  const fileSize = document.file_size ?? 0;

  if (!fileName.toLowerCase().endsWith(".apk")) {
    return [send(chatId, "❌ Only .apk files can be uploaded as releases. Send a file that ends in .apk.")];
  }
  if (fileSize <= 0) {
    return [send(chatId, "❌ The file has no reported size. Please send it again.")];
  }
  if (fileSize > APK_MAX_UPLOAD_BYTES) {
    return [
      send(
        chatId,
        `❌ This APK is ${(fileSize / 1024 / 1024).toFixed(1)} MB. The Telegram Bot API caps bot downloads at ${Math.floor(APK_MAX_UPLOAD_BYTES / 1024 / 1024)} MB — upload a smaller build (e.g. a single-ABI split) or a self-hosted Bot API server.`,
      ),
    ];
  }

  // Ignore any pending prompt; a document always starts an APK upload.
  session.pending = null;

  try {
    const bytes = await downloadTelegramFile(document.file_id);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const upload = await uploadApkToStorage(fileName, new Blob([Buffer.from(bytes)]));
    const hint = parseVersionHint(fileName);
    const release = await addRelease(
      {
        fileName,
        size: fileSize,
        versionName: hint.versionName,
        versionCode: hint.versionCode,
        notes: null,
        sha256,
        storageFileId: upload.fileId,
        storageMessageId: upload.messageId,
        storageChunked: upload.chunked,
        storageChunks: upload.chunks,
        storageChunkSize: upload.chunkSize,
      },
      actor,
    );
    session.pending = { kind: "release_version", releaseId: release.id };
    return [
      send(
        chatId,
        [
          `✅ APK stored (${formatBytes(fileSize)}, sha256 ${sha256.slice(0, 12)}…).`,
          "",
          `Version hint from file name: v${hint.versionName} (code ${hint.versionCode}).`,
          "",
          "Now send the version details: `<versionName> <versionCode> [notes]`",
          "Example: `1.2.3 42 Fixed uploads and added dark mode`",
        ].join("\n"),
        kb([[btn("🚀 Release", `rel:${release.id}`)], [btn("⬅️ Menu", "menu")]]),
      ),
    ];
  } catch (error) {
    const message = errorText(error);
    const hint = message.includes("TELEGRAM_ADMIN_BOT_TOKEN")
      ? " The backend admin bot token is not configured."
      : "";
    return [send(chatId, `❌ APK upload failed: ${message}${hint}`)];
  }
}

async function downloadTelegramFile(fileId: string): Promise<Uint8Array> {
  const { token, apiBase, configured } = getAdminBotTelegramConfig();
  if (!configured) {
    throw new Error("TELEGRAM_ADMIN_BOT_TOKEN is missing on the backend.");
  }
  const file = await adminBotApi<{ file_path?: string }>(token, apiBase, "getFile", { file_id: fileId });
  if (!file?.file_path) {
    throw new Error("Telegram did not return a download path for the file.");
  }
  const response = await fetch(`${apiBase}/file/bot${token}/${file.file_path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`Telegram file download failed (HTTP ${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function adminBotApi<T>(token: string, apiBase: string, method: string, body: Record<string, unknown>): Promise<T | null> {
  const response = await fetch(`${apiBase}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description ?? `HTTP ${response.status}`}`);
  }
  return payload.result ?? null;
}

// ── Announcement / maintenance menus ──

async function announcementMenu(chatId: number): Promise<BotOutbound[]> {
  const current = await getAnnouncement();
  const lines = [
    "📢 *Announcement*",
    "",
    current
      ? `Status: ✅ set (${fmtDate(current.updatedAt)})\n\n“${current.message.slice(0, 300)}”`
      : "Status: none",
  ];
  return [
    send(
      chatId,
      lines.join("\n"),
      kb([
        [btn("📝 Set announcement", "ann:set"), btn("🚫 Clear", "ann:clear")],
        [btn("⬅️ Menu", "menu")],
      ]),
    ),
  ];
}

async function maintenanceMenu(chatId: number): Promise<BotOutbound[]> {
  let enabled = false;
  let message: string | null = null;
  try {
    const state = await getSystemAuthorityState();
    enabled = state.maintenance.enabled;
    message = state.maintenance.message;
  } catch {
    // Fall through to a neutral status if the store is unavailable.
  }
  const lines = [
    "🔧 *Maintenance mode*",
    "",
    `Status: ${enabled ? "🟢 ON" : "⚪ OFF"}`,
    message ? `Message: ${message}` : "",
    "",
    "While ON, non-admin users cannot sign in, sign up, or access storage.",
  ].filter(Boolean);
  return [
    send(
      chatId,
      lines.join("\n"),
      kb([
        [btn("🟢 Enable", "maint:on"), btn("⚪ Disable", "maint:off")],
        [btn("⬅️ Menu", "menu")],
      ]),
    ),
  ];
}

// ── Callback dispatch ──

async function handleCallback(
  data: string,
  ctx: {
    chatId: number;
    messageId: number;
    callbackQueryId: string;
    actor: string;
    senderName: string;
    session: ChatSession;
  },
): Promise<BotOutbound[]> {
  const { chatId, messageId, callbackQueryId, actor, session } = ctx;
  const outbound: BotOutbound[] = [];

  const [head, ...rest] = data.split(":");
  const tail = rest.join(":");
  const action = (): BotOutbound => answer(callbackQueryId, "Working…");

  if (head === "menu") {
    outbound.push(action(), edit(chatId, messageId, `Welcome back. What would you like to do?`, mainMenuKeyboard()));
    return outbound;
  }
  if (head === "help") {
    outbound.push(action(), edit(chatId, messageId, helpText(), mainMenuKeyboard()));
    return outbound;
  }
  if (head === "stats") {
    outbound.push(action());
    const actions = await statistics(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "analytics") {
    outbound.push(action());
    const actions = await analytics(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "logs") {
    outbound.push(action());
    const actions = await logs(chatId, LOG_PAGE_SIZE);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "users") {
    outbound.push(action());
    const page = clampInt(tail, 0, 100_000, session.usersPage ?? 0);
    const actions = await userListPage(chatId, page, session);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "search") {
    session.pending = { kind: "search_users" };
    outbound.push(
      action(),
      edit(chatId, messageId, "🔍 Send a name, email, or part of one and I'll search the user database.", kb([[btn("⬅️ Menu", "menu")]])),
    );
    return outbound;
  }
  if (head === "subs") {
    outbound.push(action());
    const actions = await subscriptions(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "apk") {
    outbound.push(action());
    const actions = await handleCommand("/apk", chatId, actor, ctx.senderName, session);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "rels") {
    outbound.push(action());
    const actions = await releasesList(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "ann") {
    if (tail === "set") {
      session.pending = { kind: "announcement" };
      outbound.push(
        action(),
        edit(chatId, messageId, "📢 Send the announcement text. It will be shown to every user inside the app.", kb([[btn("⬅️ Back", "ann")]])),
      );
      return outbound;
    }
    if (tail === "clear") {
      try {
        await clearAnnouncement(actor);
        outbound.push(answer(callbackQueryId, "Cleared"));
        const actions = await announcementMenu(chatId);
        const sendAction = actions.find((a) => a.method === "sendMessage")!;
        outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
        return outbound;
      } catch (error) {
        outbound.push(action(), edit(chatId, messageId, `❌ ${errorText(error)}`, kb([[btn("⬅️ Back", "ann")]])));
        return outbound;
      }
    }
    outbound.push(action());
    const actions = await announcementMenu(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  if (head === "maint") {
    if (tail === "on" || tail === "off") {
      try {
        await setMaintenanceState(tail === "on", null, actor);
        outbound.push(answer(callbackQueryId, tail === "on" ? "Maintenance ON" : "Maintenance OFF"));
        const actions = await maintenanceMenu(chatId);
        const sendAction = actions.find((a) => a.method === "sendMessage")!;
        outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
        return outbound;
      } catch (error) {
        outbound.push(action(), edit(chatId, messageId, `❌ ${errorText(error)}`, kb([[btn("⬅️ Back", "maint")]])));
        return outbound;
      }
    }
    outbound.push(action());
    const actions = await maintenanceMenu(chatId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }

  if (head === "user") {
    const [userId, sub] = [rest[0] ?? "", rest[1] ?? ""];
    if (!userId) {
      outbound.push(action(), edit(chatId, messageId, "❌ Invalid user reference.", kb([[btn("⬅️ Back", "users")]])));
      return outbound;
    }
    if (sub === "ban") return withAnswer(outbound, action(), await applyUserStatus(userId, "banned", chatId, actor), chatId, messageId);
    if (sub === "unban") return withAnswer(outbound, action(), await applyUserStatus(userId, "active", chatId, actor), chatId, messageId);
    if (sub === "suspend") return withAnswer(outbound, action(), await applyUserStatus(userId, "suspended", chatId, actor), chatId, messageId);
    if (sub === "activate") return withAnswer(outbound, action(), await applyUserStatus(userId, "active", chatId, actor), chatId, messageId);
    if (sub === "cancel_premium") return withAnswer(outbound, action(), await cancelPremium(userId, chatId, actor), chatId, messageId);
    if (sub === "storage_off") return withAnswer(outbound, action(), await toggleStorage(userId, false, chatId, actor), chatId, messageId);
    if (sub === "storage_on") return withAnswer(outbound, action(), await toggleStorage(userId, true, chatId, actor), chatId, messageId);
    if (sub === "admin") return withAnswer(outbound, action(), await toggleAdmin(userId, true, chatId, actor), chatId, messageId);
    if (sub === "deadmin") return withAnswer(outbound, action(), await toggleAdmin(userId, false, chatId, actor), chatId, messageId);
    outbound.push(action());
    const actions = await userCard(chatId, userId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }

  if (head === "premium") {
    const [userId, daysText] = [rest[0] ?? "", rest[1] ?? ""];
    if (!userId) {
      outbound.push(action(), edit(chatId, messageId, "❌ Invalid user reference.", kb([[btn("⬅️ Back", "users")]])));
      return outbound;
    }
    if (daysText === "custom") {
      session.pending = { kind: "premium_custom", userId };
      outbound.push(
        answer(callbackQueryId, "Send days"),
        edit(chatId, messageId, "💳 For how many days? Send a number (max 3650).", kb([[btn("⬅️ Back", "user:" + userId)]])),
      );
      return outbound;
    }
    if (daysText) {
      const days = Number(daysText);
      if (!Number.isInteger(days) || days <= 0) {
        outbound.push(action(), edit(chatId, messageId, "❌ Invalid duration.", kb([[btn("⬅️ Back", "users")]])));
        return outbound;
      }
      return withAnswer(outbound, action(), await applyPremium(userId, days, chatId, actor), chatId, messageId);
    }
    session.pending = { kind: "premium_custom", userId };
    outbound.push(
      answer(callbackQueryId, "Choose duration"),
      edit(
        chatId,
        messageId,
        "💳 Grant premium for how long?",
        kb([
          [btn("7 days", "premium:" + userId + ":7"), btn("30 days", "premium:" + userId + ":30")],
          [btn("90 days", "premium:" + userId + ":90"), btn("365 days", "premium:" + userId + ":365")],
          [btn("✏️ Custom…", "premium:" + userId + ":custom")],
          [btn("⬅️ Back", "user:" + userId)],
        ]),
      ),
    );
    return outbound;
  }

  if (head === "rel") {
    const [releaseId, sub] = [rest[0] ?? "", rest[1] ?? ""];
    if (!releaseId) {
      outbound.push(action(), edit(chatId, messageId, "❌ Invalid release reference.", kb([[btn("⬅️ Back", "rels")]])));
      return outbound;
    }
    if (sub === "publish" || sub === "unpublish") {
      try {
        await publishRelease(releaseId, sub === "publish", actor);
        const release = await getReleaseById(releaseId);
        outbound.push(
          answer(callbackQueryId, sub === "publish" ? "Published 🚀" : "Unpublished"),
          edit(chatId, messageId, release ? releaseCardText(release) : "Release updated.", release ? releaseKeyboard(release) : undefined),
        );
        return outbound;
      } catch (error) {
        outbound.push(action(), edit(chatId, messageId, `❌ ${errorText(error)}`, kb([[btn("⬅️ Back", "rels")]])));
        return outbound;
      }
    }
    if (sub === "delete") {
      try {
        await deleteRelease(releaseId, actor);
        outbound.push(answer(callbackQueryId, "Deleted"));
        const actions = await releasesList(chatId);
        const sendAction = actions.find((a) => a.method === "sendMessage")!;
        outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
        return outbound;
      } catch (error) {
        outbound.push(action(), edit(chatId, messageId, `❌ ${errorText(error)}`, kb([[btn("⬅️ Back", "rels")]])));
        return outbound;
      }
    }
    if (sub === "version") {
      session.pending = { kind: "release_version", releaseId };
      outbound.push(
        answer(callbackQueryId, "Send version"),
        edit(
          chatId,
          messageId,
          "Send the version details: `<versionName> <versionCode> [notes]`\nExample: `1.2.3 42 Fixed uploads`",
          kb([[btn("⬅️ Back", "rel:" + releaseId)]]),
        ),
      );
      return outbound;
    }
    if (sub === "notes") {
      session.pending = { kind: "release_notes", releaseId };
      outbound.push(
        answer(callbackQueryId, "Send notes"),
        edit(chatId, messageId, "Send the release notes text.", kb([[btn("⬅️ Back", "rel:" + releaseId)]])),
      );
      return outbound;
    }
    outbound.push(action());
    const actions = await releaseCard(chatId, releaseId);
    const sendAction = actions.find((a) => a.method === "sendMessage")!;
    outbound.push(edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }

  outbound.push(
    answer(callbackQueryId, "Unknown action"),
    edit(chatId, messageId, "Unknown action. Use the menu.", mainMenuKeyboard()),
  );
  return outbound;
}

/** Convert a produced "sendMessage" plan into an edit of the current message. */
function withAnswer(
  outbound: BotOutbound[],
  ack: BotOutbound,
  actions: BotOutbound[],
  chatId: number,
  messageId: number,
): BotOutbound[] {
  const sendAction = actions.find((a) => a.method === "sendMessage");
  if (sendAction) {
    outbound.push(ack, edit(chatId, messageId, String(sendAction.params.text), sendAction.params.reply_markup as never));
    return outbound;
  }
  outbound.push(ack, ...actions.filter((a) => a.method !== "sendMessage"));
  return outbound;
}

// ── Small helpers ──

function clampInt(value: string, min: number, max: number, fallback: number): number {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function splitFirst(value: string): [string, string] {
  const index = value.search(/\s/);
  if (index === -1) return [value, ""];
  return [value.slice(0, index), value.slice(index + 1).trim()];
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 200);
  return "Something went wrong.";
}

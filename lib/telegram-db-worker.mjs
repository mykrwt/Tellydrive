// ---------------------------------------------------------------------------
// Standalone worker spawned by lib/telegram-db.ts so the synchronous sqlite
// layer can perform async Telegram I/O (download/upload) and block until it
// finishes. It must stay self-contained — no application imports.
//
// The SQLite metadata database is persisted as a Telegram document. The latest
// document's `file_id` is stored in the chat's *description* (setChatDescription
// / getChat), which is always rediscoverable from a stateless serverless
// function without any persistent local state.
//
//   restore:  read the TELYDB pointer from the chat description, download the
//             sqlite file into <localPath>.
//   flush:    upload the local sqlite file, then update the chat description
//             pointer to the new file_id.
//
// Exit codes:
//   0  success
//   2  bad usage / missing env
//   3  restore found no TELYDB pointer yet (brand-new install)
//   1  any other error
// ---------------------------------------------------------------------------

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[telegram-db] Missing env ${name}`);
  return v;
}

const TOKEN = need("TELEGRAM_BOT_TOKEN");
const CHAT_ID = need("TELEGRAM_CHAT_ID");

async function api(method, params) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`[telegram-db] ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result;
}

async function restore(localPath) {
  const { writeFileSync } = await import("node:fs");
  const chat = await api("getChat", { chat_id: CHAT_ID });
  const m = (chat.description || "").match(/TELYDB:([A-Za-z0-9_\-]+)/);
  if (!m) {
    throw new Error("[telegram-db] No TELYDB pointer found in chat description");
  }
  const fileId = m[1];
  const fi = await api("getFile", { file_id: fileId });
  if (!fi.file_path) {
    throw new Error("[telegram-db] Could not resolve DB file path");
  }
  const dl = await fetch(`${API}/file/bot${TOKEN}/${fi.file_path}`);
  if (!dl.ok) throw new Error("[telegram-db] Failed to download DB from Telegram");
  const buf = Buffer.from(await dl.arrayBuffer());
  writeFileSync(localPath, buf);
  console.error(`[telegram-db] restored ${buf.length} bytes from Telegram`);
}

async function flush(localPath) {
  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(localPath);
  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append("document", new Blob([new Uint8Array(buf)]), "tellybase.db");
  const res = await fetch(`${API}/bot${TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`[telegram-db] sendDocument failed: ${json.description ?? res.status}`);
  }
  const fileId = json.result.document.file_id;
  await api("setChatDescription", { chat_id: CHAT_ID, description: `TELYDB:${fileId}` });
  console.error(`[telegram-db] flushed ${buf.length} bytes -> ${fileId}`);
}

const mode = process.argv[2];
const localPath = process.argv[3];

let task;
if (mode === "restore") task = () => restore(localPath);
else if (mode === "flush") task = () => flush(localPath);

if (!task || !localPath) {
  console.error("[telegram-db] usage: node telegram-db-worker.mjs restore|flush <localPath>");
  process.exit(2);
}

task().then(
  () => process.exit(0),
  (err) => {
    const noPointer = /No TELYDB pointer/.test(err.message || "");
    console.error(err.message || err);
    process.exit(noPointer ? 3 : 1);
  },
);

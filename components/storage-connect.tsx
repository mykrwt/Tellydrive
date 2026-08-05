"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

// Lets a user connect their own Telegram bot + chat so their files are stored
// in *their* Telegram instead of the platform's shared backend.
export function StorageConnect({
  backend,
  hasOwn,
}: {
  backend: string;
  hasOwn: boolean;
}) {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [currentBackend, setCurrentBackend] = useState(backend);
  const [connected, setConnected] = useState(hasOwn);

  const save = async () => {
    setError(null);
    setOk(null);
    if (!botToken.trim() || !chatId.trim()) {
      setError("Please enter both a bot token and a chat id.");
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ backend: string; title?: string }>("/api/account/storage", {
        method: "PATCH",
        body: JSON.stringify({ botToken, chatId }),
      });
      setCurrentBackend(res.backend);
      setConnected(true);
      setBotToken("");
      setChatId("");
      setOk(
        res.title
          ? `Connected to “${res.title}”. Your files will now be stored there.`
          : "Connected. Your files will now be stored in your Telegram chat.",
      );
    } catch (e: any) {
      setError(e?.message ?? "Could not connect to Telegram.");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await api<{ backend: string }>("/api/account/storage", {
        method: "DELETE",
      });
      setCurrentBackend(res.backend);
      setConnected(false);
      setOk("Disconnected. Your files now use the platform storage backend.");
    } catch (e: any) {
      setError(e?.message ?? "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="settings-grid">
        <div className="settings-row">
          <span>Storage backend</span><b>{currentBackend}</b>
        </div>
        {connected && (
          <div className="settings-row">
            <span>Connected</span><b className="ok-text">✓ Your own Telegram</b>
          </div>
        )}
      </div>

      <p className="hint">
        Store your files in <strong>your own Telegram</strong> instead of the
        shared platform backend. Create a bot with{" "}
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>,
        add it as an admin to a private channel/group, and paste the token and chat id
        below. Your token is kept server-side and never shown to anyone else.
      </p>

      <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.6rem" }}>
        <label className="field">
          <span className="field-label">Telegram bot token</span>
          <input
            className="input"
            type="password"
            placeholder="123456789:AA…"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Telegram chat / channel id</span>
          <input
            className="input"
            type="text"
            placeholder="-1001234567890"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {ok && <p className="form-ok">{ok}</p>}

      <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem" }}>
        <button className="button button-primary" onClick={save} disabled={saving}>
          {saving ? "Connecting…" : "Connect my Telegram"}
        </button>
        {connected && (
          <button className="button button-quiet danger" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}

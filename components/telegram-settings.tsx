"use client";

import { useState } from "react";
import { updateTelegramSettingsAction } from "@/app/dashboard/storage-actions";

export function TelegramSettings({ initialToken, initialChatId }: { initialToken?: string; initialChatId?: string }) {
  const [token, setToken] = useState(initialToken || "");
  const [chatId, setChatId] = useState(initialChatId || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateTelegramSettingsAction(token, chatId);
      setMessage("Settings saved successfully!");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="storage-card telegram-settings-card">
      <div className="telegram-badge">
        <svg viewBox="0 0 32 32">
          <path d="M25.7 7.2 21.9 25c-.3 1.3-1 1.6-2.1 1l-5.8-4.3-2.8 2.7c-.3.3-.6.6-1.2.6l.4-5.9L21.2 9.3c.5-.4-.1-.7-.7-.3L7.2 17.4l-5.7-1.8c-1.2-.4-1.3-1.2.3-1.8L24.1 5.2c1-.4 1.9.2 1.6 2Z" />
        </svg>
      </div>
      <p className="eyebrow">Personal Storage Bot</p>
      <h2>Configure Telegram</h2>
      <p className="description">Enter your own Bot Token and Chat ID to enable private cloud storage.</p>
      
      <form onSubmit={handleSave} className="settings-form">
        <div className="field-group">
          <label>Bot Token</label>
          <div className="input-shell">
            <input 
              type="password" 
              value={token} 
              onChange={(e) => setToken(e.target.value)} 
              placeholder="123456789:ABCDEF..." 
              required
            />
          </div>
        </div>
        
        <div className="field-group">
          <label>Chat ID / Channel ID</label>
          <div className="input-shell">
            <input 
              type="text" 
              value={chatId} 
              onChange={(e) => setChatId(e.target.value)} 
              placeholder="-100..." 
              required
            />
          </div>
        </div>

        <button type="submit" className="primary-button save-button" disabled={saving}>
          {saving ? <span className="spinner" /> : "Save Configuration"}
        </button>
        
        {message && <p className={`status-msg ${message.includes("success") ? "success" : "error"}`}>{message}</p>}
      </form>

      <style jsx>{`
        .telegram-settings-card {
          display: flex;
          flex-direction: column;
        }
        .description {
          margin-bottom: 20px;
          font-size: 12px;
          color: #7d8c94;
        }
        .settings-form {
          display: grid;
          gap: 15px;
        }
        .field-group {
          display: grid;
          gap: 6px;
        }
        .field-group label {
          font-size: 11px;
          color: #68757d;
          font-weight: 600;
        }
        .input-shell input {
          width: 100%;
          height: 38px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          padding: 0 12px;
          font-size: 13px;
        }
        .save-button {
          height: 40px;
          margin-top: 5px;
        }
        .status-msg {
          font-size: 11px;
          text-align: center;
          margin-top: 10px;
        }
        .status-msg.success { color: #58cb90; }
        .status-msg.error { color: #ff8585; }
      `}</style>
    </aside>
  );
}

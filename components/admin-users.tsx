"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { formatBytes } from "@/lib/format";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  plan: string;
  plan_id?: number;
  storage_used_bytes: number;
  files: number;
  is_suspended: number;
  is_admin: number;
}

export function AdminUsers({
  initial,
  plans,
}: {
  initial: AdminUser[];
  plans: { id: number; name: string }[];
}) {
  const [users, setUsers] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    const data = await api<{ users: AdminUser[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setUsers(data.users);
  };

  const setSuspended = async (u: AdminUser, val: boolean) => {
    setBusy(u.id);
    await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ suspended: val }) });
    setBusy(null);
    reload();
  };
  const setPlan = async (u: AdminUser, planId: number) => {
    setBusy(u.id);
    await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ plan_id: planId }) });
    setBusy(null);
    reload();
  };
  const del = async (u: AdminUser) => {
    if (!confirm(`Delete user ${u.email ?? u.id} and all their data?`)) return;
    await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
    reload();
  };

  return (
    <div className="card">
      <div className="card-toolbar">
        <input className="search-input" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="button button-primary" onClick={reload}>Search</button>
      </div>
      <table className="data-table">
        <thead>
          <tr><th>User</th><th>Plan</th><th>Storage</th><th>Files</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.name ?? "—"}</b><small className="block hint">{u.email ?? u.id}</small></td>
              <td>
                <select value={u.plan_id ?? plans.find((p) => p.name === u.plan)?.id} onChange={(e) => setPlan(u, Number(e.target.value))} disabled={busy === u.id}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </td>
              <td>{formatBytes(u.storage_used_bytes)}</td>
              <td>{u.files}</td>
              <td>{u.is_suspended ? <span className="pill pill-err">Suspended</span> : <span className="pill pill-ok">Active</span>}</td>
              <td className="row-actions">
                <button className="button button-quiet" onClick={() => setSuspended(u, !u.is_suspended)}>
                  {u.is_suspended ? "Re-enable" : "Suspend"}
                </button>
                <button className="button button-quiet danger" onClick={() => del(u)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

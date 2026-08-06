"use client";

import { useState, useTransition } from "react";
import type { AdminUserRow } from "@/lib/telegram-store";
import { formatBytes, formatDate } from "@/components/file-manager/helpers";
import { setUserRoleAction } from "@/app/dashboard/admin-actions";

export function UserTable({ users, currentAdminId }: { users: AdminUserRow[]; currentAdminId: string }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const changeRole = (userId: string, role: "admin" | "user") => {
    setNotice(null);
    startTransition(async () => {
      const res = await setUserRoleAction(userId, role);
      if (!res.ok) setNotice(res.error ?? "Could not update role");
      else window.location.reload();
    });
  };

  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <div>
          <h3>Users</h3>
          <p>Accounts on this instance. Promote users to admins to give them access to this page.</p>
        </div>
      </div>
      {notice && <div className="ad-notice">{notice}</div>}
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Files</th>
              <th>Storage</th>
              <th>Joined</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="ad-user">
                    <span className="ad-avatar">{u.name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <span className="ad-user-name">
                        {u.name}
                        {u.id === currentAdminId && <span className="mini-badge">you</span>}
                      </span>
                      <span className="ad-user-email">{u.email}</span>
                    </div>
                  </div>
                </td>
                <td className="muted">{u.fileCount}</td>
                <td className="muted">{formatBytes(u.totalBytes)}</td>
                <td className="muted">{formatDate(u.createdAt)}</td>
                <td>
                  {u.id === currentAdminId ? (
                    <span className="mini-badge admin">admin</span>
                  ) : (
                    <select
                      className="ad-role-select"
                      value={u.role === "admin" ? "admin" : "user"}
                      disabled={pending}
                      onChange={(e) => changeRole(u.id, e.target.value as "admin" | "user")}
                      aria-label={`Role for ${u.name}`}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

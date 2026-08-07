"use client";

import { useState, useTransition } from "react";
import { formatBytes, formatDate } from "@/components/file-manager/helpers";
import { setUserRoleAction } from "@/app/dashboard/admin-actions";

type AdminUserRowView = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | undefined;
  createdAt: string;
  lastLoginAt: string | null;
  fileCount: number;
  totalBytes: number;
};

export function UserTable({ users, currentAdminId }: { users: AdminUserRowView[]; currentAdminId: string }) {
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
    <section className="tb-panel tb-admin-panel">
      <div className="tb-panel-head">
        <div>
          <span className="tb-panel-label">Users</span>
          <h2>Account access</h2>
          <p>Promote trusted members to admins and keep an eye on space usage per user.</p>
        </div>
        <span className="tb-inline-pill subtle">{users.length} accounts</span>
      </div>

      {notice ? <div className="tb-admin-notice">{notice}</div> : null}

      <div className="tb-admin-table-wrap">
        <div className="tb-admin-table-head">
          <span>User</span>
          <span>Files</span>
          <span>Storage</span>
          <span>Joined</span>
          <span>Role</span>
        </div>

        {users.map((user) => (
          <div key={user.id} className="tb-admin-table-row">
            <div className="tb-admin-user-cell">
              <span className="tb-admin-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>
                  {user.name}
                  {user.id === currentAdminId ? <em className="tb-inline-pill subtle">You</em> : null}
                </strong>
                <span>{user.email}</span>
              </div>
            </div>
            <span className="tb-list-muted">{user.fileCount}</span>
            <span className="tb-list-muted">{formatBytes(user.totalBytes)}</span>
            <span className="tb-list-muted">{formatDate(user.createdAt)}</span>
            <div>
              {user.id === currentAdminId ? (
                <span className="tb-inline-pill">Admin</span>
              ) : (
                <label className="tb-select-wrap small">
                  <select
                    value={user.role === "admin" ? "admin" : "user"}
                    disabled={pending}
                    onChange={(event) => changeRole(user.id, event.target.value as "admin" | "user")}
                    aria-label={`Role for ${user.name}`}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

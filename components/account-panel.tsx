"use client";

import { SignOutButton } from "@clerk/nextjs";
import { formatDate } from "@/lib/format";

export function AccountPanel({
  name,
  email,
  planName,
  backend,
  createdAt,
}: {
  name: string | null;
  email: string | null;
  planName: string;
  backend: string;
  createdAt: string;
}) {
  return (
    <div className="card">
      <div className="settings-grid">
        <div className="settings-row">
          <span>Name</span><b>{name ?? "—"}</b>
        </div>
        <div className="settings-row">
          <span>Email</span><b>{email ?? "—"}</b>
        </div>
        <div className="settings-row">
          <span>Plan</span><b>{planName}</b>
        </div>
        <div className="settings-row">
          <span>Storage backend</span><b>{backend}</b>
        </div>
        <div className="settings-row">
          <span>Member since</span><b>{formatDate(createdAt)}</b>
        </div>
      </div>
      <p className="hint">
        Profile details (name, email, password) are managed through your Clerk account.
      </p>
      <SignOutButton>
        <button className="button button-quiet danger">Sign out</button>
      </SignOutButton>
    </div>
  );
}

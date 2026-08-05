import { db } from "@/lib/db";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  image_url: string | null;
  plan_id: number;
  storage_used_bytes: number;
  is_suspended: number;
  is_admin: number;
  created_at: string;
  last_active_at: string | null;
}

export interface PlanRow {
  id: number;
  name: string;
  price_monthly: number;
  storage_bytes: number;
  max_upload_bytes: number;
  features: string;
  is_default: number;
  active: number;
  sort_order: number;
}

const adminCache = new Map<string, boolean>();

export function isAdminClerkId(clerkId: string): boolean {
  const cached = adminCache.get(clerkId);
  if (cached !== undefined) return cached;
  const stored = (
    db().prepare("SELECT value FROM settings WHERE key='admin_user_ids'").get() as
      | { value: string }
      | undefined
  )?.value ?? "[]";
  const ids: string[] = JSON.parse(stored);
  const result = ids.includes(clerkId);
  adminCache.set(clerkId, result);
  return result;
}

function planForUser(): PlanRow {
  const plan = db()
    .prepare("SELECT * FROM plans WHERE is_default=1 AND active=1 LIMIT 1")
    .get() as PlanRow | undefined;
  return (
    plan ??
    (db().prepare("SELECT * FROM plans LIMIT 1").get() as PlanRow)
  );
}

export function getOrCreateUser(clerkId: string, profile?: { email?: string; name?: string; image_url?: string }) {
  const d = db();
  let user = d.prepare("SELECT * FROM users WHERE id=?").get(clerkId) as
    | UserRow
    | undefined;
  if (!user) {
    const plan = planForUser();
    d.prepare(
      `INSERT INTO users (id, email, name, image_url, plan_id, is_admin, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      clerkId,
      profile?.email ?? null,
      profile?.name ?? null,
      profile?.image_url ?? null,
      plan.id,
      isAdminClerkId(clerkId) ? 1 : 0,
    );
    user = d.prepare("SELECT * FROM users WHERE id=?").get(clerkId) as UserRow;
    d.prepare(
      "INSERT INTO activity (user_id, type, detail) VALUES (?, 'account.created', ?)",
    ).run(clerkId, "Account created");
  } else {
    d.prepare(
      "UPDATE users SET last_active_at=datetime('now'), email=COALESCE(?, email), name=COALESCE(?, name) WHERE id=?",
    ).run(profile?.email ?? null, profile?.name ?? null, clerkId);
  }
  return user as UserRow;
}

export function getUser(clerkId: string): UserRow | null {
  const u = db().prepare("SELECT * FROM users WHERE id=?").get(clerkId) as
    | UserRow
    | undefined;
  return u ?? null;
}

export function getUserWithPlan(clerkId: string) {
  const user = getUser(clerkId);
  if (!user) return null;
  const plan = db()
    .prepare("SELECT * FROM plans WHERE id=?")
    .get(user.plan_id) as PlanRow;
  return { user, plan };
}

export function getPlan(planId: number): PlanRow {
  return db().prepare("SELECT * FROM plans WHERE id=?").get(planId) as PlanRow;
}

export function listActivePlans(): PlanRow[] {
  return db()
    .prepare("SELECT * FROM plans WHERE active=1 ORDER BY sort_order")
    .all() as PlanRow[];
}

export function listAllPlans(): PlanRow[] {
  return db().prepare("SELECT * FROM plans ORDER BY sort_order").all() as PlanRow[];
}

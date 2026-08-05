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

const DEFAULT_FREE_PLAN: PlanRow = {
  id: 1,
  name: "Free",
  price_monthly: 0,
  storage_bytes: 10 * 1024 * 1024 * 1024,
  max_upload_bytes: 2 * 1024 * 1024 * 1024,
  features: JSON.stringify([
    "Images & video uploads",
    "Folders & simple search",
    "Secure account access",
  ]),
  is_default: 1,
  active: 1,
  sort_order: 0,
};

const adminCache = new Map<string, boolean>();

export function isAdminClerkId(clerkId: string): boolean {
  const cached = adminCache.get(clerkId);
  if (cached !== undefined) return cached;
  try {
    const stored = (
      db().prepare("SELECT value FROM settings WHERE key='admin_user_ids'").get() as
        | { value: string }
        | undefined
    )?.value ?? "[]";
    const ids: string[] = JSON.parse(stored);
    const result = ids.includes(clerkId);
    adminCache.set(clerkId, result);
    return result;
  } catch {
    return false;
  }
}

export function planForUser(): PlanRow {
  try {
    const plan = db()
      .prepare("SELECT * FROM plans WHERE is_default=1 AND active=1 LIMIT 1")
      .get() as PlanRow | undefined;
    if (plan) return plan;
    const fallback = db().prepare("SELECT * FROM plans LIMIT 1").get() as
      | PlanRow
      | undefined;
    if (fallback) return fallback;
  } catch {
    /* fallback to default */
  }
  return DEFAULT_FREE_PLAN;
}

// Throttle last_active_at updates so reading pages doesn't write to the DB
// (and, in turn, trigger a Telegram DB flush) on every request.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

function lastActiveAgeMs(ts: string | null): number | null {
  if (!ts) return null;
  // stored as UTC "YYYY-MM-DD HH:MM:SS" (sqlite datetime('now'))
  const parsed = Date.parse(ts.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed)) return null;
  return Date.now() - parsed;
}

export function getOrCreateUser(
  clerkId: string,
  profile?: { email?: string; name?: string; image_url?: string },
): UserRow {
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
    try {
      d.prepare(
        "INSERT INTO activity (user_id, type, detail) VALUES (?, 'account.created', ?)",
      ).run(clerkId, "Account created");
    } catch {
      /* ignore activity insert error */
    }
  } else {
    const activeAge = lastActiveAgeMs(user.last_active_at);
    const needsActive =
      activeAge === null || activeAge > LAST_ACTIVE_THROTTLE_MS;
    const emailChanged = Boolean(profile?.email) && profile?.email !== user.email;
    const nameChanged = Boolean(profile?.name) && profile?.name !== user.name;
    const imageChanged = Boolean(profile?.image_url) && profile?.image_url !== user.image_url;

    // Only write when something actually changed — this keeps the hot read path
    // (which calls getOrCreateUser on every request) from writing to the DB and
    // triggering a Telegram flush on every page load.
    if (needsActive || emailChanged || nameChanged || imageChanged) {
      d.prepare(
        "UPDATE users SET last_active_at=datetime('now'), email=COALESCE(?, email), name=COALESCE(?, name), image_url=COALESCE(?, image_url) WHERE id=?",
      ).run(
        profile?.email ?? null,
        profile?.name ?? null,
        profile?.image_url ?? null,
        clerkId,
      );
      user = d.prepare("SELECT * FROM users WHERE id=?").get(clerkId) as UserRow;
    }
  }
  return user;
}

export function getUser(clerkId: string): UserRow | null {
  try {
    const u = db().prepare("SELECT * FROM users WHERE id=?").get(clerkId) as
      | UserRow
      | undefined;
    return u ?? null;
  } catch {
    return null;
  }
}

export function getUserWithPlan(clerkId: string) {
  const user = getUser(clerkId);
  if (!user) return null;
  const plan = getPlan(user.plan_id);
  return { user, plan };
}

export function getPlan(planId: number): PlanRow {
  try {
    const plan = db().prepare("SELECT * FROM plans WHERE id=?").get(planId) as
      | PlanRow
      | undefined;
    if (plan) return plan;
  } catch {
    /* fallback */
  }
  return planForUser();
}

export function listActivePlans(): PlanRow[] {
  try {
    return db()
      .prepare("SELECT * FROM plans WHERE active=1 ORDER BY sort_order")
      .all() as PlanRow[];
  } catch {
    return [DEFAULT_FREE_PLAN];
  }
}

export function listAllPlans(): PlanRow[] {
  try {
    return db().prepare("SELECT * FROM plans ORDER BY sort_order").all() as PlanRow[];
  } catch {
    return [DEFAULT_FREE_PLAN];
  }
}

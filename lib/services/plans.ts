import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activity";
import { listActivePlans, type PlanRow } from "@/lib/services/users";

export function listPlans(): PlanRow[] {
  return listActivePlans();
}

export function changeUserPlan(userId: string, planId: number) {
  const plan = db().prepare("SELECT * FROM plans WHERE id=?").get(planId) as
    | PlanRow
    | undefined;
  if (!plan || !plan.active) throw new Error("Invalid plan");
  const user = db().prepare("SELECT plan_id FROM users WHERE id=?").get(userId) as
    | { plan_id: number }
    | undefined;
  if (!user) throw new Error("User not found");
  db().prepare("UPDATE users SET plan_id=? WHERE id=?").run(plan.id, userId);
  logActivity(userId, "plan.changed", `Switched to ${plan.name} plan`);
  return plan;
}

// --- Admin plan management -------------------------------------------------

export function adminCreatePlan(input: {
  name: string;
  price_monthly: number;
  storage_gb: number;
  max_upload_mb: number;
  features: string[];
  is_default: boolean;
}) {
  const MB = 1024 * 1024;
  const GB = MB * 1024;
  const existing = db().prepare("SELECT id FROM plans WHERE name=?").get(input.name);
  if (existing) throw new Error("A plan with that name already exists");
  const maxSort = db().prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM plans").get() as { m: number };
  db()
    .prepare(
      `INSERT INTO plans (name, price_monthly, storage_bytes, max_upload_bytes, features, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.price_monthly,
      Math.round(input.storage_gb * GB),
      Math.round(input.max_upload_mb * MB),
      JSON.stringify(input.features),
      input.is_default ? 1 : 0,
      maxSort.m + 1,
    );
  if (input.is_default) {
    db().prepare("UPDATE plans SET is_default=0 WHERE name!=?").run(input.name);
  }
  return true;
}

export function adminUpdatePlan(
  planId: number,
  input: Partial<{
    name: string;
    price_monthly: number;
    storage_gb: number;
    max_upload_mb: number;
    features: string[];
    is_default: boolean;
    active: boolean;
  }>,
) {
  const MB = 1024 * 1024;
  const GB = MB * 1024;
  const plan = db().prepare("SELECT * FROM plans WHERE id=?").get(planId) as
    | PlanRow
    | undefined;
  if (!plan) throw new Error("Plan not found");
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    const dup = db().prepare("SELECT id FROM plans WHERE name=? AND id!=?").get(input.name, planId);
    if (dup) throw new Error("A plan with that name already exists");
    sets.push("name=?");
    params.push(input.name);
  }
  if (input.price_monthly !== undefined) {
    sets.push("price_monthly=?");
    params.push(input.price_monthly);
  }
  if (input.storage_gb !== undefined) {
    sets.push("storage_bytes=?");
    params.push(Math.round(input.storage_gb * GB));
  }
  if (input.max_upload_mb !== undefined) {
    sets.push("max_upload_bytes=?");
    params.push(Math.round(input.max_upload_mb * MB));
  }
  if (input.features !== undefined) {
    sets.push("features=?");
    params.push(JSON.stringify(input.features));
  }
  if (input.is_default !== undefined) {
    sets.push("is_default=?");
    params.push(input.is_default ? 1 : 0);
    if (input.is_default) {
      db().prepare("UPDATE plans SET is_default=0 WHERE id!=?").run(planId);
    }
  }
  if (input.active !== undefined) {
    sets.push("active=?");
    params.push(input.active ? 1 : 0);
  }
  if (sets.length) {
    params.push(planId);
    db().prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id=?`).run(...params);
  }
  return true;
}

export function adminDeletePlan(planId: number) {
  const plan = db().prepare("SELECT * FROM plans WHERE id=?").get(planId) as
    | PlanRow
    | undefined;
  if (!plan) throw new Error("Plan not found");
  const users = db().prepare("SELECT COUNT(*) AS c FROM users WHERE plan_id=?").get(planId) as { c: number };
  if (users.c > 0) throw new Error("Cannot delete a plan that is in use");
  if (plan.is_default) throw new Error("Cannot delete the default plan");
  db().prepare("DELETE FROM plans WHERE id=?").run(planId);
  return true;
}

export function listTrashSettings(): number {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key='recycle_retention_days'")
    .get() as { value: string } | undefined;
  return Number(row?.value ?? 30);
}

export function setRecycleRetention(days: number) {
  db()
    .prepare("INSERT INTO settings (key,value) VALUES ('recycle_retention_days',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(days));
}

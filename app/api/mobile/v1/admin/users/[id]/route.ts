import { NextRequest } from "next/server";
import { authorityErrorPayload, authorizeRequest } from "@/lib/backend-authority";
import { checkRateLimitWithIp } from "@/lib/rate-limit";
import {
  setUserRole,
  updateUserAuthorityPolicy,
  type AccountStatus,
  type StorageAccess,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "@/lib/telegram-store";
import { mobileJson, readMobileJson, requestIp } from "@/app/api/mobile/v1/_shared";

const ID = /^[a-zA-Z0-9_-]{6,64}$/;
const ACCOUNT_STATUSES = new Set<AccountStatus>(["active", "suspended", "banned"]);
const STORAGE_ACCESS = new Set<StorageAccess>(["enabled", "disabled"]);
const SUBSCRIPTION_TIERS = new Set<SubscriptionTier>(["free", "premium"]);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(["active", "inactive", "past_due", "cancelled"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let principal;
  try {
    principal = await authorizeRequest("admin:write");
    checkRateLimitWithIp(principal.user.id, requestIp(request), "adminWrite");
  } catch (error) {
    if ((error as { status?: number }).status === 429) {
      return mobileJson({ error: "Too many requests. Try again soon." }, { status: 429 });
    }
    const failure = authorityErrorPayload(error);
    return mobileJson(failure.body, { status: failure.status });
  }

  const { id } = await params;
  if (!ID.test(id)) return mobileJson({ error: "Invalid user id" }, { status: 400 });
  const body = await readMobileJson(request);
  if (!body) return mobileJson({ error: "Invalid request" }, { status: 400 });

  const role = body.role;
  const accountStatus = body.accountStatus;
  const storageAccess = body.storageAccess;
  const subscription = body.subscription;
  if (role !== undefined && role !== "admin" && role !== "user") {
    return mobileJson({ error: "Role must be admin or user." }, { status: 400 });
  }
  if (accountStatus !== undefined && !ACCOUNT_STATUSES.has(accountStatus as AccountStatus)) {
    return mobileJson({ error: "Invalid account status." }, { status: 400 });
  }
  if (storageAccess !== undefined && !STORAGE_ACCESS.has(storageAccess as StorageAccess)) {
    return mobileJson({ error: "Invalid storage access." }, { status: 400 });
  }

  let subscriptionPatch:
    | { tier: SubscriptionTier; status: SubscriptionStatus; expiresAt?: string | null }
    | undefined;
  if (subscription !== undefined) {
    if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
      return mobileJson({ error: "Invalid subscription policy." }, { status: 400 });
    }
    const value = subscription as Record<string, unknown>;
    if (!SUBSCRIPTION_TIERS.has(value.tier as SubscriptionTier) || !SUBSCRIPTION_STATUSES.has(value.status as SubscriptionStatus)) {
      return mobileJson({ error: "Invalid subscription policy." }, { status: 400 });
    }
    const expiresAt = value.expiresAt;
    if (!(expiresAt === undefined || expiresAt === null || (typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt))))) {
      return mobileJson({ error: "Invalid subscription expiration." }, { status: 400 });
    }
    subscriptionPatch = {
      tier: value.tier as SubscriptionTier,
      status: value.status as SubscriptionStatus,
      expiresAt: expiresAt as string | null | undefined,
    };
  }

  if (role === undefined && accountStatus === undefined && storageAccess === undefined && !subscriptionPatch) {
    return mobileJson({ error: "No authority policy change supplied." }, { status: 400 });
  }
  if (
    id === principal.user.id &&
    (role !== undefined || accountStatus === "suspended" || accountStatus === "banned" || storageAccess === "disabled")
  ) {
    return mobileJson({ error: "You cannot revoke your own backend access." }, { status: 400 });
  }

  try {
    if (role !== undefined) await setUserRole(id, role);
    if (accountStatus !== undefined || storageAccess !== undefined || subscriptionPatch) {
      await updateUserAuthorityPolicy(id, {
        accountStatus: accountStatus as AccountStatus | undefined,
        storageAccess: storageAccess as StorageAccess | undefined,
        subscription: subscriptionPatch,
      });
    }
    return mobileJson({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update account authority.";
    return mobileJson({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}

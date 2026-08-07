import "server-only";

import { isAdminIdentity } from "@/lib/server/admin-identity";
import { getCurrentUser, type SafeUser } from "@/lib/auth";
import {
  getSystemAuthorityState,
  type AccountStatus,
  type StorageAccess,
  type SubscriptionStatus,
  type SubscriptionTier,
  type SystemAuthorityState,
} from "@/lib/telegram-store";
import { MAX_FILE_SIZE_BYTES } from "@/lib/upload-config";

export type AuthorityAction =
  | "account:read"
  | "storage:read"
  | "storage:write"
  | "storage:upload"
  | "storage:download"
  | "premium:use"
  | "admin:read"
  | "admin:write";

export type AuthorityProfile = Readonly<{
  accountStatus: AccountStatus;
  subscription: Readonly<{
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    expiresAt: string | null;
    premiumActive: boolean;
  }>;
  storageAccess: StorageAccess;
  entitlements: Readonly<{
    premiumFeatures: boolean;
    storage: boolean;
    uploads: boolean;
    downloads: boolean;
    maxUploadBytes: number;
  }>;
}>;

export type AuthorizedPrincipal = Readonly<{
  user: SafeUser;
  isAdmin: boolean;
  authority: AuthorityProfile;
  system: SystemAuthorityState;
}>;

export class AuthorityError extends Error {
  constructor(
    public readonly code:
      | "unauthenticated"
      | "account_suspended"
      | "account_banned"
      | "maintenance"
      | "storage_disabled"
      | "subscription_required"
      | "forbidden",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthorityError";
  }
}

function activePremiumSubscription(user: SafeUser): boolean {
  const subscription = user.subscription;
  if (subscription?.tier !== "premium" || subscription.status !== "active") return false;
  if (!subscription.expiresAt) return true;
  const expiry = Date.parse(subscription.expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function resolveAuthorityProfile(user: SafeUser): AuthorityProfile {
  const accountStatus: AccountStatus = user.accountStatus ?? "active";
  const tier: SubscriptionTier = user.subscription?.tier === "premium" ? "premium" : "free";
  const subscriptionStatus: SubscriptionStatus =
    user.subscription?.status === "active" ||
    user.subscription?.status === "inactive" ||
    user.subscription?.status === "past_due" ||
    user.subscription?.status === "cancelled"
      ? user.subscription.status
      : tier === "free"
        ? "active"
        : "inactive";
  const storageAccess: StorageAccess = user.storageAccess === "disabled" ? "disabled" : "enabled";
  const premiumActive = activePremiumSubscription(user);
  const active = accountStatus === "active";
  const storage = active && storageAccess === "enabled";
  return Object.freeze({
    accountStatus,
    subscription: Object.freeze({
      tier,
      status: subscriptionStatus,
      expiresAt: user.subscription?.expiresAt ?? null,
      premiumActive,
    }),
    storageAccess,
    entitlements: Object.freeze({
      premiumFeatures: active && premiumActive,
      storage,
      uploads: storage,
      downloads: storage,
      maxUploadBytes: MAX_FILE_SIZE_BYTES,
    }),
  });
}

function enforceAccountState(profile: AuthorityProfile): void {
  if (profile.accountStatus === "banned") {
    throw new AuthorityError("account_banned", 403, "This account is not permitted to access TellyBase.");
  }
  if (profile.accountStatus === "suspended") {
    throw new AuthorityError("account_suspended", 403, "This account is temporarily suspended.");
  }
}

function enforceMaintenance(system: SystemAuthorityState, isAdmin: boolean): void {
  if (system.maintenance.enabled && !isAdmin) {
    throw new AuthorityError(
      "maintenance",
      503,
      system.maintenance.message || "TellyBase is temporarily unavailable for maintenance.",
    );
  }
}

export async function assertPublicSignupAllowed(): Promise<void> {
  const system = await getSystemAuthorityState();
  enforceMaintenance(system, false);
}

export async function assertIdentityCanStartSession(user: SafeUser): Promise<AuthorityProfile> {
  const profile = resolveAuthorityProfile(user);
  enforceAccountState(profile);
  const system = await getSystemAuthorityState();
  enforceMaintenance(system, isAdminIdentity(user));
  return profile;
}

export async function authorizeRequest(action: AuthorityAction): Promise<AuthorizedPrincipal> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorityError("unauthenticated", 401, "Unauthorized");

  const authority = resolveAuthorityProfile(user);
  enforceAccountState(authority);
  const isAdmin = isAdminIdentity(user);
  const system = await getSystemAuthorityState();
  enforceMaintenance(system, isAdmin);

  if ((action === "admin:read" || action === "admin:write") && !isAdmin) {
    throw new AuthorityError("forbidden", 403, "Forbidden");
  }
  if (action.startsWith("storage:") && !authority.entitlements.storage) {
    throw new AuthorityError("storage_disabled", 403, "Storage access is disabled for this account.");
  }
  if (action === "storage:upload" && !authority.entitlements.uploads) {
    throw new AuthorityError("storage_disabled", 403, "Uploads are disabled for this account.");
  }
  if (action === "storage:download" && !authority.entitlements.downloads) {
    throw new AuthorityError("storage_disabled", 403, "Downloads are disabled for this account.");
  }
  if (action === "premium:use" && !authority.entitlements.premiumFeatures) {
    throw new AuthorityError("subscription_required", 403, "An active premium subscription is required.");
  }

  return Object.freeze({ user, isAdmin, authority, system });
}

export function authorityErrorPayload(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof AuthorityError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: "The backend authority service is temporarily unavailable.", code: "authority_unavailable" } };
}

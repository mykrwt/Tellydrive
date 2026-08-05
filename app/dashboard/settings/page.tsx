import { currentUser } from "@/lib/auth";
import { getUser, getPlan } from "@/lib/services/users";
import { storageLabel } from "@/lib/storage";
import { AccountPanel } from "@/components/account-panel";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;
  const row = getUser(user.id);
  const plan = getPlan(user.plan_id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ACCOUNT SETTINGS</p>
          <h1>Manage your account</h1>
          <p>Your profile, plan and storage details.</p>
        </div>
      </div>
      <AccountPanel
        name={row?.name ?? null}
        email={row?.email ?? null}
        planName={plan.name}
        backend={storageLabel()}
        createdAt={user.created_at}
      />
    </>
  );
}

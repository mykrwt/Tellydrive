import { currentUser } from "@/lib/auth";
import { getUser, getPlan } from "@/lib/services/users";
import { storageLabel } from "@/lib/storage";
import { AccountPanel } from "@/components/account-panel";
import { StorageConnect } from "@/components/storage-connect";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;
  const row = getUser(user.id);
  const plan = getPlan(user.plan_id);
  const hasOwn = Boolean(row?.tg_bot_token && row?.tg_chat_id);

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
        backend={storageLabel(row)}
        createdAt={user.created_at}
      />
      <div className="section-block">
        <h2 className="section-title">Your storage</h2>
        <StorageConnect
          backend={storageLabel(row)}
          hasOwn={hasOwn}
        />
      </div>
    </>
  );
}

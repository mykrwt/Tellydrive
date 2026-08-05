import { currentUser } from "@/lib/auth";
import { getUser } from "@/lib/services/users";
import { listPlans } from "@/lib/services/plans";
import { userOverview } from "@/lib/services/stats";
import { formatBytes } from "@/lib/config";
import { PlanSelector } from "@/components/plan-selector";

export default async function PlansPage() {
  const user = await currentUser();
  if (!user) return null;
  const plans = listPlans();
  const row = getUser(user.id);
  const overview = userOverview(user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> PLANS & BILLING</p>
          <h1>Pick your storage plan</h1>
          <p>Upgrade or downgrade any time. Billing cycles monthly.</p>
        </div>
      </div>
      <div className="card current-plan-banner">
        <div>
          <h3>Your usage</h3>
          <strong>{formatBytes(overview.storageUsedBytes)}</strong>
          <span>used of {formatBytes(overview.storageLimitBytes)}</span>
          <div className="big-progress"><i style={{ width: `${overview.storageLimitBytes ? Math.min(100, (overview.storageUsedBytes / overview.storageLimitBytes) * 100) : 0}%` }} /></div>
        </div>
      </div>
      <PlanSelector plans={plans} currentPlanId={row?.plan_id ?? plans[0]?.id ?? 1} />
    </>
  );
}

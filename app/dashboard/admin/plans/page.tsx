import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listAllPlans } from "@/lib/services/users";
import { AdminPlans } from "@/components/admin-plans";

export default async function AdminPlansPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.is_admin) redirect("/dashboard");
  const plans = listAllPlans();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ADMIN · PLANS</p>
          <h1>Subscription management</h1>
          <p>Create, edit, price and configure storage quotas for plans.</p>
        </div>
      </div>
      <AdminPlans initial={plans as any} />
    </>
  );
}

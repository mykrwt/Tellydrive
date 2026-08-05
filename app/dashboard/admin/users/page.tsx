import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listAllPlans } from "@/lib/services/users";
import { AdminUsers } from "@/components/admin-users";

export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.is_admin) redirect("/dashboard");

  const users = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_suspended, u.is_admin, u.storage_used_bytes,
              u.created_at, u.last_active_at, COALESCE(p.name, 'Free') AS plan, COALESCE(p.id, 1) AS plan_id,
              (SELECT COUNT(*) FROM files f WHERE f.user_id=u.id AND f.deleted_at IS NULL) AS files
       FROM users u LEFT JOIN plans p ON p.id=u.plan_id ORDER BY u.created_at DESC`,
    )
    .all() as any[];
  const plans = listAllPlans().map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><span /> ADMIN · USERS</p>
          <h1>Manage users</h1>
          <p>View, suspend, change plans and delete user accounts.</p>
        </div>
      </div>
      <AdminUsers initial={users} plans={plans} />
    </>
  );
}

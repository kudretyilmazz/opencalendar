import type { ReactNode } from "react";
import { PAGE_CLASS } from "@/components/page-header";
import { AdminTabs } from "@/features/instance/components/admin-tabs";
import { requireAdmin } from "@/lib/auth/session";

/** Instance administration (ADM-009, ADM-011): admins only; every action re-checks the role. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className={PAGE_CLASS}>
      <AdminTabs />
      {children}
    </div>
  );
}

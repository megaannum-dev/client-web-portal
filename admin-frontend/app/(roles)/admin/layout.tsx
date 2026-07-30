import { getAudit, getMatrix, getOverrides, getStaff } from "@/app/(roles)/admin/actions";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AdminStoreProvider } from "@/lib/admin/AdminStoreContext";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [staff, matrix, overrides, audit] = await Promise.all([
    getStaff(), getMatrix(), getOverrides(), getAudit({ limit: 50 }),
  ]);
  return (
    <RoleGuard prefix="/admin">
      <AdminStoreProvider
        initialStaff={staff.success ? staff.data : []}
        initialMatrix={matrix.success ? matrix.data : null}
        initialOverrides={overrides.success ? overrides.data : []}
        initialAudit={audit.success ? audit.data : []}
        loadError={[staff, matrix, overrides, audit].find((r) => !r.success)?.error ?? null}
      >
        {children}
      </AdminStoreProvider>
    </RoleGuard>
  );
}

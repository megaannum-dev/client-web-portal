import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages-config";
import { AdminStoreProvider } from "@/lib/admin/AdminStoreContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/admin/enroll-user")}>
      <AdminStoreProvider>{children}</AdminStoreProvider>
    </RoleGuard>
  );
}

import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/admin/enroll-user")}>
      {children}
    </RoleGuard>
  );
}

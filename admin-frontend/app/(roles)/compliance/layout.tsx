import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages-config";

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/compliance/overview")}>
      {children}
    </RoleGuard>
  );
}

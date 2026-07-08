import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages-config";

export default function PcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/pc/model-management")}>
      {children}
    </RoleGuard>
  );
}

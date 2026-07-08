import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages-config";

export default function RmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/rm/client-info")}>
      {children}
    </RoleGuard>
  );
}

import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages";

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

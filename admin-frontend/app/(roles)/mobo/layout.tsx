import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages-config";

export default function MoboLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/mobo/recon-overview")}>
      {children}
    </RoleGuard>
  );
}

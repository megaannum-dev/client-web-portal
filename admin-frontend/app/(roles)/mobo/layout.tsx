import { RoleGuard } from "@/components/auth/RoleGuard";

export default function MoboLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["MOBO", "ADMIN"]}>
      {children}
    </RoleGuard>
  );
}

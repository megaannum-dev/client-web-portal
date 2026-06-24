import { RoleGuard } from "@/components/auth/RoleGuard";

export default function PcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["PC", "ADMIN"]}>
      {children}
    </RoleGuard>
  );
}

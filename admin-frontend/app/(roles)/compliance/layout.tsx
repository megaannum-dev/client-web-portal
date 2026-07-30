import { RoleGuard } from "@/components/auth/RoleGuard";

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard prefix="/compliance">
      {children}
    </RoleGuard>
  );
}

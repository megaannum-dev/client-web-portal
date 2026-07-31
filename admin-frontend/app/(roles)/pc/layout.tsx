import { RoleGuard } from "@/components/auth/RoleGuard";

export default function PcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard prefix="/pc">
      {children}
    </RoleGuard>
  );
}

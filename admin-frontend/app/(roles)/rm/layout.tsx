import { RoleGuard } from "@/components/auth/RoleGuard";

export default function RmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard prefix="/rm">
      {children}
    </RoleGuard>
  );
}

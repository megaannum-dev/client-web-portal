import { RoleGuard } from "@/components/auth/RoleGuard";

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard prefix="/pm">
      {children}
    </RoleGuard>
  );
}

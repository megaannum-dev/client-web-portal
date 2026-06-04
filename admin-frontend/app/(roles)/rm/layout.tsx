import { RoleGuard } from "@/components/auth/RoleGuard";

export default function RmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["RM", "ADMIN"]}>
      {children}
    </RoleGuard>
  );
}

import { AuthGuard } from "@/components/auth/AuthGuard";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface">
        <DashboardShell>
          <RoleGuard prefix="/monthly-reports">{children}</RoleGuard>
        </DashboardShell>
      </div>
    </AuthGuard>
  );
}

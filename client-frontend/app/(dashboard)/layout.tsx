import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface">
        <DashboardShell>{children}</DashboardShell>
      </div>
    </AuthGuard>
  );
}

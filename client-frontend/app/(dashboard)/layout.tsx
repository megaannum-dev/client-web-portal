import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardShell } from "@/components/DashboardShell";
import { MockStoreInit } from "@/components/MockStoreInit";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface">
        <MockStoreInit />
        <DashboardShell>{children}</DashboardShell>
      </div>
    </AuthGuard>
  );
}

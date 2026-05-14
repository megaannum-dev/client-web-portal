import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface">
        <Sidebar />
        <div className="flex flex-col pl-sidebar-w">
          <Header />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}

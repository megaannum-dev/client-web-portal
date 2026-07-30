import { RoleGuard } from "@/components/auth/RoleGuard";
import { AdminStoreProvider } from "@/lib/admin/AdminStoreContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard prefix="/admin">
      <AdminStoreProvider>{children}</AdminStoreProvider>
    </RoleGuard>
  );
}

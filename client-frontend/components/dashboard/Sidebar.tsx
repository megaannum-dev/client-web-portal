import { SidebarLogo } from "./SidebarLogo";
import { SidebarNav } from "./SidebarNav";
import { SidebarFooter } from "./SidebarFooter";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-sidebar-w flex-col bg-surface-lowest border-r border-outline-variant">
      <SidebarLogo />
      <SidebarNav />
      <SidebarFooter />
    </aside>
  );
}

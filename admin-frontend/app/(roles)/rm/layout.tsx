import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChatRoomProvider } from "@/components/rm/chat/ChatRoomProvider";

export default function RmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard prefix="/rm">
      <ChatRoomProvider>{children}</ChatRoomProvider>
    </RoleGuard>
  );
}

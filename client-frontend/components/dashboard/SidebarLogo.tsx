import Image from "next/image";
export function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-6 py-6 w-full">
      <Image src="/favicon.png" alt="MegaCRM" width={40} height={40} />
      <span className="text-headline-md font-bold text-on-surface whitespace-nowrap">
        MegaCRM
      </span>
    </div>
  );
}

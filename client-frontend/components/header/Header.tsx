import { SearchBar } from "./SearchBar";
import { HeaderActions } from "./HeaderActions";

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-header-h items-center justify-between border-b border-outline-variant bg-surface px-8">
      <SearchBar />
      <HeaderActions />
    </header>
  );
}

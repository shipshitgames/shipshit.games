import Link from "next/link";

export function AppHeader({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <header className="sticky top-0 z-40 border-b border-gunmetal/60 bg-void/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/dashboard"
          className="font-display text-lg font-bold uppercase tracking-tight text-bone"
        >
          Ship <span className="text-blood">Shit</span> App
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone"
            href="/dashboard"
          >
            Dashboard
          </Link>
          <Link
            className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone"
            href="/assets"
          >
            Assets
          </Link>
          <Link
            className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone"
            href="/access"
          >
            Access
          </Link>
          <Link
            className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone"
            href="/billing"
          >
            Billing
          </Link>
          <a
            className="text-xs font-bold uppercase tracking-widest text-ash hover:text-bone"
            href="https://shipshit.games"
          >
            Site
          </a>
        </nav>
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </header>
  );
}

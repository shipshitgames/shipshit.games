import { SignInButton } from "@clerk/nextjs";

import { AppHeader } from "@/components/app-header";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md border border-gunmetal px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
          >
            Sign in
          </button>
        </SignInButton>
      </AppHeader>
      {children}
    </>
  );
}

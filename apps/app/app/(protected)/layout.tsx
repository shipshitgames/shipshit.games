import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Server-side gate for every route in the (protected) group. The proxy
// (proxy.ts) is the primary enforcement boundary; this layout is a second,
// defense-in-depth check so a route in this group is never reachable
// signed-out, even if the matcher is ever misconfigured.
export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <>{children}</>;
}

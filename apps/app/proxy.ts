import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Default-deny: everything is protected unless explicitly listed here.
// New routes are gated by default — opt a route into public access by adding
// it below. Stripe webhook ingestion lives exclusively at api.shipshit.games.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

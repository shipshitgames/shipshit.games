import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/access(.*)",
  "/assets(.*)",
  "/api/assets(.*)",
  "/billing(.*)",
  "/claim(.*)",
  "/dashboard(.*)",
  "/api/access(.*)",
  "/api/billing(.*)",
  "/api/checkout(.*)",
  "/api/fulfillment(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

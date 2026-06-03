/** @type {import('next').NextConfig} */
// Path-based game hosting: games.shipshit.dev/<slug>/ proxies to each game's Vercel deploy.
// trailingSlash:true normalizes /<slug> -> /<slug>/ consistently (no redirect loop) so the
// games' relative Vite base ("./") resolves assets under the subpath. Rewrites then proxy
// everything under /<slug>/ to the game's deployment. Games stay independent repos/deploys.
const GAME_DEPLOYS = {
  "scourge-survivors": "https://scourge-survivors.vercel.app",
  deadlane: "https://deadlane-one.vercel.app",
  pactfall: "https://pactfall.vercel.app",
  starblight: "https://starblight.vercel.app",
  redline: "https://redline-eight-theta.vercel.app",
  rothulk: "https://rothulk.vercel.app",
  // The persistent meta-layer (EPIC #34). Vite SPA (apps/warline) on the shipshitdev team,
  // backed by the PartyKit server at warline.vincentshipsit.partykit.dev.
  warline: "https://warline-shipshitdev.vercel.app",
};

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  async rewrites() {
    return Object.entries(GAME_DEPLOYS).flatMap(([slug, url]) => [
      { source: `/${slug}`, destination: `${url}/` },
      { source: `/${slug}/`, destination: `${url}/` },
      { source: `/${slug}/:path*`, destination: `${url}/:path*` },
    ]);
  },
};

export default nextConfig;

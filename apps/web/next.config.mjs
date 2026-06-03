/** @type {import('next').NextConfig} */
// Path-based game hosting: games.shipshit.dev/<slug> proxies to each game's Vercel deploy.
// The games are built with a relative Vite base, so a bare /<slug> redirects to /<slug>/
// (trailing slash) so their relative asset URLs resolve, then the rewrite proxies everything
// under that path to the game's deployment. Games stay independent repos/deploys.
const GAME_DEPLOYS = {
  "scourge-survivors": "https://scourge-survivors.vercel.app",
  deadlane: "https://deadlane-one.vercel.app",
  pactfall: "https://pactfall.vercel.app",
  starblight: "https://starblight.vercel.app",
  redline: "https://redline-eight-theta.vercel.app",
  rothulk: "https://rothulk.vercel.app",
};

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return Object.keys(GAME_DEPLOYS).map((slug) => ({
      source: `/${slug}`,
      destination: `/${slug}/`,
      permanent: false,
    }));
  },
  async rewrites() {
    return Object.entries(GAME_DEPLOYS).flatMap(([slug, url]) => [
      { source: `/${slug}/`, destination: `${url}/` },
      { source: `/${slug}/:path*`, destination: `${url}/:path*` },
    ]);
  },
};

export default nextConfig;

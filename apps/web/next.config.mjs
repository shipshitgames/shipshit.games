/** @type {import('next').NextConfig} */
// shipshit.games — the studio + lessons site. The game hub (and the per-game
// proxy rewrites) now live in the deadrotcom repo (deadrot.com).
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
};

export default nextConfig;

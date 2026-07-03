/** @type {import('next').NextConfig} */
// shipshit.games — the studio + lessons site. The game hub (and the per-game
// proxy rewrites) now live in the deadrotcom repo (deadrot.com).
function assetOriginPattern() {
  const raw = process.env.NEXT_PUBLIC_ASSET_BASE_URL || process.env.ASSET_BASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: `${url.pathname.replace(/\/+$/, "")}/**`,
    };
  } catch {
    return null;
  }
}

const assetPattern = assetOriginPattern();

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      ...(assetPattern ? [assetPattern] : []),
    ],
  },
};

export default nextConfig;

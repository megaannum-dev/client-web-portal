/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // File uploads go through server actions, whose body defaults to 1 MB. Sized to the
    // largest backend upload budget (SOP_MAX_UPLOAD_BYTES = 50 MiB) + multipart overhead;
    // the backend still enforces each feature's own limit (413).
    serverActions: { bodySizeLimit: "51mb" },
  },
  // ponytail: old /pc bookmarks; drop once nobody uses /pc links.
  async redirects() {
    return [{ source: "/pc/:path*", destination: "/pm/:path*", permanent: true }];
  },
};

export default nextConfig;

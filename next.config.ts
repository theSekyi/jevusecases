import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/:path*", has: [{ type: "host", value: "jevusecases.com" }], destination: "https://www.jevusecases.com/:path*", permanent: true }];
  },
};

export default nextConfig;

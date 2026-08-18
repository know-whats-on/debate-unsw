import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // A stray lockfile in the home directory otherwise makes Next pick the
    // wrong workspace root.
    root: path.join(__dirname),
  },
};

export default nextConfig;

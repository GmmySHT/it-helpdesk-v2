import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hasil build mandiri: server cukup menjalankan `node server.js`,
  // tanpa `npm ci` dan tanpa node_modules penuh.
  output: "standalone",

  // Menghilangkan peringatan lockfile di C:\laragon\www
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
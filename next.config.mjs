/** @type {import('next').NextConfig} */
const nextConfig = {
  // Aplikacija (urnik) je v public/urnik.html; prikažemo jo na korenskem naslovu.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/urnik.html" }] };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Permissions-Policy", value: "microphone=(self)" }],
      },
    ];
  },
};

export default nextConfig;

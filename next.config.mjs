/** @type {import('next').NextConfig} */
const nextConfig = {
  // Domača stran je v app/route.ts (bere urnik.html z GitHuba, rezerva je public/urnik.html).
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

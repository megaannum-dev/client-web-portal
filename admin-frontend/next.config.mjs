/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone is for Docker only (see Dockerfile). Netlify uses @netlify/plugin-nextjs.
  ...(process.env.DOCKER_BUILD === "true" ? { output: "standalone" } : {}),
};

export default nextConfig;

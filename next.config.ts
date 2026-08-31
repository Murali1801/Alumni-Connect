import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this Turbopack walks up looking for a
  // lockfile and can settle on a parent directory (locally it picked
  // ~/Downloads), which changes what gets bundled.
  turbopack: {
    root: process.cwd(),
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The video rooms need camera and microphone; nothing else does, and
          // no third-party frame should ever get them.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

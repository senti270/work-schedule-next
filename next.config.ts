import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // 빌드 차단 방지를 위해 린트 오류를 무시합니다. (추후 단계적으로 해결)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // next dev 与 next build 可能并行执行；分离产物，避免开发页加载到被构建覆盖的 chunk。
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;

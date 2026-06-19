const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this project (multiple lockfiles exist on disk).
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;

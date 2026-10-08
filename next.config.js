// SPDX-License-Identifier: Apache-2.0 AND MIT
// Portions from Chatbot UI (McKay Wrigley) — see NOTICE

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
})

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development"
})

module.exports = withBundleAnalyzer(
  withPWA({
    reactStrictMode: true,
    typescript: { ignoreBuildErrors: true },
    // Standalone output for Electron production builds
    ...(process.env.ELECTRON_BUILD ? { output: "standalone" } : {}),
    images: {
      remotePatterns: [
        {
          protocol: "http",
          hostname: "localhost"
        },
        {
          protocol: "http",
          hostname: "127.0.0.1"
        },
        {
          protocol: "https",
          hostname: "**"
        }
      ]
    },
    serverExternalPackages: [
        "sharp",
        "onnxruntime-node",
        "@dot-agent/cli",
        "@dot-agent/kernel-dsl"
      ],
    webpack: (config, { isServer, dev }) => {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true
      }
      if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false, path: false, crypto: false, module: false
        }
      }
      if (dev) {
        config.devtool = 'eval-source-map'
      }
      return config
    }
  })
)

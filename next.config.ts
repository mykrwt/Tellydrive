import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Telegram DB sync worker (lib/telegram-db-worker.mjs) is spawned at
  // runtime via a child process, so it is never `import`ed by the app bundle.
  // Make sure it's traced into the serverless function so it's present on the
  // deployed server (otherwise cold-start restore/flush can't run).
  outputFileTracingIncludes: {
    "*": ["./lib/telegram-db-worker.mjs"],
  },
};

export default nextConfig;

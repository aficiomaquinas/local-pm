import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Build output directory, overridable per process.
  //
  // `next dev` and `next build` each own this directory exclusively: starting a
  // dev server replaces a production build's contents with dev artifacts (no
  // BUILD_ID, no hashed chunks). A `next start` server running from the same
  // path then serves HTML referencing chunks that no longer exist — every
  // /_next/static request 400s and the app dies with "Application error: a
  // client-side exception has occurred".
  //
  // The E2E suite runs its own dev server, so it sets NEXT_DIST_DIR to stay out
  // of the way of a production build serving the app locally.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    reactCompiler: false,
    // lucide-react is a barrel export; without this every named import pulls
    // the whole module graph into dev and inflates the bundle
    // (.claude/rules/10-assets-icons.md §10.2).
    optimizePackageImports: ['lucide-react'],
  },
  // isomorphic-dompurify (XSS sanitizer on RichTextDisplay, upstream d7747b6
  // port) instantiates a jsdom window when imported on the server. jsdom must
  // NOT be bundled into the server chunks: it reads browser/default-stylesheet.css
  // relative to its own module directory at runtime, and a bundled copy
  // resolves __dirname to the app root → ENOENT on every SSR pass that pulls
  // the editor module. Keep them as runtime requires from node_modules.
  serverExternalPackages: ['isomorphic-dompurify', 'dompurify', 'jsdom'],
}

export default withPayload(nextConfig)

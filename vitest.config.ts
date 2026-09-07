import { defineConfig } from 'vitest/config'

// SPC-003 §5.1: one runner (Vitest) workspace-wide. This root config is NOT a
// test project itself — it only holds global options and declares the test
// projects (vitest Test Projects, the monorepo feature). Each package owns
// its own vitest.config.ts and its own devDependency on vitest, keeping the
// SPC-002 principle that every package is self-contained.
//
// `pnpm test`  (root script "pnpm -r test") runs each package's own vitest.
// Running `vitest` directly at the repo root (no filter) executes every
// project in a single process — useful for editor integrations.
export default defineConfig({
  test: {
    reporters: ['verbose'],
    projects: ['apps/web', 'packages/mcp-server'],
  },
})

import { defineConfig } from 'vitest/config'

// SPC-003 §5.1: per-package Vitest config for the MCP server.
// environment: node — every suite is T1 (pure helpers) or T2 (handlers and
// protocol round-trips over an in-memory transport with fetch mocked); there
// is no DOM, no network and no MongoDB anywhere in this package's tests.
// Tests live under tests/; the build tsconfig (`include: src/**/*`) is
// untouched, so `tsc` never compiles test files (SPC-003 §5.1).
export default defineConfig({
  test: {
    name: 'mcp-server',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // forks (not threads): src/index.js mutates real process state at import
    // (server construction, connect attempt); vitest's isolate-on-fork gives
    // every test file a pristine module registry, which the capture harness
    // and the LOCAL_PM_URL binding test rely on.
    pool: 'forks',
  },
})

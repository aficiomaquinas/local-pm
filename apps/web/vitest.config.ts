import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// SPC-003 §5.1: per-package Vitest config for the web app.
// - Default environment: node — pure helpers (enums, access policy, history
//   feed helpers) need no DOM and stay off the jsdom cost.
// - Component suites (tests/components/**) run in jsdom with the official
//   Next.js unit-testing setup: @vitejs/plugin-react + React Testing Library.
// - The `@/*` alias mirrors the app tsconfig paths (tests/tsconfig.json keeps
//   a tests-scoped view; the app tsconfig itself excludes tests/ so
//   `next build` never type-checks them, SPC-003 §8.5).
// Tests live under tests/ (never colocated), so builds never see them
// (SPC-003 §5.1 layout rationale).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'node',
    environmentMatchGlobs: [['tests/components/**', 'jsdom']],
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})

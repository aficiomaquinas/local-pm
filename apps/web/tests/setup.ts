import '@testing-library/jest-dom/vitest'

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Fresh DOM after every component test (RTL standard hygiene).
afterEach(() => {
  cleanup()
})

// Structural offline guarantee for the whole web suite (SPC-003 §8.3/§8.6):
// jsdom ships a real window.fetch — if a test ever reached it, it would try
// real I/O. Forbid that: any unmocked fetch fails the test loudly. Node's
// http/net layer is not touched by the suites; their real use would surface
// as jsdom module-load failures. Guarded: the setup file also loads in the
// node environment, where there is no window.
if (typeof window !== 'undefined') {
  const realFetch = window.fetch.bind(window)
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    writable: true,
    value: (...args: Parameters<typeof fetch>) => {
      // Tests that need fetch must stub it first (vi.stubGlobal / vi.spyOn),
      // which replaces this property; reaching here means nobody did.
      vi.fail(
        `unmocked window.fetch(${String(args[0])}) — stub fetch in this test; live network is forbidden (SPC-003 §8.3)`,
      )
      return realFetch(...args)
    },
  })
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

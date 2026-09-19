'use client'

/**
 * AuthStatusBanner (SPC-007 draft, REQ-VIS-1): surfaces the session state on
 * every (frontend) page. Two consumer-visible failure modes it eliminates:
 *
 *  1. Anonymous user sees NO hint that mutations will fail — the board looks
 *     fully interactive and every drag silently reverts (PATCH → 403).
 *  2. A logged-in user cannot tell whether the session is still alive after
 *     token expiration (default 2h) — same silent failure.
 *
 * The banner is read-only state: it never blocks interaction (the board stays
 * usable for reads by design) and links to the two auth surfaces.
 */

import { useEffect, useState } from 'react'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; email: string }

export function AuthStatusBanner() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/users/me', { credentials: 'same-origin' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data?.user?.email) {
            setState({ status: 'authenticated', email: data.user.email as string })
            return
          }
        }
        if (!cancelled) setState({ status: 'anonymous' })
      } catch {
        if (!cancelled) setState({ status: 'anonymous' })
      }
    }
    void check()
    // Re-check when the tab regains focus (covers logout in another tab and
    // natural token expiry while the page sat idle).
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(check, 60_000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [])

  if (state.status === 'loading') return null

  if (state.status === 'anonymous') {
    return (
      <div
        role="status"
        data-testid="auth-status"
        className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
      >
        <strong className="font-semibold">Read-only view.</strong> You are not
        logged in — edits will not be saved.{' '}
        <a
          href="/admin/login"
          className="font-semibold underline underline-offset-2 hover:text-amber-100"
        >
          Log in
        </a>{' '}
        to make changes.
      </div>
    )
  }

  return (
    <div
      role="status"
      data-testid="auth-status"
      className="border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-200/90"
    >
      Logged in as <strong className="font-semibold">{state.email}</strong> —
      changes are saved.{' '}
      <a
        href="/admin"
        className="underline underline-offset-2 hover:text-emerald-100"
      >
        Admin
      </a>
    </div>
  )
}

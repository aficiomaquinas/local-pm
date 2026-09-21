'use client'

/**
 * Auth session visibility (SPC-007 v2, REQ-005):
 *
 *  - Anonymous      → topbar amber banner ("Read-only view … Log in").
 *    When a mutation fails with 401/403 the board dispatches the
 *    `localpm:auth-nudge` CustomEvent (AUTH_NUDGE_EVENT); this banner listens
 *    and plays a short amber→red attention pulse (CSS keyframe, ~600 ms ×2,
 *    colors only — no layout shift). v2.1: the failure surface beside the
 *    action is the generic upstream toast (see SPC-007 §7 amendment); the
 *    nudge points the eye at the standing explanation.
 *  - Authenticated  → NO topbar banner (v1's green banner is gone). The
 *    session indicator lives exclusively in the sidebar bottom-left user
 *    block (`UserMenu`, mounted by `Sidebar`): circular avatar with the
 *    email's initial, the email below it (truncated), click opens a small
 *    dropdown menu with Admin and Log out.
 *
 * The session check (same-origin `/api/users/me`, re-run on focus and every
 * 60 s — covers logout in another tab and idle token expiry) is unchanged
 * from v1 and shared by both surfaces via `useAuthSession`.
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Menu, type MenuItem } from '@/components/ui/Menu'

/** CustomEvent name KanbanBoard dispatches when a mutation receives 401/403. */
export const AUTH_NUDGE_EVENT = 'localpm:auth-nudge'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; email: string }

/**
 * Session state machine (SPC-007 §2.3, unchanged from v1): fetch
 * `/api/users/me` with the same-origin cookie on mount, on window focus, and
 * on a 60 s interval. `loading → anonymous | authenticated(email)`.
 */
export function useAuthSession(): AuthState {
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

  return state
}

/**
 * Topbar banner for the ANONYMOUS state only (renders nothing while loading
 * or authenticated — REQ-005.1). Nudge target for `localpm:auth-nudge`.
 */
export function AnonymousBanner() {
  const state = useAuthSession()
  // Each nudge bumps the key so the banner div remounts and the CSS
  // animation replays from its start (repeated failed mutations each get
  // the full pulse, not just the first).
  const [nudgeCount, setNudgeCount] = useState(0)

  useEffect(() => {
    const onNudge = () => setNudgeCount((c) => c + 1)
    window.addEventListener(AUTH_NUDGE_EVENT, onNudge)
    return () => window.removeEventListener(AUTH_NUDGE_EVENT, onNudge)
  }, [])

  if (state.status !== 'anonymous') return null

  return (
    <div
      key={nudgeCount}
      role="status"
      data-testid="auth-status"
      className={`border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200${
        nudgeCount > 0 ? ' auth-nudge' : ''
      }`}
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

/**
 * Sidebar bottom-left user block for the AUTHENTICATED state (REQ-005.1):
 * circular avatar with the email's initial (mirror users may lack `name`;
 * the email is always present by identity design), the email below it,
 * click opens a small dropdown menu — Admin (/admin) and Log out
 * (/admin/logout; Payload owns the logout flow, the frontend adds no logic).
 *
 * Built on the design-system primitives (PR#9-#11 port): the menu is the
 * Radix DropdownMenu (`ui/Menu`), so click-outside/Escape/focus handling is
 * the primitive's, not hand-rolled listeners.
 */
export function UserMenu() {
  const state = useAuthSession()

  if (state.status !== 'authenticated') return null

  const initial = state.email.charAt(0).toUpperCase()

  const items: MenuItem[] = [
    { id: 'admin', label: 'Admin', href: '/admin', onSelect: () => {} },
    { id: 'logout', label: 'Log out', href: '/admin/logout', onSelect: () => {} },
  ]

  return (
    <div data-testid="user-menu" className="px-3 pb-4 pt-2">
      <Menu
        label="User session menu"
        align="start"
        items={items}
        trigger={
          <button
            type="button"
            className={cn(
              'flex w-full min-w-0 flex-col items-start gap-1.5 rounded-sm px-2 py-2 text-left',
              'transition-colors duration-micro ease-standard',
              'outline-none hover:bg-surface-hover',
              'focus-visible:bg-surface-hover data-[state=open]:bg-surface-hover',
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-fg"
            >
              {initial}
            </span>
            <span className="w-full truncate text-xs text-text-muted">{state.email}</span>
          </button>
        }
      />
    </div>
  )
}

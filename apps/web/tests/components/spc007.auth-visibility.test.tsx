import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import {
  AnonymousBanner,
  UserMenu,
  AUTH_NUDGE_EVENT,
} from '@/components/auth/AuthStatusBanner'

/**
 * SPC-007 v2 — auth session visibility (REQ-005.1 / REQ-005.4):
 *
 *  - Anonymous session → the amber topbar banner stays (v1 behavior) and is
 *    the nudge target for `localpm:auth-nudge` (dispatched by KanbanBoard's
 *    401/403 branch). The nudge must apply the `auth-nudge` alarm class
 *    (CSS keyframe amber→red, colors only — no layout shift).
 *  - Authenticated session → NO topbar banner (v1's green banner is gone);
 *    the session lives exclusively in the sidebar user block: avatar with
 *    the email's initial, the email below, popover menu with Admin and
 *    Log out.
 *
 * Session-check contract (useAuthSession): `/api/users/me` same-origin on
 * mount + focus + 60 s interval. All fetches stubbed (SPC-003 §8.3 — no
 * live network in the suite).
 */

/** /api/users/me double: email = null → anonymous (no user in payload). */
function stubMe(email: string | null) {
  const mock = vi.fn(async () => ({
    ok: true,
    json: async () => (email ? { user: { email } } : { user: null }),
  }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SPC-007 v2: anonymous topbar banner', () => {
  it('shows the read-only banner with a Log in link for anonymous sessions', async () => {
    stubMe(null)
    render(<AnonymousBanner />)

    const banner = await screen.findByTestId('auth-status')
    expect(banner).toHaveTextContent('Read-only view.')
    expect(banner).toHaveTextContent('edits will not be saved')
    const login = screen.getByRole('link', { name: 'Log in' })
    expect(login).toHaveAttribute('href', '/admin/login')
  })

  it('renders nothing when the session is authenticated (v2: no green topbar)', async () => {
    const mock = stubMe('victor@local-pm.dev')
    render(<AnonymousBanner />)

    // The session check resolved (not merely still loading)…
    await waitFor(() => expect(mock).toHaveBeenCalled())
    await waitFor(() =>
      // …and the banner stays absent — authenticated state has no topbar.
      expect(screen.queryByTestId('auth-status')).not.toBeInTheDocument(),
    )
  })
})

describe('SPC-007 v2: sidebar user block (authenticated)', () => {
  it('renders the avatar initial and the email for authenticated sessions', async () => {
    stubMe('victor@local-pm.dev')
    render(<UserMenu />)

    const block = await screen.findByTestId('user-menu')
    // Avatar shows the FIRST LETTER of the email, uppercased.
    expect(screen.getByText('V', { selector: 'span[aria-hidden="true"]' })).toBeInTheDocument()
    expect(block).toHaveTextContent('victor@local-pm.dev')
  })

  it('renders nothing while anonymous (the sidebar block is authenticated-only)', async () => {
    const mock = stubMe(null)
    render(<UserMenu />)

    await waitFor(() => expect(mock).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument(),
    )
  })

  it('opens a popover menu with Admin and Log out on click', async () => {
    stubMe('victor@local-pm.dev')
    render(<UserMenu />)

    const block = await screen.findByTestId('user-menu')
    // Menu closed initially…
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // …click toggles it open with the two payload-owned links.
    fireEvent.click(screen.getByRole('button'))
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveAttribute(
      'href',
      '/admin/logout',
    )

    // Clicking again closes it (toggle).
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(block).toBeInTheDocument()
  })
})

describe('SPC-007 v2: mutation-failure nudge on the anonymous banner', () => {
  it('applies the auth-nudge alarm class when the nudge event fires, and replays on repeat', async () => {
    stubMe(null)
    render(<AnonymousBanner />)
    const banner = await screen.findByTestId('auth-status')
    expect(banner.className).not.toContain('auth-nudge')

    // KanbanBoard's 401/403 branch dispatches this exact event (window).
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AUTH_NUDGE_EVENT))
    })
    const nudged = screen.getByTestId('auth-status')
    expect(nudged.className).toContain('auth-nudge')

    // A second failed mutation re-fires the event → the banner remounts
    // (React key bump) so the CSS animation replays from its start; the
    // class must still be present and the text unchanged.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AUTH_NUDGE_EVENT))
    })
    const renudged = screen.getByTestId('auth-status')
    expect(renudged.className).toContain('auth-nudge')
    expect(renudged).toHaveTextContent('Read-only view.')
  })
})

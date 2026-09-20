import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  AnonymousBanner,
  UserMenu,
  AUTH_NUDGE_EVENT,
} from '@/components/auth/AuthStatusBanner'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { ToastProvider } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { ShortcutProvider } from '@/lib/shortcuts'
import type { Ticket } from '@/payload-types'

// Board-failure tests replace @dnd-kit with a passive stand-in: KanbanBoard's
// contract under test is its OWN pipeline (handleDragEnd → dragLogic →
// persistMove → revert/toast/nudge), which the mock invokes directly. Real
// dnd-kit under jsdom leaves React 19's scheduler in a ~30 s runaway work
// loop after a failed move (verified by timer instrumentation — no macrotasks
// scheduled, yet timers starve); the library's own wiring is covered by the
// w16 suite and the browser gate.
const dndHandlers: {
  onDragStart?: (e: unknown) => void
  onDragEnd?: (e: unknown) => void
  onDragOver?: (e: unknown) => void
} = {}

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  const DndContext = (props: {
    children?: React.ReactNode
    onDragStart?: (e: unknown) => void
    onDragEnd?: (e: unknown) => void
    onDragOver?: (e: unknown) => void
  }) => {
    dndHandlers.onDragStart = props.onDragStart
    dndHandlers.onDragEnd = props.onDragEnd
    dndHandlers.onDragOver = props.onDragOver
    return (props.children ?? null) as React.ReactNode
  }
  const DragOverlay = (props: { children?: React.ReactNode }) =>
    (props.children ?? null) as React.ReactNode
  const useSensor = () => ({})
  const useSensors = (...sensors: unknown[]) => sensors
  const useDroppable = () => ({ setNodeRef: () => {}, isOver: false })
  class PointerSensor {}
  class KeyboardSensor {}
  class TouchSensor {}
  return { ...actual, DndContext, DragOverlay, useSensor, useSensors, useDroppable, PointerSensor, KeyboardSensor, TouchSensor }
})

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  const SortableContext = (props: { children?: React.ReactNode }) =>
    (props.children ?? null) as React.ReactNode
  const useSortable = () => ({
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    attributes: {},
    listeners: {},
    transform: null,
    transition: undefined,
    isDragging: false,
  })
  return { ...actual, SortableContext, useSortable }
})

/**
 * SPC-007 v2 — auth session visibility (REQ-005.1 / REQ-005.4), with the
 * v2.1 amendment (operator decision 2026-09-20):
 *
 *  - Anonymous session → the amber topbar banner stays (v1 behavior) and is
 *    the nudge target for `localpm:auth-nudge` (dispatched by KanbanBoard's
 *    401/403 branch). The nudge must apply the `auth-nudge` alarm class
 *    (CSS keyframe amber→red, colors only — no layout shift).
 *  - Authenticated session → NO topbar banner (v1's green banner is gone);
 *    the session lives exclusively in the sidebar user block: avatar with
 *    the email's initial, the email below, menu with Admin and Log out.
 *    v2.1: the menu is the Radix DropdownMenu from the design-system port
 *    (ui/Menu) — link items render as real anchors.
 *  - Failed board move → generic upstream PR#7 toast ("Couldn't move that
 *    ticket"); the class-specific red banner (`mutation-error`) is REMOVED.
 *    401/403 still pulses the anonymous banner via the nudge event.
 *
 * Session-check contract (useAuthSession): `/api/users/me` same-origin on
 * mount + focus + 60 s interval. All fetches stubbed (SPC-003 §8.3 — no
 * live network in the suite).
 *
 * Radix-under-jsdom notes (verified against react-dropdown-menu 2.1.24):
 *  - @testing-library resolves the PointerEvent constructor at module load,
 *    where jsdom has none, so fireEvent.pointerDown dispatches a plain Event
 *    without `button` — which the Radix trigger ignores. Opening goes
 *    through the trigger's KEYBOARD path (Enter — same onOpenToggle branch);
 *    outside-click dispatches a polyfilled PointerEvent manually. The full
 *    pointer path is covered by the browser gate.
 *  - Radix stamps the content with `aria-labelledby` (the trigger), which
 *    OVERRIDES our `aria-label` in accessible-name computation — and the
 *    trigger sits in the aria-hidden'd app root while the menu is open, so
 *    the computed name is empty. Queries therefore match on `role="menu"`
 *    alone and assert the label attribute.
 *  - While a Radix menu is OPEN its content keeps scheduling React work, so
 *    RTL's waitFor/async-act wrappers never settle in jsdom — the same stall
 *    class the w16 suite documents for in-flight drags. All waits therefore
 *    go through `until()` (raw-timer, BOOLEAN probes only): a failing RTL
 *    matcher per poll serializes the whole body DOM into its error and
 *    starves the loop (observed 27 s stall). The rich assertions run once,
 *    after the wait. Each test closes its menu before ending so cleanup
 *    cannot run with one open.
 *  - OUTSIDE pointer-down dismissal is deliberately NOT unit-tested: that
 *    Radix path (dismissable layer → close → focus return) trips the same
 *    ~30 s scheduler runaway in jsdom, and the behavior is the primitive's
 *    own, not our wiring. Escape and select-to-close are pinned here;
 *    click-outside is verified live on the E2E stack (SPC-007 browser gate).
 *  - OPENING a menu at all poisons React 19's scheduler for the FOLLOWING
 *    tests in the same file (next test inherits a ~20-30 s stall), so the
 *    open/close-interaction test lives in its own file
 *    (spc007.user-menu-radix.test.tsx) and vitest's per-file isolation
 *    absorbs the pollution.
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

beforeEach(() => {
  // jsdom has no PointerEvent; provide a minimal constructor for tests that
  // dispatch one explicitly (outside-click dismissal).
  if (typeof window !== 'undefined' && !window.PointerEvent) {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params)
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Raw-timer retry on a plain boolean probe. The rich assertion runs once,
 * after the wait (see the file header for why probes must stay boolean).
 */
async function until(check: () => boolean, what: string, timeout = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) {
      throw new Error(`until() timed out waiting for: ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const menuOpen = () => document.querySelector('[role="menu"]') !== null
const menuClosed = () => document.querySelector('[role="menu"]') === null

/**
 * Open a Radix DropdownMenu from its trigger button: Enter hits the same
 * onOpenToggle branch as a trusted pointerdown (Radix trigger onKeyDown).
 */
function openRadixMenu(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

/** The user block's trigger: the only button carrying the email. */
function userMenuTrigger(): HTMLElement {
  const trigger = screen
    .getAllByRole('button')
    .find((b) => b.textContent?.includes('@'))
  expect(trigger).toBeDefined()
  return trigger as HTMLElement
}

/** The card's context menu trigger (KanbanCard "Actions for …"). */
function cardMenuTrigger(title: string): HTMLElement {
  return screen.getByRole('button', { name: `Actions for ${title}` })
}

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
    await until(() => mock.mock.calls.length > 0, '/api/users/me check')
    // …and the banner stays absent — authenticated state has no topbar.
    await until(
      () => document.querySelector('[data-testid="auth-status"]') === null,
      'no topbar banner when authenticated',
    )
  })
})

describe('SPC-007 v2.1: sidebar user block (authenticated)', () => {
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

    await until(() => mock.mock.calls.length > 0, '/api/users/me check')
    await until(
      () => document.querySelector('[data-testid="user-menu"]') === null,
      'no user block while anonymous',
    )
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

// ---------------------------------------------------------------------------
// v2.1 amendment: failed move → toast only (upstream PR#7 parity). The board
// drives real @dnd-kit in jsdom through the card's context-menu path —
// "Move to …" routes through the same persistMove as a drag, without the
// in-flight dnd-kit measurement loop that never settles in jsdom (see the
// w16 jsdom-driver-limit note).
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'tick_1',
    ticketId: 'PCF-1',
    title: 'Moveable card',
    status: 'TODO',
    priority: 'MEDIUM',
    project: 'proj_1',
    labels: [],
    blockedBy: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as Ticket
}

function renderBoard(tickets: Ticket[]) {
  return render(
    // Provider stack mirrors (frontend)/layout + AppShell: the shortcut
    // registry, toasts, tooltips, and the anonymous banner that carries the
    // auth-nudge listener.
    <ShortcutProvider>
      <ToastProvider>
        <TooltipProvider>
          <AnonymousBanner />
          <KanbanBoard initialTickets={tickets} hasProjects />
        </TooltipProvider>
      </ToastProvider>
    </ShortcutProvider>,
  )
}

/**
 * Fetch double with per-test PATCH routing: /api/users/me resolves anonymous
 * (the nudge assertions need the amber banner), everything else goes to the
 * test's impl and is recorded.
 */
function stubBoardFetch(patchImpl: () => Promise<Response>) {
  const patches: { url: string; init?: RequestInit }[] = []
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/users/me')) {
      return { ok: true, json: async () => ({ user: null }) } as Response
    }
    patches.push({ url: String(url), init })
    return patchImpl()
  })
  vi.stubGlobal('fetch', mock)
  return { mock, patches }
}

function jsonError(status: number, statusText = 'Error'): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as unknown as Response
}

/** Drive the board's real handleDragEnd with a synthetic drop on Done. */
async function dropCardOnDone() {
  await act(async () => {
    dndHandlers.onDragStart?.({ active: { id: 'tick_1' } })
    dndHandlers.onDragEnd?.({ active: { id: 'tick_1' }, over: { id: 'DONE' } })
  })
}

describe('SPC-007 v2.1: failed move surfaces the upstream toast (no red banner)', () => {
  it('a 403 move shows the toast "Couldn\'t move that ticket", reverts the card, and pulses the banner nudge', async () => {
    stubBoardFetch(async () => jsonError(403, 'Forbidden'))
    renderBoard([makeTicket()])

    // Anonymous: the amber banner is up, the card sits in Todo…
    await screen.findByTestId('auth-status')
    const todo = screen.getByTestId('column-TODO')
    expect(todo).toHaveTextContent('Moveable card')
    expect(document.querySelector('[data-testid="mutation-error"]')).toBeNull()

    // …and the context-menu "Move to Done" drives the real move pipeline
    // (applyDrop → optimistic state → PATCH → failure branch).
    await dropCardOnDone()

    // (a) the generic upstream toast appears, error tone (role=alert)…
    await until(() => document.querySelector('[role="alert"]') !== null, '403 toast appears')
    const toast = document.querySelector('[role="alert"]') as HTMLElement
    expect(toast).toHaveTextContent("Couldn't move that ticket")
    expect(toast).toHaveTextContent('PCF-1 is back in Todo')
    // …(b) the card was reverted to its origin column…
    await until(
      () =>
        document.querySelector('[data-testid="column-TODO"]')?.textContent?.includes(
          'Moveable card',
        ) ?? false,
      'card reverted to Todo',
    )
    expect(screen.getByTestId('column-DONE')).not.toHaveTextContent('Moveable card')
    // …(c) the 401/403 nudge pulsed the anonymous banner — the banner
    // REMOUNTS on the nudge (React key bump), so re-query the live node.
    await until(
      () =>
        (document.querySelector('[data-testid="auth-status"]') as HTMLElement | null)?.className.includes(
          'auth-nudge',
        ) ?? false,
      'auth-nudge class applied',
    )
    // …and the class-specific bar stays gone.
    expect(document.querySelector('[data-testid="mutation-error"]')).toBeNull()
  })

  it('a 500 move shows the toast and reverts WITHOUT the auth nudge (not an auth failure)', async () => {
    stubBoardFetch(async () => jsonError(500, 'Internal Server Error'))
    renderBoard([makeTicket()])

    const banner = await screen.findByTestId('auth-status')

    await dropCardOnDone()

    await until(() => document.querySelector('[role="alert"]') !== null, '500 toast appears')
    const toast = document.querySelector('[role="alert"]') as HTMLElement
    expect(toast).toHaveTextContent("Couldn't move that ticket")
    await until(
      () =>
        document.querySelector('[data-testid="column-TODO"]')?.textContent?.includes(
          'Moveable card',
        ) ?? false,
      'card reverted to Todo',
    )
    // No pulse: 500 is a server error, not an auth failure.
    expect(banner.className).not.toContain('auth-nudge')
    expect(document.querySelector('[data-testid="mutation-error"]')).toBeNull()
  })

  it('a successful move PATCHes { status, sortOrder } and toasts nothing', async () => {
    const { patches } = stubBoardFetch(async () => ({ ok: true } as Response))
    renderBoard([makeTicket()])

    await screen.findByTestId('auth-status')
    await dropCardOnDone()

    await until(() => patches.length >= 1, 'PATCH issued')
    expect(patches[0].url).toContain('/api/tickets/tick_1')
    expect(JSON.parse(String(patches[0].init?.body))).toEqual({
      status: 'DONE',
      sortOrder: expect.any(Number),
    })
    // The card actually moved and nothing alerts.
    expect(screen.getByTestId('column-DONE')).toHaveTextContent('Moveable card')
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[data-testid="mutation-error"]')).toBeNull()
  })
})

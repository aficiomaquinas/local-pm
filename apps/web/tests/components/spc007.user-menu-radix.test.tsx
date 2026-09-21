import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenu } from '@/components/auth/AuthStatusBanner'

/**
 * SPC-007 v2.1 — UserMenu on the design-system Radix DropdownMenu: the
 * OPEN/CLOSE interaction contract. This lives in its OWN file because
 * opening a Radix menu poisons React 19's scheduler for any test that runs
 * AFTER it in the same vitest file (next test inherits a ~20-30 s stall in
 * jsdom; see the header of spc007.auth-visibility.test.tsx). Per-file
 * isolation absorbs it here.
 *
 * jsdom notes: opening goes through the trigger's KEYBOARD path (Enter —
 * same onOpenToggle branch as pointerdown; RTL resolves the PointerEvent
 * constructor at module load, before jsdom has one, so fireEvent.pointerDown
 * dispatches a plain Event without `button`). The content carries BOTH
 * aria-labelledby (the trigger, aria-hidden'd while open) and our aria-label,
 * and aria-labelledby WINS accessible-name computation → the menu's computed
 * name is empty; queries match on role and assert the label attribute.
 */
describe('SPC-007 v2.1: user menu Radix interaction', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ user: { email: 'victor@local-pm.dev' } }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the Radix dropdown with Admin and Log out link items, closes on Escape', async () => {
    render(<UserMenu />)

    const block = await screen.findByTestId('user-menu')
    // Menu closed initially…
    expect(document.querySelector('[role="menu"]')).toBeNull()

    // …Enter on the trigger opens the Radix dropdown…
    const trigger = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('@'))
    expect(trigger).toBeDefined()
    fireEvent.keyDown(trigger as HTMLElement, { key: 'Enter' })

    const deadline = Date.now() + 3000
    while (!document.querySelector('[role="menu"]') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const menu = document.querySelector('[role="menu"]') as HTMLElement
    expect(menu).not.toBeNull()
    expect(menu.getAttribute('aria-label')).toBe('User session menu')

    // …and the two payload-owned destinations are REAL LINKS (asChild anchor).
    expect(screen.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveAttribute(
      'href',
      '/admin/logout',
    )

    // Escape closes (Radix handles the keydown on its content).
    fireEvent.keyDown(menu, { key: 'Escape' })
    const closeDeadline = Date.now() + 3000
    while (document.querySelector('[role="menu"]') && Date.now() < closeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(block).toBeInTheDocument()
  })
})

# 11 — UI Review Checklist

Run this before calling any UI change done. It is ordered by how often each item
actually catches something.

---

## Tokens & visual

- [ ] No raw hex, px, or ms in component code — everything resolves to a token
- [ ] No primitive color references (`slate-3`) in a component; only semantic tokens (`surface-hover`)
- [ ] Type sizes come from the scale; weights are 400 / 500 / 600 only
- [ ] Spacing comes from the 4px scale
- [ ] Related elements are closer together than unrelated ones
- [ ] Nested radii follow `inner = outer − padding`
- [ ] Shadows used only for genuinely floating surfaces
- [ ] Numeric columns use `tabular-nums` and right alignment
- [ ] Every truncated string has a `title` or tooltip

## Color & contrast

- [ ] Body text ≥ 4.5:1, UI borders and meaningful icons ≥ 3:1 — **checked in both themes**
- [ ] Placeholder text passes 4.5:1
- [ ] **Grayscale test**: every status, priority, and label still readable with color disabled
- [ ] No red-vs-green as the only differentiator
- [ ] Accent color is ≤ ~10% of visible pixels; exactly one primary button in view
- [ ] Dark mode: background 8–12% L, text 90–95% L, elevation by lightness not shadow

## Keyboard & focus

- [ ] Tab through the whole feature — everything reachable, visible focus, logical order
- [ ] **Complete the primary task with the mouse unplugged**
- [ ] `:focus-visible` used; no `outline: none` without a replacement ring
- [ ] Escape closes / cancels / clears, one level at a time
- [ ] Modals trap focus and return it to the trigger
- [ ] Single-key shortcuts do not fire while an input has focus
- [ ] New shortcuts are in the central registry and appear in `?`

## Semantics

- [ ] Every interactive element is a real `button` / `a` / `input` — no `div` with `onClick`
- [ ] Every input has an associated `<label>`
- [ ] Icon-only controls have `aria-label` on the control and `aria-hidden` on the SVG
- [ ] Headings descend without skipping; one `h1`
- [ ] axe DevTools reports zero violations

## Forms

- [ ] Labels above fields; no placeholder-as-label
- [ ] Untouched fields show no error state
- [ ] Errors appear inline **and** in a top summary; focus moves to the summary on failed submit
- [ ] `aria-invalid` + `aria-describedby` wired
- [ ] Submit button is **not** disabled for invalidity — only during submission
- [ ] `Cmd/Ctrl+Enter` submits from every textarea
- [ ] Destructive action sits at the right rung of the friction ladder and is not default-focused

## State & feedback

- [ ] All four states designed: loading, empty, error, populated
- [ ] Three distinct empty states where applicable (no data / no results / error)
- [ ] Nothing shown under 100ms; spinner delayed 150–200ms and held 400–500ms
- [ ] Skeletons match final dimensions — **no layout shift on resolve**
- [ ] Optimistic writes revert *visibly* with a reason on failure, never silently
- [ ] Nothing toasts a result the user can already see
- [ ] Errors and required actions never auto-dismiss
- [ ] Every undo has a durable fallback beyond the toast

## Data views

- [ ] Filters, sort, grouping, and search are in the URL; column prefs in localStorage
- [ ] Applied filters show as removable chips with a result count and Clear all
- [ ] Sticky header; sticky first column on wide tables
- [ ] Hover row actions mirrored on `:focus-within` and wrapped in `@media (hover: hover)`
- [ ] Select-all distinguishes "on this page" from "all matching", with a resolved count
- [ ] Lists over ~50 rows are virtualized, with `aria-rowcount` / `aria-rowindex`
- [ ] Back navigation restores scroll position and loaded batches

## Board & drag

- [ ] Card respects the budget: 2-line title, ≤4 metadata, ≤3 chips, ≤3 avatars, 1 accent
- [ ] **Keyboard drag works**: Space lift → arrows → Space drop → Escape cancels
- [ ] **A non-drag `Move to →` menu exists** (WCAG 2.5.7)
- [ ] Live region announces the item and both positions by name
- [ ] Focus stays on the card after a move
- [ ] Failed drops animate back and explain why
- [ ] Ordering uses fractional keys, not integer indices
- [ ] Remote updates never reorder under an active drag

## Responsive & motion

- [ ] Works at 320px wide with no horizontal page scroll
- [ ] 400% zoom reflows to one column
- [ ] Touch targets ≥ 44px, ≥ 8px apart
- [ ] Mobile inputs ≥ 16px font
- [ ] No hover-only affordance without a touch equivalent
- [ ] Only `transform` and `opacity` animated; nothing over ~500ms
- [ ] `prefers-reduced-motion` emulated — nothing breaks or disappears

---

## The two-minute version

If time is short, do these five. They catch the majority of real defects:

1. **Unplug the mouse** and complete the task.
2. **Turn off color** and check every status still reads.
3. **Resize to 320px.**
4. **Make the request fail** and watch what the UI does.
5. **Load it with no data.**

# 08 — Accessibility Baseline

**Target: WCAG 2.2 Level AA.** This is a floor, not an aspiration. A feature that
misses it is not finished.

---

## 8.1 The criteria this app most often touches

| SC | Level | What it means here |
|---|---|---|
| **1.4.1** Use of Color | A | Status, priority, labels never rely on color alone. Grayscale must still work |
| **1.4.3** Contrast | AA | 4.5:1 body, 3:1 large text (≥24px, or ≥18.66px bold) |
| **1.4.10** Reflow | AA | Single column, no 2-D scrolling, at 320px / 400% zoom |
| **1.4.11** Non-text Contrast | AA | 3:1 for control borders, meaningful icons, focus rings |
| **1.4.12** Text Spacing | AA | Usable when the user overrides line-height 1.5×, letter-spacing 0.12em |
| **2.1.1** Keyboard | A | Every action reachable by keyboard |
| **2.1.2** No Keyboard Trap | A | Focus can always leave, except an intentional modal trap |
| **2.1.4** Character Key Shortcuts | A | Single-key shortcuts are scoped to focus, or remappable |
| **2.4.3** Focus Order | A | Follows visual reading order |
| **2.4.7** Focus Visible | AA | Never `outline: none` without a replacement |
| **2.4.11** Focus Appearance | AA | 2px ring, 2px offset, 3:1 against both states |
| **2.5.7** Dragging Movements | AA | **Every drag has a non-drag alternative** |
| **2.5.8** Target Size | AA | 24px floor; we build to 44px |
| **2.2.1** Timing Adjustable | A | Errors and required actions never auto-dismiss |
| **3.3.1 / 3.3.3** Errors | A / AA | Identified in text, with a suggested fix |
| **3.3.7** Redundant Entry | A | Never ask for the same information twice in one flow |
| **3.3.8** Accessible Authentication | AA | Allow paste, autofill, and password managers |
| **4.1.2** Name, Role, Value | A | Every control exposes all three |

---

## 8.2 Semantics

- **Interactive elements are real elements.** `button`, `a`, `input`, `select`. A `div` with `onClick` loses focusability, keyboard activation, and role — it is a bug, not a style choice.
- `a` navigates (has an `href`). `button` acts. Never swap them for visual convenience.
- One `h1` per page; headings descend without skipping levels.
- Landmarks on every page: `header`, `nav`, `main`, `aside`. `main` is the skip-link target.
- Lists are `ul`/`ol`. Tables are `table` with `th` and `scope`.
- **ARIA is a last resort.** A native element with correct semantics beats `role` + handlers every time. Incorrect ARIA is worse than none.

---

## 8.3 Keyboard

- Everything reachable, in visual order, with a visible focus indicator.
- `:focus-visible`, not bare `:focus`.
- **Skip to main content** is the first tabbable element on every page — with a persistent sidebar, keyboard users otherwise tab through navigation on every single page.
- **Escape** consistently closes the nearest overlay, cancels the nearest edit, or clears selection — one level at a time.
- Composite widgets (menus, tabs, trees, grids, the sidebar) use **roving tabindex**: one tab stop for the widget, arrows to move within it.
- Modals trap focus and return it to the trigger on close.
- **Single-character shortcuts fire only when no editable element has focus**, and only in their relevant context. Anything global takes a modifier (SC 2.1.4).

---

## 8.4 Screen reader

| Need | Mechanism |
|---|---|
| Icon next to visible text | `aria-hidden` on the icon; the text is the name |
| Icon-only control | `aria-label` on the **control**, `aria-hidden` on the SVG. Never label both |
| Standalone informational SVG | `role="img"` + `aria-label`, or `<title>` + `aria-labelledby` |
| Status / confirmation | `role="status"` (polite) |
| Time-critical error | `role="alert"` (assertive) — sparingly |
| Async result, drag lifecycle | Off-screen `aria-live` region |
| Field error | `aria-invalid` + `aria-describedby` |
| Expandable | `aria-expanded` on the trigger |
| Selection | `aria-selected` / `aria-checked` |
| Virtualized rows | `aria-rowcount` on container, `aria-rowindex` per row |

**Live region wording** names the object and the outcome. `Task "Fix login redirect" moved to In Progress from Todo.` Not "Item moved."

---

## 8.5 Drag and drop — the compliance bar

SC 2.5.7 is the criterion this app is most likely to fail. Every draggable needs:

1. A **keyboard path**: Space/Enter lift → arrows move → Space/Enter drop → **Escape cancels**.
2. A **single-pointer path**: an explicit `Move to →` menu on the item. Not arrow-key-only.
3. **Live announcements** for lift, move, drop, and cancel.
4. **Focus retained** on the moved item after the move completes.

Full spec in `05-board-and-dnd.md §5.6`.

---

## 8.6 Motion & color

- `prefers-reduced-motion: reduce` disables all non-essential animation with an instant or opacity-only fallback — never "nothing happens at all."
- Nothing flashes more than three times per second.
- Anything auto-playing or looping longer than 5s has a pause control.
- The full UI must be usable and comprehensible in grayscale.
- Never red-vs-green as the only differentiator.

---

## 8.7 Verification

Before any UI change is considered done:

1. **Tab through it.** Everything reachable, visible focus, sensible order, Escape works.
2. **Unplug the mouse** and complete the primary task end to end.
3. **Grayscale it** (DevTools rendering → disable color). Does every status still read?
4. **Zoom to 400%.** Single column, no horizontal scroll except inside table/board containers.
5. **Check contrast** on any new color pairing, in **both** themes.
6. **Run axe DevTools.** Zero violations.
7. **Emulate `prefers-reduced-motion`.** Nothing breaks, nothing becomes invisible.

Automated tooling catches roughly a third of real issues. Steps 1–2 catch most of the rest.

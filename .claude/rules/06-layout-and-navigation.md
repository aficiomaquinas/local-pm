# 06 — Layout, Navigation, Dialogs & Responsive

---

## 6.1 App shell

Persistent **left sidebar** + thin top bar. Never top-only navigation — it wastes the horizontal space boards and tables need, and cannot express team → project → view depth.

| Element | Spec |
|---|---|
| Sidebar width | **256px** default |
| Sidebar collapsed (icon rail) | **48px** |
| Sidebar resize bounds | 200px min, 480px max |
| Top bar height | 48px |

- Sidebar is **drag-resizable**. The handle gets `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`, **Arrow keys** to nudge, **Shift+Arrow** for larger steps, **Home/End** to snap to min/max, and **double-click to reset to default**.
- Width persists to localStorage, **clamped on read** — fall back to the default if stored data is corrupt or out of bounds.
- **Nav nesting caps at 2 visible levels.** Deeper hierarchy goes to breadcrumbs or the content pane.
- **Active state = background tint + leading accent bar.** Bold text alone does not read at a glance.
- A collapsible **Favorites / Pinned** section sits above the main tree, decoupled from hierarchy, so frequent destinations are one click away regardless of nesting.
- Sidebar items use a roving tabindex: arrows move focus, Enter/Space activates.
- **Global search and the command palette are the same surface** (`Cmd/Ctrl+K`). Do not ship two separate entry points for finding things.

---

## 6.2 Page layout

| Context | Width |
|---|---|
| Prose, descriptions, comments | 640–720px (65–75 characters) |
| Settings / forms | 960px |
| Detail page | 1140px |
| Tables and boards | Full available width — no artificial cap |
| App shell | 1440–1600px, then side gutters |

**Page header** = title + right-aligned primary actions, with tabs/filters below. Sticky on scroll. Its bottom border appears only once content has scrolled beneath it — no hard line on an unscrolled page.

---

## 6.3 Detail views: which surface

See the decision tree in `00-principles.md §0.2`. Summary:

| Surface | Use | Width |
|---|---|---|
| **Full page** | The canonical ticket/project. Primary pattern, with a persistent Back. | — |
| **Side peek** | Glance at a record from board/list without losing scroll position | 480–640px |
| **Centered modal** | Short blocking task, single confirmation | see 6.4 |
| **Split pane** | Rapid sequential triage, backlog grooming | 50/50 |
| **Popover** | Menus, pickers, dates — non-blocking, anchored | — |
| **Bottom sheet** | The mobile substitute for peek and modal | — |

Rules that hold across all of them:
- **Every detail view has its own URL.** Opening a peek pushes history; Back closes it.
- Any UI change the user experiences as a new view pushes a history entry.
- **Never stack a modal over a panel, a popover, or another modal.** Replace content in place (a wizard's next step) instead.
- If a second-level confirmation inside a modal is truly unavoidable, it is exactly one `alertdialog` deep, and closing it returns focus to the parent modal — not the page.

---

## 6.4 Dialog sizing

| Size | Width | Use |
|---|---|---|
| sm | 440px | One confirmation, one field |
| md | **600px** | Standard forms — the default |
| lg | 780px | Multi-section forms, rich previews |
| xl | 960px+ | Complex multi-step |
| full | Full screen | Document-like editing; every dialog below `sm` breakpoint |

- **Max height 85vh.** Header and footer stay sticky; only the body scrolls. The user must never scroll the page to reach Save.
- Backdrop: 50–70% opacity scrim, at most 4–8px blur. Larger blur radii are expensive and barely perceptible.
- Enter 240ms, exit ~180ms (≈75% of enter). `transform` and `opacity` only.

---

## 6.5 Dialog behavior — the full spec

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the visible title. Prefer a visible title over `aria-label`.
- `role="alertdialog"` **only** for urgent destructive confirmations. It is more disruptive; do not reach for it by default.
- **Focus trap**: Tab and Shift+Tab cycle within the dialog and wrap at both ends. Nothing outside is reachable by keyboard, pointer, or screen reader — apply `inert` to the rest of the DOM if not using native `<dialog>`.
- **Initial focus, contextually**:
  - Form → the first field.
  - Destructive confirmation → the **least** destructive button.
  - Long informational content → the heading, via `tabIndex={-1}`, so it is announced rather than skipped.
- **Focus returns to the triggering element** on close. If that element is gone, focus a sensible neighbour.
- **Escape closes** — unless an irreversible operation is mid-flight (an upload in progress).
- **Click-outside-to-close is disabled whenever the dialog holds dirty form state.** Intercept with the discard confirmation. It is safe for read-only previews, menus, and simple confirmations.
- **Lock body scroll** while open, and compensate for the removed scrollbar width so the page behind does not shift.

---

## 6.6 Responsive

Breakpoints (mobile-first, min-width): `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. No ad-hoc values.

| Desktop pattern | Below `md` |
|---|---|
| Sidebar | Off-canvas drawer + **bottom nav for primary sections** |
| Kanban board | Single column per screen + column switcher |
| Wide table | Card-per-row list with key fields, tap to expand |
| Side peek | Bottom sheet |
| Centered modal | Full-screen |
| Hover row actions | Always-visible control or overflow menu |

- **Bottom nav, not hamburger, for primary sections.** Hidden navigation measurably reduces use: users engage with visible nav ~1.5× more, take ~2.5s longer on hamburger tasks, and rate them ~15% harder. Hamburger is for secondary/overflow only.
- **All hover affordances are scoped with `@media (hover: hover)`.** Touch devices otherwise inherit stuck ghost-hover states.
- **Form inputs ≥16px font on mobile** or iOS Safari zooms on focus.
- Fixed bottom bars pad with `env(safe-area-inset-bottom)` and reposition against the virtual keyboard via the `visualViewport` API — never let the keyboard bury the compose box.
- Touch targets 44px, with ≥8px between adjacent targets.

**Reflow (WCAG 1.4.10)**: the layout must reflow to a single column with no two-dimensional scrolling at **320px** equivalent (400% zoom at 1280px). Tables and boards are the permitted exception, each inside its own scroll container.

**Text spacing (WCAG 1.4.12)**: the UI stays usable when the user overrides line-height to 1.5×, paragraph spacing to 2×, letter-spacing to 0.12em, word-spacing to 0.16em. Never hardcode a container height that clips text under those overrides.

---

## 6.7 Breadcrumbs

- Only when location is not already obvious from the sidebar — deep settings, nested folders.
- **Never wrap to a second line.** When space runs out, collapse middle segments behind an ellipsis overflow menu. Do not truncate individual labels into ambiguity.
- Breadcrumb tap targets meet the same 44px minimum.

---

## 6.8 Long content in constrained panels

- **Clamp by lines, not characters** — `line-clamp-3` to `line-clamp-6` for previews, with a **Show more** toggle. Character counts cut mid-word.
- Long code or log output collapses beyond ~20 lines, showing `+N lines` and an expand control. Always pair with a **copy button**.
- Long comment threads virtualize or paginate. The compose box stays sticky at the bottom of the panel.

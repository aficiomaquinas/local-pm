# 05 — Board, Cards, Drag & Drop, Real-time

> Stack note: drag and drop uses `@dnd-kit`. Native HTML5 `draggable` is
> **banned** — it does not work on touch at all.

---

## 5.1 Board structure

| Property | Value |
|---|---|
| Column width | **288px** (acceptable range 272–300px; never below 240px — chips start wrapping) |
| Column gap | 16px |
| Visible columns before horizontal scroll | 5–7 at 1280–1440px |
| Card gap within a column | 8px |
| Column padding | 12px |

- **Column header** shows: title, item count, optional WIP limit as `count/limit` (warning color when exceeded), an add-card button, and an overflow `⋯` menu. It stays **sticky** during vertical scroll within the column.
- Board scrolls horizontally with **CSS scroll-snap** (`scroll-snap-type: x proximity`, `scroll-snap-align: start` per column) so a swipe settles on a column edge, not mid-column.
- **Columns can collapse** to a narrow vertical strip showing a rotated title and the count.
- **Primary "add card" sits at the top of the column** — always visible without scrolling.
- **Virtualize any column that can exceed ~50 cards.** Overscan 1–2 items.
- Swimlanes only for a genuine second grouping dimension. If added, decide explicitly whether WIP limits are per-column, per-swimlane, or both.

---

## 5.2 Card design

The title is the only mandatory element. Everything else earns its place.

**Hard budget per card:**

| Element | Max |
|---|---|
| Title | 2 lines (`line-clamp-2`) — never 1, the user needs enough to disambiguate |
| Metadata items | **4** |
| Visible chips/labels | **3**, then `+N` |
| Visible avatars | **3**, then a `+N` avatar |
| Accent colors | **1** |

- Everything beyond that budget belongs in the detail view: description, comments, activity, attachments, subtask lists.
- **Minimum 12px internal gap** between grouped card elements. Below that, boundaries stop reading.
- Cards are content-height, not fixed. Cap what is *shown* (labels wrap once, not infinitely) rather than hard-capping pixels.
- Attention lands top-left. Put the single most decision-relevant fact there.

**Hover vs always-visible**
- **Always visible**: anything needed to triage — priority, assignee, due date, blocked state, label.
- **Hover/focus-revealed**: secondary actions — quick edit, move-to, delete, drag handle.
- Never hover-gate information. Wrap hover affordances in `@media (hover: hover)`.

---

## 5.3 Color on cards

- **One accent per card**, as a left edge stripe or a dot. Never a full-bleed colored card — it reads as noise at column scale.
- **Workspace label palette: 5–8 colors maximum.** Past ~8, users can no longer map color to meaning without reading, which defeats the point.
- **Never color alone (WCAG 1.4.1).** Priority is shape-first (`▲▲▲` / `▲▲` / `▲` / `–` / `·`), color second. Status carries an icon. Blocked carries the word.
- Never let two adjacent states differ only by hue (red vs orange). Vary shape and lightness.
- Tinted chip backgrounds still owe 4.5:1 text contrast against the tint.

---

## 5.4 Chips, badges, tags

- **Badges are static. Chips are interactive.** Do not style them identically — that is a false affordance.
- Badge text: **1–2 words**. If it needs more, it is not a badge.
- **Dot** when space is tight and the mapping is learned. **Filled pill** for primary salience (current status, blocked). **Outline/tinted pill** for secondary tags so they do not compete.
- Truncate chip text at a fixed max-width with a `title` tooltip. Never let a chip stretch the card.
- Removable chips get an explicit trailing `×` target — never whole-chip-click-to-remove, which collides with click-to-filter.
- Interactive chips get a visible hover state distinct from static badges.

---

## 5.5 Drag & drop

### Affordance
- Primary drag surfaces show a **persistent handle**; secondary ones reveal it on `:hover` / `:focus-within`.
- Handle hit area ≥ 24 × 24px (44px on touch).
- `cursor: grab` at rest, `grabbing` during drag.

### During drag
- **Source item stays in place at 40% opacity.** It does not vanish — the gap it leaves is disorienting.
- Drag preview capped at ~280px. **Never rotate it.** Multi-select drags show a stacked preview with a count badge.
- **Drop indicator: a 2px insertion line** with a terminal dot for in-list reordering. It must be wider than the dragged item so it stays visible beneath the ghost, at ≥3:1 contrast.
- Reserve **full drop-zone background highlighting** for container-level drops (an empty column, a group). Do not use it for simple reordering — it is noisier and less precise than a line.
- **Only highlight valid targets.** Signal invalid drops *before* the user commits (dimmed target, `not-allowed` cursor) — never with a post-drop error.
- **Auto-scroll accelerates** as the pointer nears the scroll container edge. A flat rate overshoots.

### On drop
- **Reorder optimistically.** Paint it immediately, write behind it.
- Landing flash (~700ms) on the moved card confirms placement without text.
- Reorder animation ~250ms baseline, scaling with distance moved.
- **On server failure: animate the card back to its origin and toast the reason.** Never silently revert on next refresh.
- Offer **Undo for ~5–10s** after any cross-column move — it changes workflow state.

### Ordering keys
Use **fractional / lexicographic ordering keys**, not integer positions. A new key is the midpoint between its neighbours, so a single move touches one row and two concurrent drags cannot collide or force a cascading renumber. This is the Figma multiplayer approach and it is the only ordering scheme that survives real-time editing.

---

## 5.6 Drag & drop accessibility — mandatory

**WCAG 2.2 SC 2.5.7 (Dragging Movements, AA)**: any function operated by dragging must also work with a single pointer without dragging. The specification's own worked example is a kanban board. **A drag-only board fails AA.**

**Required non-drag path:** every card's `⋯` menu contains **Move to →** with explicit destinations (`Move to In Progress`, `Move up`, `Move down`). Explicit menu items, not arrow-key-only alternatives — directional keys do not translate across screen-reader modes.

**Required keyboard path:**

| Key | Action |
|---|---|
| Space / Enter | Lift the focused card |
| Arrow keys | Move it |
| Space / Enter | Drop |
| **Escape** | Cancel and return to origin |

**Required announcements** — an off-screen `aria-live` region narrating the full lifecycle, naming the item and both positions:

> `Task "Fix login redirect" moved to list "In Progress" from "Todo".`

"Item moved" is not sufficient.

**Focus**: after a move, focus stays on (or is programmatically restored to) the moved card. Never strand focus at the top of the page when the node remounts into a new parent.

**Touch**: require a **150–500ms long-press** before a touch drag activates — iOS's scroll recognizer claims a touch in well under 100ms, and without the delay every scroll becomes a drag. Set `touch-action: none` on draggables so the browser does not fight the gesture.

**Reduced motion**: `prefers-reduced-motion` gets fade-only transitions for lift, move, and landing.

---

## 5.7 Action feedback on the board

- **Never toast what the user can already see.** A card visibly moving into a new column does not need "Card moved."
- Counts and badges update **live and in place**. They are ambient state, not events to announce.
- Toast only when the result is outside the viewport (assigned to someone not visible, moved to a collapsed column) or the operation was async.
- Confirmation dialogs only for destructive or irreversible board operations (deleting a column with cards in it).

---

## 5.8 Real-time / multiplayer

- **Never reorder a list the user is actively dragging in.** Treat an in-progress drag as a lock: defer conflicting remote updates until drop, then reconcile. Apply non-conflicting updates immediately.
- **Field-level merge, not whole-record last-write-wins.** During a move only the column/position field is contested; a whole-record overwrite silently discards someone's concurrent title edit.
- Combined with fractional ordering keys (5.5), two people dragging in the same column at the same time converge without stomping each other.
- **Presence**: small avatar indicators for who is viewing the board or the open ticket. Scope it to "who is here", not full canvas cursors — multiplayer should remove coordination work, not add UI noise.
- **Throttle ephemeral presence separately** from durable data changes (~30fps coalesced) so presence chatter never delays committed writes.
- `Updated by <name>` surfaces only for items the user currently has open or focused, not for every ambient board change.
- If a record changed while the user was away or offline, show an **updated** dot on refocus rather than silently replacing what they were looking at.

---

## 5.9 Mobile board

- Multi-column horizontal boards are unusable one-handed. Below `md`, collapse to a **single column per screen** with a column switcher and swipe (scroll-snap) between columns.
- **Cross-column moves on mobile use a "Move to…" bottom sheet**, not drag. This is both the pragmatic mobile answer and the WCAG 2.5.7 alternative the desktop owes anyway.
- Within-column reordering may keep a real drag gesture (long-press + `touch-action: none`), since it does not compete with horizontal panning.
- Every interactive element on a mobile card meets 44px, with ≥8px between adjacent targets. Increase card padding versus desktop.

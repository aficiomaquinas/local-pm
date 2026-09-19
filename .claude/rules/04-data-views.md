# 04 — Data Views: Tables, Filters, Sorting, Pagination, Search

> Scope: list view, table view, any dense collection of records.

---

## 4.1 Table anatomy

| Property | Value |
|---|---|
| Row height — compact | 32px |
| Row height — default | **36px** |
| Row height — comfortable | 44px |
| Header row height | Matches body row height. Never taller. |
| Horizontal cell padding | 12px |
| Row separator | 1px `--color-border-subtle` |

- **Density is a user setting**, persisted to localStorage. Default is 36px — the comparison-optimal range for task lists.
- **No zebra striping.** Combined with hover, selected, focused and disabled states, striping produces five competing grey levels and destroys the row rhythm. Hairline borders instead. (Striping is acceptable only in a static, non-interactive, read-only report.)
- **First column is a human-readable title**, never a raw ID. It anchors every scan.

### Alignment

| Content | Alignment |
|---|---|
| Text, titles, names | Left |
| Quantitative numbers (counts, estimates, percentages, currency) | **Right**, with `tabular-nums` |
| Dates, IDs, statuses, phone numbers | Left |
| Anything | **Never center** |

Headers align to match their column's content.

Vertically: center content up to 3 lines; top-align beyond 3.

### Wide tables

- **Sticky header** on vertical scroll. **Sticky first column** (and the trailing actions column) on horizontal scroll.
- **Truncate with ellipsis + `title` tooltip** for dense single-line columns. Wrap only where losing the content breaks the task.
- Solve column overload with **hide/show controls**, never by shrinking type or padding.
- Target: the default column set requires **zero or one horizontal scroll at 1280–1440px**.
- Columns are resizable (drag the separator), reorderable (drag, with a list-based fallback for keyboard), and hideable via a "Columns" menu that shows the hidden count and a **Reset to default**.

---

## 4.2 Row interactions

- **The whole row is clickable** to open the record. Keep interactive children (checkbox, inline buttons, links) out of the row-click zone so they never conflict.
- **1–2 row actions → inline buttons. 3+ → an overflow `⋯` menu.**
- **Hover-only actions are an accessibility failure.** Every `:hover` style must be mirrored on `:focus` / `:focus-within`, and the control must remain keyboard-reachable. Prefer a persistent low-opacity affordance that *intensifies* on hover over one that appears from nothing.
- Wrap hover affordances in `@media (hover: hover)` so touch devices never inherit a stuck hover state.

### Selection & bulk actions

- Header checkbox selects **only the rows currently rendered**.
- When a filter or more pages exist, offer a distinct second action: **"Select all 1,240 matching"** — a separate, explicitly labelled affordance, never an implicit expansion of the first.
- Always display the resolved count: `1,240 selected`.
- The **bulk action bar appears only after ≥1 selection**, docked bottom, centred over the content column, sticky while scrolling, with a one-click **Clear**.
- Destructive bulk actions get a confirmation naming the count. Non-destructive ones execute with an undo toast.

### Keyboard

- A simple list table uses a semantic `<table>`, normal tab order, and **Enter to open the focused row**. This is the default — do not over-engineer.
- A full ARIA grid (`role="grid"`, roving tabindex, `aria-rowindex`/`aria-colindex`) is required **only** for cell-editable, spreadsheet-like tables. If virtualized, `aria-rowcount` is mandatory since rows are absent from the DOM.

---

## 4.3 Filtering

- **Filters live in a top toolbar** above the collection. Not a left rail — that pattern belongs to catalog browsing, not task lists.
- **Apply instantly** when filtering is client-side and cheap. **Require an explicit Apply** when it costs a server round trip or composes several criteria at once.
- Every active filter renders as a **removable chip** near the top of the results, visible without opening the filter UI, plus **Clear all** once any filter is active.
- Always show a live result count: `128 tickets`.

### URL vs localStorage

| Goes in the URL (shareable) | Goes in localStorage (personal) |
|---|---|
| Filters, sort, grouping, search query, selected record | Column order, column visibility, density, sidebar width |

- Use `replaceState` for incremental edits (typing in search) and `pushState` for deliberate filter changes, so Back does something sensible instead of replaying keystrokes.

### Complex filters

- Default bar: **simple AND-only chips**. This covers the overwhelming majority of use.
- Gate AND/OR and nested groups behind an explicit **Advanced filter** builder. Do not make every user pay for boolean logic.
- Structure each row as **property → operator → value**, with operators adapting to the property type:
  - single-select: `is` / `is not`
  - multi-select: `is any of` / `is none of`
  - labels/relations: `includes any` / `includes all` / `includes none`
  - dates: `before` / `after` / `on` / `is empty`
- Render the composed filter as an editable natural-language line: *Assignee is Alex and Status is not Done*. Each clause is independently clickable.

### Saved views

Named, savable bundles of **filter + sort + grouping + visible columns**, scoped Personal or Team, with one marked default. This is baseline expected functionality, not a stretch feature.

---

## 4.4 Search

- **Search** is free text over an unbounded set. **Filter** constrains a known set by discrete values. Do not merge them in the UI.
- Debounce: **300ms** (200ms client-side, up to 500ms for a server round trip).
- Minimum query length: **3 characters** before firing suggestions.
- **Highlight matched substrings** using the match indices from the search engine — unhighlighted fuzzy results read as arbitrary.
- Default scope to the current context (this project / this team), with an explicit **Search everywhere** toggle.
- `/` focuses the in-view search box. `Cmd/Ctrl+K` opens the global command palette. These are different things — see `09-keyboard.md`.

---

## 4.5 Sorting

- Click a header to sort ascending, again for descending. Show the directional arrow **only on the active column**; reveal a neutral indicator on header hover for discoverability.
- **Shift+click** chains a secondary/tertiary sort, with numbered priority badges (1, 2, 3) on each active header.
- **Always ship a meaningful default sort** (most recently updated, or priority). Insertion order is not a sort.
- **Sort and manual drag-ordering must never fight.** When a column sort is active, disable drag-to-reorder and say why.
- When grouping is active, sort applies **within** each group; groups get their own explicit order.

---

## 4.6 Grouping

- Group headers are **sticky** within the scroll container, **collapsible** independently, and carry a **count badge** (`In Progress · 14`).
- Show an aggregate in the header when the grouped column is numeric (sum of estimates, etc.).
- Collapse state persists per view.

---

## 4.7 Pagination, load more, infinite scroll

**Default: cursor-based "Load more".** Not pure infinite scroll.

- Pure infinite scroll breaks the back button, makes positions unshareable, hides the footer permanently, and defeats comparison — Baymard's research is unambiguous that it harms browse and search results.
- Load **25–75 items** per batch. Provide a **Back to top** affordance once past the first batch.
- If infinite scroll is used anywhere, the History API work is **mandatory, not optional**: persist the loaded-batch cursor and scroll offset in history state so Back restores the exact prior position and the previously loaded batches.

| Situation | Mechanism |
|---|---|
| Primary ticket/project list | Cursor-based Load more |
| Admin/report views needing page numbers and totals | Offset pagination with page-size options (25/50/100) |
| Never | Pure infinite scroll with no state persistence |

Offset pagination degrades badly at depth and shuffles items between pages under concurrent writes. Use it only where page numbers are genuinely required.

### Virtualization

- Start virtualizing once a list **can exceed ~50–100 rendered rows**. Always virtualize anything unbounded.
- Overscan **1.5–2× the visible row count** to prevent blank flashes on fast scroll.
- Virtualized rows must carry `aria-rowindex` and the container `aria-rowcount`.

---

## 4.8 Empty states

Three distinct states. Never render the same component for all three.

| State | Must contain |
|---|---|
| **No data yet** | Plain statement of what appears here + a primary CTA to create the first one. Never a bare blank area — it reads as broken or still loading. |
| **No results for this filter/search** | The active filter chips, a plain "nothing matched" line, and **Clear filters** as the primary action. Must **not** offer "create" — the data may well exist. |
| **Error** | What failed, in plain language, and a **Retry**. Never visually identical to a legitimate empty result. |

---

## 4.9 Data freshness

- **Stale-while-revalidate**: render cached data immediately, refetch behind it. Never re-show a full loading state for data the user has already seen.
- Optimistic updates for idempotent, reversible, visually verifiable actions (toggle, reorder, assign).
- **Never optimistic** for destructive or irreversible operations — show a real pending state.

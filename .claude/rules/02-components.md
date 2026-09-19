# 02 — Component Specs

Concrete specs for the shared primitives in `src/components/ui/`. Every value here
resolves to a token from `01-foundations.md`.

---

## 2.1 Control sizes

One height scale for every control — buttons, inputs, selects, chips must line up
when placed in a row.

| Size | Height | Padding-x | Font | Icon | Radius |
|---|---|---|---|---|---|
| `xs` | 24px | 6px | 12px | 14px | 4px |
| `sm` | 28px | 8px | 13px | 16px | 6px |
| `md` | **32px** | 12px | 14px | 16px | 6px |
| `lg` | 40px | 16px | 14px | 20px | 8px |

`md` is the default. `lg` is for primary actions in dialogs and empty states.
**On touch, every control is at least 44px tall** regardless of visual size — pad the hit area, not the box.

---

## 2.2 Button

| Variant | Use | Rest | Hover |
|---|---|---|---|
| `primary` | The one main action per view | `accent` fill, `accent-fg` text | `accent-hover` |
| `secondary` | Alternate actions | `surface` fill, `border` outline | `surface-hover` |
| `ghost` | Toolbar, row, and icon actions | transparent | `surface-hover` |
| `danger` | Destructive confirmation | `danger` fill | `danger-hover` |
| `link` | Inline navigation in text | `accent-text`, underline on hover | — |

- **One `primary` per view.** Two primaries means neither is.
- Label with a verb naming the outcome: `Create ticket`, `Delete project`. Never `OK`, `Submit`, `Yes`.
- Destructive buttons always carry the explicit verb and, where an icon is present, the icon too.
- Loading state: replace the leading icon with a spinner, keep the label, disable, keep the width fixed so nothing reflows.
- Disabled only means "not available right now" — never "you haven't filled the form correctly" (see `03-forms-and-editing.md §3.12`). A disabled button that never explains itself is a defect.
- Icon-only buttons need `aria-label` and a tooltip.

---

## 2.3 Input / textarea / select

- Height per the control scale; radius `sm`; 1px `--color-border`.
- States: rest `border` · hover `border-strong` · focus `2px focus ring, 2px offset` · invalid `danger` border + error text · disabled `surface-hover` bg + `text-disabled`, cursor `not-allowed`.
- Placeholder is `text-muted` and must still clear 4.5:1. It is a *hint*, never a label.
- Textareas auto-grow to a max height, then scroll. Never a fixed 3-row box the user has to fight.
- Every input has a programmatically associated `<label>`. `aria-label` only where a visible label is genuinely impossible.

---

## 2.4 Chip / badge

| | Badge (static) | Chip (interactive) |
|---|---|---|
| Height | 20px | 24px |
| Padding-x | 6px | 8px |
| Font | 12px / 500 | 12px / 500 |
| Radius | `xs` (4px) | `full` for filters, `xs` for labels |
| Hover | none | `surface-hover` + pointer |

- Text: **1–2 words**. Truncate at a max-width with a `title` tooltip.
- Tinted backgrounds use the hue's step 3 with step 11 text — that pairing is contrast-safe by construction.
- Removable chips carry a trailing `×` with its own hit area. Never whole-chip-click to remove.
- **Do not style a static badge like an interactive chip.** That is a false affordance.

---

## 2.5 Avatar

| Size | px | Use |
|---|---|---|
| `xs` | 16 | Inline in dense table rows |
| `sm` | 20 | Cards, list rows |
| `md` | 24 | Detail headers |
| `lg` | 32 | Profile, member lists |

- Fallback is initials on a hue derived deterministically from the user ID — same person, same color, always.
- Avatar groups overlap by 25% and show **max 3**, then a `+N` circle styled as a real affordance (it opens the full list), not a dead label.
- Every avatar has an accessible name.

---

## 2.6 Menu / dropdown

- Min width 180px, max 320px. Item height 32px. Radius `lg`. Elevation 2.
- Keyboard: ↑/↓ moves, Enter activates, Escape closes and returns focus to the trigger, type-ahead jumps to matching items.
- `role="menu"` with `menuitem` children; the trigger carries `aria-haspopup` and `aria-expanded`.
- Group with separators and, where useful, small uppercase section labels.
- **Destructive items go last, after a separator, in `danger-text`.**
- Show the keyboard shortcut right-aligned on any item that has one. This is how shortcuts get learned.
- Never nest more than one submenu level.

---

## 2.7 Tooltip

- Appears after **400ms** hover delay; **instantly on keyboard focus**; disappears immediately on leave.
- 12px text, elevation 2, max-width 280px.
- **A tooltip is an enhancement, never the only source of information.** Never put an error, an instruction, or a required label in one. Touch users never see it.
- Icon-only controls get both `aria-label` and a tooltip — the tooltip is for sighted mouse users, the label for everyone else.

---

## 2.8 Card (board card, list card)

- Padding 12px. Radius `md`. Elevation 0 at rest, 1 on hover. 1px `border-subtle`.
- **Nested radius rule applies**: a chip inside a 12px-padded, 8px-radius card gets 4px.
- Hover lifts by background tint, not by `translateY` — a moving card under the cursor is a drag affordance, and the board already owns that gesture.
- Respect the card content budget in `05-board-and-dnd.md §5.2`.

---

## 2.9 Table row

- Height per `04-data-views.md §4.1`. Separator 1px `border-subtle`. No striping.
- States: hover `surface-hover` · selected `accent-subtle` + a 2px leading accent bar · focused `focus ring inset`.
- Selected and hover states must be distinguishable when both apply.

---

## 2.10 Dialog / panel / sheet

Behaviour and sizing are specified in `06-layout-and-navigation.md §6.4–6.5`. Structure:

```
┌─ header  (sticky) — title + close ─┐
│  body    (scrolls)                 │
└─ footer  (sticky) — actions ───────┘
```

- Footer actions: secondary left, primary right. Destructive primary sits right but is never auto-focused.
- Close button is top-right, 32px, `aria-label="Close"`.
- Title is a real heading and is what `aria-labelledby` points at.

---

## 2.11 Empty state

```
icon (24px, text-muted)
heading (16px / 600)
one line of explanation (14px / text-muted, max 2 lines)
primary action
```

Three variants, never interchangeable — see `04-data-views.md §4.8`. Illustrations are optional and only for first-run states; filtered-empty and error states stay compact.

---

## 2.12 Skeleton

- Shape matches the real content's exact dimensions. Any layout shift on resolve is a bug.
- Animate with an opacity pulse, not a sweeping gradient. `prefers-reduced-motion` → a static tint.
- Render 3–5 placeholder rows, never a full screen of them.

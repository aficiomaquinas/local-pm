# 00 — Principles & Decision Trees

The product is a keyboard-first, fast, dense project management app. Its reference
points are Linear (speed, opinion, quiet chrome), Notion (three-tier disclosure),
and GitHub (keyboard conventions). Its anti-references are Jira (configurability
that outran usability), ClickUp (feature breadth as attention tax), and Monday
(decorative color drowning semantic color).

---

## 0.1 The ten non-negotiables

1. **Speed is a feature.** Target sub-100ms perceived response for every routine action. Write optimistically, reconcile in the background. Above ~100ms users feel the machine; Linear and Superhuman both engineer to this number.
2. **Keyboard parity.** Every action reachable by mouse is reachable by keyboard. No exceptions, including drag and drop.
3. **Nothing lives only in ephemeral UI.** If a user needs to act on it or find it later, it does not belong solely in a toast.
4. **Color never carries meaning alone.** Every status, priority, and label pairs color with shape, icon, or text. The app must work in grayscale.
5. **Every view is a URL.** Detail views, filters, sorts, and tabs are addressable, reloadable, shareable. Client-only state that the user perceives as a place is a bug.
6. **Tokens, not values.** No raw hex, px, or ms in component code.
7. **Optimistic, then honest.** Paint the result immediately; on failure revert visibly and say why. Never fail silently, never leave a lie on screen.
8. **Density with air.** Dense does not mean cramped. ≥12px between grouped elements, always.
9. **Undo beats confirm.** Reversible actions execute immediately with an undo path. Dialogs are for the genuinely irreversible.
10. **Say no.** Every feature added to primary navigation taxes every user's attention. Breadth is inversely correlated with perceived quality unless progressive disclosure is enforced ruthlessly.

---

## 0.2 Where does this detail view go?

```
Does the user need to see the list/board while working on it?
├─ No ─ Is it a short, self-contained task finished in one screen?
│        ├─ Yes → Centered modal
│        └─ No  → Full page
└─ Yes ─ Is it a glance, or sustained work?
         ├─ Glance    → Side peek panel
         └─ Sustained → Split pane
```

Cross-cutting override: **anything a user would bookmark, share, or reload must have a full-page URL**, whatever surface it opens in from a list.

| Surface | Use for |
|---|---|
| **Full page** | Ticket detail, project detail — the canonical, linkable object. Primary pattern. |
| **Side peek (panel)** | Quick look at a ticket from board/list without losing scroll position |
| **Centered modal** | Create ticket, single confirmation, one-field edit |
| **Split pane** | Backlog grooming, rapid sequential triage |
| **Popover** | Menus, pickers, date selection — non-blocking, anchored, dismiss on outside click |
| **Bottom sheet** | The mobile substitute for any of the above |

**Never stack a modal on a modal, a panel, or a popover.** If a form modal needs a discard confirmation, that is exactly one `alertdialog` deep, and closing it returns focus to the form.

---

## 0.3 How much feedback does this action need?

Scale feedback to frequency and stakes. Over-feedback trains users to ignore all of it.

| Action | Feedback |
|---|---|
| Routine, result visible on screen (drag a card, toggle a checkbox, edit a title) | **In place only.** The visible change *is* the feedback. No toast. |
| Result not visible in the current viewport (assign to someone off-screen, bulk update) | Quiet toast |
| Reversible destructive (archive, soft delete, bulk move) | Execute + undo toast, ≥10s |
| Background/async (import, export, long sync) | Progress, then a notification-center entry |
| Irreversible destructive | Confirmation dialog before, toast after |

**Never toast what the user can already see.** "Card moved" after the user watched the card move is noise.

---

## 0.4 Loading: what do I show?

```
< 100ms          nothing (optimistic)
100ms – 1s       nothing, or inline indicator on the changed element only
1s – 10s         skeleton (structural) or determinate progress (knowable size)
> 10s            progress with estimate + a way to keep working elsewhere
```

Delay any spinner/skeleton **150–200ms**; once shown hold it **400–500ms** minimum. Never a full-screen loader for a partial update.

---

## 0.5 Which control?

| Options | Control |
|---|---|
| 2–4 exclusive | Radio group, or segmented control if it reads as a mode switch |
| 5–6, all visible | Radio group |
| 7–15 | `select` |
| >15 or dynamic | Combobox with type-ahead |
| Multi-select | Combobox + removable chips |

---

## 0.6 Density defaults

| Context | Value |
|---|---|
| Default UI text | 14px |
| Dense rows, sidebar, card metadata | 13px |
| List/table row height | 36px default, 32px compact, 44px comfortable |
| Board column width | 288px |
| Sidebar | 256px, collapsible to 48px, resizable 200–480px |
| Minimum gap inside grouped content | 12px |
| Minimum touch target | 44px (24px absolute floor, only with 24px spacing) |

---

## 0.7 Naming and code conventions

- Components are `PascalCase.tsx` under `src/components/<domain>/`.
- Shared primitives live in `src/components/ui/` and take no domain knowledge.
- A component that fetches is a different component from one that renders. Keep presentational components free of data access so they stay testable and reusable.
- Class order: layout → box → typography → color → state → responsive. Use `cn()` for conditional classes, never string concatenation.
- No inline `style` except for genuinely dynamic values (a computed drag transform, a percentage width).
- Every interactive element is a real `button`, `a`, `input`, or `select`. A `div` with `onClick` is a bug — it loses focus, keyboard activation, and semantics.

---

## 0.8 When in doubt

- Prefer the pattern the user already knows from Linear/GitHub over a clever original.
- Prefer removing a field to shrinking the type.
- Prefer whitespace to a divider, a divider to a shadow.
- Prefer one clear primary action to three equal ones.
- If a pattern needs a legend or a tooltip to be understood, redesign the pattern.

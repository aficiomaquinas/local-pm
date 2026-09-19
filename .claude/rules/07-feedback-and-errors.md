# 07 — Feedback, Notifications & Error Handling

---

## 7.1 The feedback taxonomy

Pick the weakest surface that does the job. Over-feedback trains users to ignore all of it.

| Surface | Lifetime | Use for |
|---|---|---|
| **In-place change** | Permanent | Routine actions whose result is visible — moves, toggles, inline edits, count updates |
| **Inline field error** | Until fixed | Validation |
| **Inline banner** | Until dismissed or resolved | Standing conditions: offline, degraded sync, unsaved draft, permission notice |
| **Toast** | 4–6s | Low-stakes confirmations, results outside the viewport, undo offers |
| **Dialog** | Until answered | Irreversible confirmations only |
| **Notification center** | Durable | Anything the user may need to find or act on later |

**Two rules govern all of it:**
1. **Never toast what the user can already see.**
2. **Nothing the user must act on or find again lives only in a toast.**

---

## 7.2 Toasts

| Property | Value |
|---|---|
| Position | Bottom-right on desktop, bottom-center on mobile |
| Max simultaneous | **3**, queue the rest |
| Gap between stacked toasts | 8px |
| Duration — short confirmation | 4s |
| Duration — carries an action | 6s |
| Duration — undo | **10s minimum** |
| Duration — error | **Never auto-dismiss** |

- **Errors and any toast whose action is required never auto-dismiss** — WCAG 2.2.1 requires that time limits be disableable, extendable to 10×, or warned before expiry. An auto-expiring required action fails it.
- Screen reader users need roughly **3× longer** to perceive and act on an ephemeral toast. That is the second reason undo windows are generous and the third reason undo is also durable elsewhere.
- Hovering or focusing a toast pauses its timer.
- Every toast is dismissible.

**Announcement**
- `role="status"` (polite) for confirmations and information — the default.
- `role="alert"` (assertive) **only** for genuinely time-critical errors. Assertive interrupts and discards the screen reader's current sentence; overuse makes the app hostile.
- Never stack multiple assertive toasts — queued announcements get cleared.

---

## 7.3 Undo

- Reversible destructive actions **execute immediately** and offer undo. Do not block on a confirmation.
- Undo window ≥10s.
- **Back every undo with a durable path**: an activity log entry, a trash/archive view, or restorable history. The toast expires; recovery must not.
- `Cmd/Ctrl+Z` undoes the last action within the session, including inline edits and board moves.

---

## 7.4 Error taxonomy → UI

| Error | Surface |
|---|---|
| Field validation | Inline, next to the field. **Never** a modal or toast |
| 404 / record missing | Full-page or panel empty state: what is missing + a way back |
| 403 / permission | Explicit "you don't have access to this project" + a path to request it. Never a generic error |
| Offline | **Persistent top banner**: "You're offline — changes will sync when you reconnect." Queue or disable actions that would fail |
| 5xx on one request | Inline error scoped to the affected panel, with **Retry**. Do not blank the page because one widget failed |
| Unexpected render crash | Error boundary fallback scoped to the smallest broken subtree |

---

## 7.5 Error boundaries

- Scope boundaries around **independent regions** — the board, the sidebar, a detail panel — so one failure never blanks the app. One top-level boundary as the last resort.
- Boundaries do **not** catch errors in event handlers or async code. Those need their own `try/catch` reporting into the same surfaces.
- Every fallback offers **Retry** or **Reload**. A dead end is not an error state.

---

## 7.6 Error copy

Structure: **what happened → why (only if it helps) → what to do next.**

- Plain language. No stack traces, no error codes in the primary line, no blame.
- ✅ "Couldn't save your changes. We'll retry automatically — your text is safe."
- ❌ "Error: Request failed with status code 500"

**Long or technical errors** get a short human summary, an expandable **Details** disclosure holding the technical message, and a **copy to clipboard** button so the user can paste it into a bug report without transcription errors.

Full detail always goes to logs and telemetry. The user gets the summary.

---

## 7.7 Loading

Thresholds live in `01-foundations.md §1.8`. The operational rules:

- **<100ms → nothing.** Optimistic write.
- Spinners delayed **150–200ms**, held **400–500ms** minimum once shown.
- **Skeletons for structural first loads only**, matching final dimensions exactly. A skeleton that shifts layout is worse than a spinner.
- **Determinate progress** wherever size is knowable — uploads, imports, bulk operations. Never an indeterminate spinner where a real percentage exists.
- **Never a full-screen loader for a partial update.** Scope the indicator to what actually changed.
- **Stale-while-revalidate** on revisit: show cached data, refetch behind it.

---

## 7.8 Optimistic updates

**Use for**: idempotent, reversible, visually verifiable actions — drag a card, toggle a checkbox, edit a title, assign, add a comment.

**Never use for**: deletes, irreversible state transitions, anything with financial or cascading effect. Those show a real pending state.

On failure:
1. Revert the UI visibly (animate back, do not snap).
2. Say what failed and why.
3. Preserve the user's input so it is recoverable.
4. Offer retry.

Silent reversion on the next refetch is the worst possible outcome — the user believes their change succeeded.

---

## 7.9 Notification center

- Durable record of events the user may act on later: mentions, assignments, state changes on watched items.
- Read/unread state, filtering by unread, and grouping.
- A **Priority** split separating must-act items from ambient updates.
- Anything that appears here and also toasts must reconcile — dismissing the toast does not mark it read.

import { pointerWithin, closestCorners, type CollisionDetection } from '@dnd-kit/core'

/**
 * Drag collision fix (operator report 2026-09-08): dropping a card into the
 * In Progress column did not register — the drag math (computeDragResult,
 * w7) is correct, the failure was collision detection.
 *
 * Root cause: `closestCorners` alone ranks drop targets by summed distance
 * from the pointer to the target's CORNERS. Column droppables are tall
 * scroll containers, so a card hovering over the middle of a column's empty
 * (or lower) area is often numerically closer to a CARD in another column
 * than to the column itself → the drop lands on the wrong column (or on
 * nothing in empty zones), and the status never changes.
 *
 * Fix — composed strategy, smallest change that fixes the report:
 *   1. `pointerWithin` first: any droppable whose rect contains the pointer
 *      wins outright (the pointer is ON the column = the operator's intent).
 *   2. Fallback `closestCorners` (keyboard drags / sensors without pointer
 *      coordinates, or overlaps computed empty): distances to corners of
 *      COLUMN droppables are scaled by boosting them ahead of cards, so a
 *      near-miss drop inside a column still resolves to that column rather
 *      than to a card in a different one.
 *
 * Column droppables are identified by their id being one of KANBAN_COLUMNS
 * (TicketStatus values); cards use Mongo-style ids, never equal to those.
 */
export function prioritizePointerWithin(columnIds: readonly string[]): CollisionDetection {
  const columns = new Set(columnIds)
  return (args) => {
    const pointerCollisions = pointerWithin(args)

    if (pointerCollisions && pointerCollisions.length > 0) {
      // Pointer is inside at least one droppable. Prefer the COLUMN when the
      // pointer is over both the column and one of its cards: dropping onto
      // the column appends at the end — the least surprising behavior when
      // the operator is not aiming at a specific card slot.
      const columnHit = pointerCollisions.find((c) => columns.has(String(c.id)))
      return columnHit ? [columnHit, ...pointerCollisions.filter((c) => c !== columnHit)] : pointerCollisions
    }

    // Fallback: closest corners, with columns boosted above cards so a
    // slightly-outside-the-rect drop still lands in the column under the
    // pointer. (Keyboard drags land here: no pointer position exists.)
    const corners = closestCorners(args)
    if (!corners) return corners
    const columnHits = corners.filter((c) => columns.has(String(c.id)))
    const cardHits = corners.filter((c) => !columns.has(String(c.id)))
    return [...columnHits, ...cardHits]
  }
}

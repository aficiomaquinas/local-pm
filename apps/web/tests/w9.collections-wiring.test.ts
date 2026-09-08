import { describe, it, expect } from 'vitest'
import { Tickets } from '@/collections/Tickets'
import { Projects } from '@/collections/Projects'
import { Teams } from '@/collections/Teams'

/**
 * W9b — collection wiring (BUG-3, structural): every soft-delete collection
 * (tickets/projects/teams) must share the same contract —
 * read = deleted-excluding query constraint, beforeOperation = hard-delete
 * guard, fields = the hidden `deleted` checkbox. Catches the regression
 * where one collection silently drops the wiring (or the spine's parallel
 * edit of Tickets.ts loses one side of it).
 */

function expectSoftDeleteWiring(collection: { slug: string; access: Record<string, unknown>; hooks: { beforeOperation: unknown[] }; fields: Array<Record<string, unknown>> }) {
  describe(`${collection.slug}: soft-delete wiring (BUG-3)`, () => {
    it('read access excludes deleted docs via the query constraint', () => {
      const read = collection.access.read as
        | Record<string, unknown>
        | ((args: unknown) => Record<string, unknown>)
      const constraint = typeof read === 'function' ? read({ req: { user: null } }) : read
      expect(constraint).toEqual({ deleted: { not_equals: true } })
    })

    it('blocks hard delete in beforeOperation (blockHardDelete present)', () => {
      const ops = collection.hooks.beforeOperation as Array<(args: { operation?: string }) => void>
      const guard = ops.find((op) => {
        try {
          op({ operation: 'delete' })
          return false
        } catch {
          return true
        }
      })
      expect(guard).toBeDefined()
      try {
        guard?.({ operation: 'delete' })
      } catch (e) {
        expect((e as Error).message).toMatch(/Hard delete is disabled/)
      }
    })

    it('declares the hidden `deleted` checkbox field', () => {
      const field = collection.fields.find((f) => f.name === 'deleted')
      expect(field).toBeDefined()
      expect(field).toMatchObject({ type: 'checkbox', defaultValue: false })
    })
  })
}

describe('Soft-delete collections (BUG-3)', () => {
  const collections = [
    { slug: Tickets.slug, access: Tickets.access as unknown as Record<string, unknown>, hooks: Tickets.hooks as unknown as { beforeOperation: unknown[] }, fields: Tickets.fields as unknown as Array<Record<string, unknown>> },
    { slug: Projects.slug, access: Projects.access as unknown as Record<string, unknown>, hooks: Projects.hooks as unknown as { beforeOperation: unknown[] }, fields: Projects.fields as unknown as Array<Record<string, unknown>> },
    { slug: Teams.slug, access: Teams.access as unknown as Record<string, unknown>, hooks: Teams.hooks as unknown as { beforeOperation: unknown[] }, fields: Teams.fields as unknown as Array<Record<string, unknown>> },
  ]

  for (const collection of collections) {
    expectSoftDeleteWiring(collection)
  }

  it('keeps the restore guard alongside the delete guard in every collection', () => {
    for (const { slug, hooks } of collections) {
      const ops = hooks.beforeOperation as Array<(args: { operation?: string }) => void>
      const hasRestoreGuard = ops.some((op) => {
        try {
          op({ operation: 'restoreVersion' })
          return false
        } catch {
          return true
        }
      })
      expect(ops.length, slug).toBeGreaterThanOrEqual(2)
      expect(hasRestoreGuard, slug).toBe(true)
    }
  })
})

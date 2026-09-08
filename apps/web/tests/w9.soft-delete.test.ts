import { describe, it, expect } from 'vitest'
import { DELETED_FIELD, readExcludingDeleted, blockHardDelete } from '@/access/softDelete'

/**
 * W9 — soft-delete primitives (BUG-3, T1 per SPC-003 §7.2): the shared
 * collection wiring in access/softDelete.ts, asserted as data + pure
 * behavior. The runtime integration (PATCH flows, board reads) is covered by
 * the docker-compose verification stack; these tests pin the contract that
 * must hold on every soft-delete collection:
 *
 *   - the `deleted` field: checkbox, default false, hidden from admin forms;
 *   - read access = query constraint `deleted { not_equals: true }` (so the
 *     board's server render and client refetches inherit the filter);
 *   - beforeOperation delete → 403 APIError ('Hard delete is disabled…').
 */

describe('W9: soft-delete primitives (BUG-3)', () => {
  describe('DELETED_FIELD shape', () => {
    it('is a checkbox defaulting to false', () => {
      expect(DELETED_FIELD.name).toBe('deleted')
      expect(DELETED_FIELD.type).toBe('checkbox')
      expect(DELETED_FIELD.defaultValue).toBe(false)
    })

    it('is hidden from admin forms (condition → false)', () => {
      expect(DELETED_FIELD.admin.condition()).toBe(false)
    })
  })

  describe('readExcludingDeleted (query-constraint ACL)', () => {
    it('returns the deleted.not_equals constraint regardless of auth (open read, filtered)', () => {
      expect(readExcludingDeleted({ req: undefined } as never)).toEqual({
        deleted: { not_equals: true },
      })
      expect(readExcludingDeleted({ req: { user: null } } as never)).toEqual({
        deleted: { not_equals: true },
      })
    })
  })

  describe('blockHardDelete (beforeOperation guard)', () => {
    it('throws 403 APIError on operation=delete with the policy message', () => {
      expect(() => blockHardDelete({ operation: 'delete' })).toThrowError(
        /Hard delete is disabled/,
      )
      try {
        blockHardDelete({ operation: 'delete' })
      } catch (e) {
        expect((e as { status?: number }).status).toBe(403)
      }
    })

    it('ignores every non-delete operation (update, create, restoreVersion…)', () => {
      expect(() => blockHardDelete({ operation: 'update' })).not.toThrow()
      expect(() => blockHardDelete({ operation: 'create' })).not.toThrow()
      expect(() => blockHardDelete({ operation: 'restoreVersion' })).not.toThrow()
      expect(() => blockHardDelete({})).not.toThrow()
    })
  })
})

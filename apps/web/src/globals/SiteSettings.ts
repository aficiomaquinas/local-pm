import type { Access, GlobalConfig } from 'payload'
import { resolveDataManagementActor } from '@/access/dataManagementActor'
import {
  SITE_SETTINGS_SLUG,
  SOFT_DELETE_BEHAVIORS,
  type SoftDeleteBehavior,
} from './contract'

/**
 * SPC-005 options panel (action-plan item 3) — D-1 mechanism:
 *
 * A single Payload global (`site-settings`) holding the operator's runtime
 * switches. A global (not env vars, not a collection) because:
 *   - the operator applies changes through the UI, never the CLI;
 *   - exactly one row exists;
 *   - the REST surface comes for free at /api/globals/site-settings
 *     (GET on '/', POST on '/', verified in payload@3.88.0
 *     dist/globals/endpoints/index.js) and runs THIS access config — no
 *     custom endpoints to gate.
 *
 * Currently only `softDeleteBehavior` (D-2). More operator switches can be
 * added as fields without touching the ACL.
 */

/** Superadmin-only writes; open reads (the behavior name renders in the UI). */
const updateSuperadminOnly: Access = ({ req }) => resolveDataManagementActor(req?.user) === 'user'

export const SiteSettings: GlobalConfig = {
  slug: SITE_SETTINGS_SLUG,
  label: 'Site Settings',
  admin: {
    group: 'Settings',
    description:
      'Operator-level switches. Superadmin only — same ACL family as Data Management (SPC-004 §4e).',
  },
  access: {
    // Read open: the board and History UI render the behavior name; the
    // value carries no secret.
    read: () => true,
    // Writes are superadmin-exclusive (agent barred BY POLICY, anonymous
    // denied deny-by-default) — identical semantics to dataManagementAccess.
    update: updateSuperadminOnly,
  },
  fields: [
    {
      name: 'softDeleteBehavior',
      type: 'select',
      label: 'Soft delete behavior',
      defaultValue: 'visible',
      required: true,
      options: SOFT_DELETE_BEHAVIORS.map((v) => ({
        label:
          v === 'visible'
            ? 'Visible — Delete soft-deletes and the change shows in History'
            : 'Silent — Delete soft-deletes, but the History entry is hidden',
        value: v,
      })),
      admin: {
        description:
          'Hard delete stays blocked from every request path in BOTH modes (SPC-004 D2). ' +
          'Visible is the default: the least surprising audit posture.',
      },
    },
  ],
}

import type { CollectionConfig } from 'payload'

/**
 * SPC-004 §5.5 / D-2 — MINIMAL bridge users collection.
 *
 * Auth-native (email/password) so the admin panel — and with it the
 * import/export plugin — can function before ADR-002's OIDC wiring lands.
 * ADR-002 subsumes this collection later; do not extend it toward OIDC here.
 *
 * `actorType` carries the REQ-002 actor vocabulary consumed by
 * `access/actorPolicy.ts` and `access/dataManagementPolicy.ts`:
 *   - 'superadmin' → the master user (the superadmin identity pre-claims);
 *   - 'human'      → regular human actors (default);
 *   - 'agent'      → the automation identity (barred from Data Management
 *                    and the audit trail BY POLICY).
 * The single master user is created via first-register (no open-invite
 * machinery in this bridge).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'actorType',
      type: 'select',
      label: 'Actor Type',
      required: true,
      defaultValue: 'human',
      options: [
        { label: 'Superadmin', value: 'superadmin' },
        { label: 'Human', value: 'human' },
        { label: 'Agent', value: 'agent' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Active',
      defaultValue: true,
    },
  ],
  timestamps: true,
}

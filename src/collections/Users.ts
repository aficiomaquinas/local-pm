import type { CollectionConfig } from 'payload'
import { requireAuthEnabled } from '@/lib/access'

/**
 * Login accounts.
 *
 * Deliberately SEPARATE from the `teams` collection. A Team Member is a person
 * work is assigned to and may never log in; a User is a credential. Ars Nova's
 * fork (ArsNovaSingers/local-pm-Ars) folded the two together by making `teams`
 * auth-enabled, which is a smaller diff but means every assignable person needs
 * an email and a password hash, and every seed has to grow one. Keeping them
 * apart costs one collection and avoids a migration on existing data.
 *
 * `useAPIKey` gives automated callers — the MCP server, CI, scripts — their own
 * revocable identity instead of one shared password. Generate a key per agent
 * in the admin panel and send it as:
 *
 *     Authorization: users API-Key <key>
 *
 * This collection exists whether or not `LOCAL_PM_REQUIRE_AUTH` is set, so the
 * admin panel always has somewhere to authenticate against. With the flag
 * unset, the business collections stay open and nothing changes for an
 * existing install.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
    description: 'Login accounts and API keys. Assignable people live in Team Members.',
  },
  access: {
    // Reading the user list is gated the moment auth is switched on; while it
    // is off the whole API is open anyway and pretending otherwise would be
    // security theatre.
    read: ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true),
    // Creating accounts is always self-serve for the FIRST user (Payload's
    // first-register flow bypasses access), and admin-only afterwards once
    // auth is on.
    create: ({ req }) => {
      if (!requireAuthEnabled()) return true
      return (req.user as { role?: string } | undefined)?.role === 'admin'
    },
    update: ({ req }) => {
      if (!requireAuthEnabled()) return true
      const user = req.user as { id?: string; role?: string } | undefined
      if (!user) return false
      if (user.role === 'admin') return true
      // Non-admins may edit only their own account.
      return { id: { equals: user.id } }
    },
    delete: ({ req }) => {
      if (!requireAuthEnabled()) return true
      return (req.user as { role?: string } | undefined)?.role === 'admin'
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: { description: 'Display name for this account' },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Member', value: 'member' },
        { label: 'Agent', value: 'agent' },
      ],
      admin: {
        description:
          'admin may delete records and manage accounts; member may read and write; agent is an automated caller and should hold an API key rather than a password. Defaults to admin so the first account created can administer the install.',
      },
    },
  ],
  timestamps: true,
}

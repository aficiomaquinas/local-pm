import type { CollectionConfig } from 'payload'
import { requireAuthEnabled } from '@/lib/access'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
    description:
      'Login accounts and API keys. These are credentials, not assignable people — tickets are assigned to a team.',
  },
  access: {
    read: ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true),
    create: ({ req }) => {
      if (!requireAuthEnabled()) return true
      return (req.user as { role?: string } | undefined)?.role === 'admin'
    },
    update: ({ req }) => {
      if (!requireAuthEnabled()) return true
      const user = req.user as { id?: string; role?: string } | undefined
      if (!user) return false
      if (user.role === 'admin') return true
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

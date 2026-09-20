import type { CollectionConfig } from 'payload'
import { readAccess } from '@/lib/access'

export const Activity: CollectionConfig = {
  slug: 'activity',
  admin: {
    useAsTitle: 'field',
    defaultColumns: ['ticket', 'action', 'field', 'actor', 'createdAt'],
    description: 'Append-only record of what changed on a ticket, and who changed it.',
  },
  access: {
    read: readAccess,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'ticket',
      type: 'relationship',
      relationTo: 'tickets',
      required: true,
      index: true,
      admin: { description: 'The ticket this entry belongs to' },
    },
    {
      name: 'action',
      type: 'select',
      required: true,
      defaultValue: 'changed',
      options: [
        { label: 'Created', value: 'created' },
        { label: 'Changed', value: 'changed' },
      ],
    },
    {
      name: 'field',
      type: 'text',
      admin: { description: 'Which field changed. Empty when the ticket was created.' },
    },
    {
      name: 'from',
      type: 'text',
      admin: { description: 'The value as it read before the change' },
    },
    {
      name: 'to',
      type: 'text',
      admin: { description: 'The value as it read after the change' },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'members',
      admin: { description: 'Who made the change. Empty when nobody was signed in.' },
    },
  ],
  timestamps: true,
}

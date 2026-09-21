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
        { label: 'Commented', value: 'commented' },
        { label: 'Replied', value: 'replied' },
        { label: 'Edited a comment', value: 'edited' },
        { label: 'Resolved a thread', value: 'resolved' },
        { label: 'Reopened a thread', value: 'reopened' },
        { label: 'Deleted a comment', value: 'deleted' },
      ],
    },
    {
      name: 'comment',
      type: 'relationship',
      relationTo: 'comments',
      admin: {
        description: 'The comment this entry is about. Empty once that comment is deleted.',
      },
    },
    {
      name: 'field',
      type: 'text',
      admin: { description: 'Which field changed. Empty when the ticket was created.' },
    },
    {
      name: 'from',
      type: 'text',
      admin: {
        description: 'The value, or comment text, as it read before the change',
      },
    },
    {
      name: 'to',
      type: 'text',
      admin: {
        description: 'The value, or comment text, as it read after the change',
      },
    },
    {
      name: 'fromId',
      type: 'text',
      admin: {
        description:
          'The id behind `from`, when the value was a record. Lets reports replay history exactly instead of matching on a name that may since have changed.',
      },
    },
    {
      name: 'toId',
      type: 'text',
      admin: {
        description: 'The id behind `to`, when the value was a record',
      },
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

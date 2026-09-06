import type { CollectionConfig, PayloadRequest } from 'payload'
import { TicketStatus, TicketPriority, TICKET_STATUS_OPTIONS, TICKET_PRIORITY_OPTIONS } from '@/types/enums'

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['ticketId', 'title', 'status', 'priority', 'project', 'team'],
    description: 'Individual work items within projects',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && data?.project) {
          const ticketId = await generateTicketId(req, data.project as string)
          data.ticketId = ticketId
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'ticketId',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-generated ticket ID (e.g., PROJ-123)',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Brief title of the ticket',
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Detailed description of the work',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: TICKET_STATUS_OPTIONS,
      defaultValue: TicketStatus.TODO,
      required: true,
      admin: {
        description: 'Current status of the ticket',
      },
    },
    {
      name: 'priority',
      type: 'select',
      options: TICKET_PRIORITY_OPTIONS,
      defaultValue: TicketPriority.NO_PRIORITY,
      admin: {
        description: 'Priority level of the ticket',
      },
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      admin: {
        description: 'The project this ticket belongs to',
      },
    },
    {
      name: 'team',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        description: 'The team responsible for this ticket',
      },
    },
    {
      name: 'blockedBy',
      type: 'relationship',
      relationTo: 'tickets',
      hasMany: true,
      admin: {
        description: 'Tickets that must be completed before this ticket can be worked on',
      },
    },
    {
      name: 'labels',
      type: 'array',
      admin: {
        description: 'Labels for categorization',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'color',
          type: 'text',
          defaultValue: '#6366f1',
        },
      ],
    },
    {
      name: 'dueDate',
      type: 'date',
      admin: {
        description: 'When this ticket should be completed',
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'subtasks',
      type: 'array',
      admin: {
        description: 'Subtasks for this ticket',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'completed',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Order within the column',
      },
    },
  ],
  timestamps: true,
}

async function generateTicketId(req: PayloadRequest, projectId: string): Promise<string> {
  const project = await req.payload.findByID({
    collection: 'projects',
    id: projectId,
  })

  if (!project) {
    throw new Error('Project not found')
  }

  const newCounter = (project.ticketCounter || 0) + 1

  await req.payload.update({
    collection: 'projects',
    id: projectId,
    data: {
      ticketCounter: newCounter,
    },
  })

  return `${project.prefix}-${newCounter}`
}

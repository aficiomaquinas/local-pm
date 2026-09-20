import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { TicketStatus, TicketPriority, TICKET_STATUS_OPTIONS, TICKET_PRIORITY_OPTIONS } from '@/types/enums'
import { collectionAccess } from '@/lib/access'
import { diffTicket } from '@/lib/activity'

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['ticketId', 'title', 'status', 'priority', 'project', 'assignee'],
    description: 'Individual work items within projects',
  },
  access: collectionAccess,
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create' && data?.project) {
          const ticketId = await generateTicketId(req, data.project as string)
          data.ticketId = ticketId
        }

        if (data?.blockedBy !== undefined) {
          await assertNoDependencyCycle(req, data.blockedBy, originalDoc?.id ?? null)
        }

        return data
      },
    ],
    afterChange: [
      async ({ req, doc, previousDoc, operation }) => {
        await recordActivity(req, doc, previousDoc, operation)
      },
    ],
    afterDelete: [
      async ({ req, id }) => {
        await deleteCommentsFor(req, id)
        await deleteActivityFor(req, id)
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
      name: 'assignee',
      type: 'relationship',
      relationTo: 'members',
      admin: {
        description: 'The person responsible for this ticket',
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

async function deleteCommentsFor(req: PayloadRequest, id: string | number): Promise<void> {
  await req.payload.delete({
    req,
    collection: 'comments',
    where: { ticket: { equals: id } },
    depth: 0,
  })
}

async function deleteActivityFor(req: PayloadRequest, id: string | number): Promise<void> {
  await req.payload.delete({
    req,
    collection: 'activity',
    where: { ticket: { equals: id } },
    depth: 0,
    overrideAccess: true,
  })
}

async function recordActivity(
  req: PayloadRequest,
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
  operation: 'create' | 'update',
): Promise<void> {
  const events = diffTicket(operation === 'create' ? null : previousDoc, doc)
  if (events.length === 0) return

  const actor = await memberForRequest(req)

  for (const event of events) {
    await req.payload.create({
      req,
      collection: 'activity',
      depth: 0,
      overrideAccess: true,
      data: {
        ticket: doc.id as string,
        action: event.action,
        field: event.field,
        from: event.from,
        to: event.to,
        actor,
      },
    })
  }
}

async function memberForRequest(req: PayloadRequest): Promise<string | null> {
  const userId = req.user?.id
  if (!userId) return null

  const found = await req.payload.find({
    req,
    collection: 'members',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const member = found.docs[0]
  return member ? String(member.id) : null
}

class CycleError extends APIError {
  constructor(message: string) {
    super(message, 400, null, true)
  }
}

async function assertNoDependencyCycle(
  req: PayloadRequest,
  blockedBy: unknown,
  selfId: string | number | null,
): Promise<void> {
  const proposed = toIdArray(blockedBy)
  if (!proposed.length) return

  if (selfId !== null && proposed.includes(String(selfId))) {
    throw new CycleError('A ticket cannot block itself.')
  }
  if (selfId === null) return

  const target = String(selfId)
  const seen = new Set<string>(proposed)
  let frontier = [...proposed]
  let hops = 0

  while (frontier.length && hops < 64) {
    hops += 1
    const docs = await req.payload.find({
      collection: 'tickets',
      where: { id: { in: frontier } },
      limit: 500,
      depth: 0,
    })

    const next: string[] = []
    for (const doc of docs.docs) {
      for (const id of toIdArray((doc as { blockedBy?: unknown }).blockedBy)) {
        if (id === target) {
          throw new CycleError(
            'That dependency would create a cycle: the ticket you are blocking on already depends on this one, directly or through other tickets.',
          )
        }
        if (!seen.has(id)) {
          seen.add(id)
          next.push(id)
        }
      }
    }
    frontier = next
  }
}

function toIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (entry === null || entry === undefined) return null
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
      if (typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
        return String((entry as { id: unknown }).id)
      }
      return null
    })
    .filter((v): v is string => Boolean(v))
}

async function generateTicketId(req: PayloadRequest, projectId: string): Promise<string> {
  const model = getMongooseModel(req, 'projects')

  if (model) {
    const updated = await model.findOneAndUpdate(
      { _id: projectId },
      { $inc: { ticketCounter: 1 } },
      { new: true, returnDocument: 'after' },
    )
    if (!updated) throw new Error('Project not found')
    return `${updated.prefix}-${updated.ticketCounter}`
  }

  return generateTicketIdWithRetry(req, projectId)
}

type MinimalModel = {
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<{ prefix: string; ticketCounter: number } | null>
}

function getMongooseModel(req: PayloadRequest, slug: string): MinimalModel | null {
  const collections = (req.payload.db as unknown as { collections?: Record<string, MinimalModel> })
    .collections
  const model = collections?.[slug]
  return model && typeof model.findOneAndUpdate === 'function' ? model : null
}

async function generateTicketIdWithRetry(req: PayloadRequest, projectId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const project = await req.payload.findByID({ collection: 'projects', id: projectId })
    if (!project) throw new Error('Project not found')

    const candidateCounter = (project.ticketCounter || 0) + 1
    const candidate = `${project.prefix}-${candidateCounter}`

    const clash = await req.payload.find({
      collection: 'tickets',
      where: { ticketId: { equals: candidate } },
      limit: 1,
      depth: 0,
    })

    if (clash.totalDocs === 0) {
      await req.payload.update({
        collection: 'projects',
        id: projectId,
        data: { ticketCounter: candidateCounter },
      })
      return candidate
    }
  }
  throw new Error(
    'Could not allocate a unique ticket ID after 8 attempts — check the project ticketCounter.',
  )
}

import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { TicketStatus, TicketPriority, TICKET_STATUS_OPTIONS, TICKET_PRIORITY_OPTIONS } from '@/types/enums'
import { collectionAccess } from '@/lib/access'

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['ticketId', 'title', 'status', 'priority', 'project', 'team'],
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

/* ------------------------------------------------------------- dependencies -- */

/**
 * A rejected dependency edge is USER error, not server error.
 *
 * Payload treats a bare `Error` thrown from a hook as internal and replaces the
 * message with "Something went wrong." — so the caller is told nothing useful
 * and cannot tell a cycle from an outage. (The upstream fork this guard comes
 * from throws a plain Error and loses the message this way.) `APIError` with
 * `isPublic` keeps the explanation and returns 400 rather than 500.
 */
class CycleError extends APIError {
  constructor(message: string) {
    super(message, 400, null, true)
  }
}

/**
 * `blockedBy` is a self-referential graph with nothing stopping A → B → A.
 *
 * Adapted from Ars Nova Singers (@ArsNovaSingers) in ArsNovaSingers/local-pm-Ars,
 * commit d488521.
 *
 * A cycle is not merely untidy data: it makes "what is ready to work on?"
 * unanswerable, and it hangs any layered graph layout that walks the edges —
 * including the DependencyGraph component in this repo. Reject the edge that
 * would close the loop, at the moment it is created.
 */
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
  // A brand-new ticket has no id yet, so nothing can already depend on it.
  if (selfId === null) return

  const target = String(selfId)
  const seen = new Set<string>(proposed)
  let frontier = [...proposed]
  let hops = 0

  // Bounded walk: a pathological graph must not spin here.
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

/** Normalize a relationship value (ids, numbers or populated docs) to string ids. */
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

/* ---------------------------------------------------------------- ticket ids -- */

/**
 * Allocate the next ticket number ATOMICALLY.
 *
 * Adapted from Ars Nova Singers (@ArsNovaSingers) in ArsNovaSingers/local-pm-Ars,
 * commit d488521.
 *
 * The original implementation read `project.ticketCounter`, incremented it in
 * JavaScript and wrote it back. Two creates landing together both read 5, both
 * computed 6, and both wrote `PROJ-6` — and since `ticketId` is declared
 * `unique`, the loser fails on a duplicate-key error at best, or two tickets
 * share an ID where the index has not been built. A bulk import, or an MCP
 * agent creating a batch of tickets, IS that scenario.
 *
 * `findOneAndUpdate` with `$inc` performs the read and the increment as one
 * document operation, so concurrent callers are handed distinct numbers by the
 * database itself.
 */
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

/** Reach the underlying mongoose model, when the configured adapter exposes one. */
function getMongooseModel(req: PayloadRequest, slug: string): MinimalModel | null {
  const collections = (req.payload.db as unknown as { collections?: Record<string, MinimalModel> })
    .collections
  const model = collections?.[slug]
  return model && typeof model.findOneAndUpdate === 'function' ? model : null
}

/**
 * Fallback for a database adapter exposing no atomic primitive. Still not a
 * true compare-and-set, so it verifies the ID is unused before claiming it and
 * retries on collision — failing loudly rather than silently issuing a
 * duplicate.
 */
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

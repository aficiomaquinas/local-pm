#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getMcpBearerToken,
  invalidateMcpToken,
  readMcpOidcConfig,
} from './auth.js';

const BASE_URL = process.env.LOCAL_PM_URL || 'http://localhost:3010';

const STATUS_MAP: Record<string, string> = {
  active: 'ACTIVE',
  on_hold: 'ON_HOLD',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  todo: 'TODO',
  in_progress: 'IN_PROGRESS',
  done: 'DONE',
  no_priority: 'NO_PRIORITY',
  urgent: 'URGENT',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

function toPayloadValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return STATUS_MAP[value] || value;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextPage: number | null;
    prevPage: number | null;
  };
}

function formatPaginatedResponse<T>(
  response: {
    docs: T[];
    totalDocs: number;
    limit: number;
    totalPages: number;
    page: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextPage?: number | null;
    prevPage?: number | null;
  }
): PaginatedResponse<T> {
  return {
    items: response.docs,
    pagination: {
      page: response.page,
      limit: response.limit,
      totalItems: response.totalDocs,
      totalPages: response.totalPages,
      hasNextPage: response.hasNextPage,
      hasPrevPage: response.hasPrevPage,
      nextPage: response.hasNextPage ? response.page + 1 : null,
      prevPage: response.hasPrevPage ? response.page - 1 : null,
    },
  };
}

interface SlimProject {
  id: string;
  prefix: string;
}

interface SlimTeam {
  id: string;
  name: string;
}

function slimProject(project: unknown): SlimProject | string | null {
  if (!project) return null;
  if (typeof project === 'string') return project;
  if (typeof project === 'object' && project !== null) {
    const p = project as Record<string, unknown>;
    return {
      id: p.id as string,
      prefix: p.prefix as string,
    };
  }
  return null;
}

function slimTeam(team: unknown): SlimTeam | string | null {
  if (!team) return null;
  if (typeof team === 'string') return team;
  if (typeof team === 'object' && team !== null) {
    const t = team as Record<string, unknown>;
    return {
      id: t.id as string,
      name: t.name as string,
    };
  }
  return null;
}

function slimComment(comment: unknown): string | null {
  if (!comment) return null;
  if (typeof comment === 'string') return comment;
  if (typeof comment === 'object' && comment !== null) {
    return (comment as Record<string, unknown>).id as string;
  }
  return null;
}

interface SlimMember {
  id: string;
  name: string;
}

function slimMember(member: unknown): SlimMember | string | null {
  if (!member) return null;
  if (typeof member === 'string') return member;
  if (typeof member === 'object' && member !== null) {
    const m = member as Record<string, unknown>;
    return {
      id: m.id as string,
      name: m.name as string,
    };
  }
  return null;
}

function slimBlockedBy(blockedBy: unknown): string[] | null {
  if (!blockedBy) return null;
  if (!Array.isArray(blockedBy)) return null;
  return blockedBy.map(item => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      return (item as Record<string, unknown>).id as string;
    }
    return item;
  }).filter(Boolean) as string[];
}

function slimTicket(ticket: Record<string, unknown>, fieldsToInclude: Set<string>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const field of fieldsToInclude) {
    if (!(field in ticket)) continue;

    const value = ticket[field];

    if (field === 'project') {
      filtered[field] = slimProject(value);
    } else if (field === 'team') {
      filtered[field] = slimTeam(value);
    } else if (field === 'assignee') {
      filtered[field] = slimMember(value);
    } else if (field === 'blockedBy') {
      filtered[field] = slimBlockedBy(value);
    } else {
      filtered[field] = value;
    }
  }

  return filtered;
}

//
// SPC-006 §10 (D-6): every request carries `Authorization: Bearer <token>`
// (the agent's OWN client-credentials token — never a relayed user token)
// and `X-LocalPM-Channel: mcp` (best-effort channel stamp, §9). Behavior is
// flag-gated: with OIDC_ENABLED!=true (default) no Authorization header is
// attached and requests behave exactly as before (optionality principle).
// With the flag on and credentials missing, the first call fails loudly
// (AC-12) instead of silently going anonymous. A 401 from the API triggers
// exactly ONE token refetch + retry (cache invalidation), then the error
// surfaces.
async function apiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<unknown> {
  const url = `${BASE_URL}/api${endpoint}`;
  const oidc = readMcpOidcConfig();

  const buildOptions = async (withAuth: boolean): Promise<RequestInit> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-LocalPM-Channel': 'mcp',
    };
    if (withAuth) {
      headers['Authorization'] = `Bearer ${await getMcpBearerToken(oidc, fetch)}`;
    }
    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    return options;
  };

  const send = async (options: RequestInit): Promise<Response> => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }
    return response;
  };

  if (oidc.enabled) {
    try {
      return await (async () => {
        const r = await send(await buildOptions(true));
        return r.json();
      })();
    } catch (err) {
      // Single retry on 401: the cached token may have been revoked/expired
      // server-side. Invalidate, refetch, retry once — then surface.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.startsWith('API request failed: 401')) throw err;
      invalidateMcpToken();
      const r = await send(await buildOptions(true));
      return r.json();
    }
  }

  const response = await send(await buildOptions(false));
  return response.json();
}

const tools: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects in Local PM. By default returns only basic fields (id, name, prefix, status, color, icon). Use "include" to request additional fields like description.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: active, on_hold, completed, cancelled',
          enum: ['active', 'on_hold', 'completed', 'cancelled'],
        },
        limit: {
          type: 'number',
          description: 'Maximum number of projects to return (default: 20)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1). Use with limit to paginate through results.',
        },
        include: {
          type: 'array',
          description: 'Additional fields to include in the response. By default only id, name, prefix, status, color, icon are returned.',
          items: {
            type: 'string',
            enum: ['description', 'createdAt', 'updatedAt'],
          },
        },
      },
    },
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific project by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The project ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project in Local PM',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        prefix: {
          type: 'string',
          description: 'Project prefix (2-6 uppercase letters, used for ticket IDs like PROJ-1)',
        },
        description: {
          type: 'string',
          description: 'Project description (supports HTML for rich text)',
        },
        status: {
          type: 'string',
          description: 'Project status',
          enum: ['active', 'on_hold', 'completed', 'cancelled'],
          default: 'active',
        },
        icon: {
          type: 'string',
          description: 'Icon name: folder, rocket, zap, star, heart, flag, target, briefcase, code, box, layers, database',
          default: 'folder',
        },
        color: {
          type: 'string',
          description: 'Hex color code (e.g., #6366f1)',
          default: '#6366f1',
        },
      },
      required: ['name', 'prefix'],
    },
  },
  {
    name: 'update_project',
    description: 'Update an existing project',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The project ID to update',
        },
        name: {
          type: 'string',
          description: 'New project name',
        },
        description: {
          type: 'string',
          description: 'New project description',
        },
        status: {
          type: 'string',
          description: 'New project status',
          enum: ['active', 'on_hold', 'completed', 'cancelled'],
        },
        icon: {
          type: 'string',
          description: 'New icon name',
        },
        color: {
          type: 'string',
          description: 'New hex color code',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a project and optionally all its tickets',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The project ID to delete',
        },
        deleteTickets: {
          type: 'boolean',
          description: 'Whether to delete all tickets in the project (default: true)',
          default: true,
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'list_teams',
    description: 'List all teams in Local PM. By default returns only basic fields (id, name, color). Use "include" to request additional fields like description.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of teams to return (default: 20)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1). Use with limit to paginate through results.',
        },
        include: {
          type: 'array',
          description: 'Additional fields to include in the response. By default only id, name, color are returned.',
          items: {
            type: 'string',
            enum: ['description', 'createdAt', 'updatedAt'],
          },
        },
      },
    },
  },
  {
    name: 'get_team',
    description: 'Get detailed information about a specific team by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The team ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_team',
    description: 'Create a new team in Local PM',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Team name',
        },
        description: {
          type: 'string',
          description: 'Team description (supports HTML for rich text)',
        },
        color: {
          type: 'string',
          description: 'Hex color code (e.g., #6366f1)',
          default: '#6366f1',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_team',
    description: 'Update an existing team',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The team ID to update',
        },
        name: {
          type: 'string',
          description: 'New team name',
        },
        description: {
          type: 'string',
          description: 'New team description',
        },
        color: {
          type: 'string',
          description: 'New hex color code',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_team',
    description: 'Delete a team (tickets assigned to this team will become unassigned)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The team ID to delete',
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'list_members',
    description: 'List the people tickets can be assigned to. By default returns only basic fields (id, name, active). Use "include" to request email, team or timestamps. Members are distinct from login accounts: a member is a person work is assigned to.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Filter by team ID',
        },
        activeOnly: {
          type: 'boolean',
          description: 'Only return people who are still active (default: true)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of members to return (default: 20)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1). Use with limit to paginate through results.',
        },
        include: {
          type: 'array',
          description: 'Additional fields to include in the response. By default only id, name, active are returned.',
          items: {
            type: 'string',
            enum: ['email', 'team', 'user', 'createdAt', 'updatedAt'],
          },
        },
      },
    },
  },
  {
    name: 'get_member',
    description: 'Get detailed information about a specific member by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The member ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_member',
    description: 'Create a person that tickets can be assigned to',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name',
        },
        email: {
          type: 'string',
          description: 'Email address (optional)',
        },
        team: {
          type: 'string',
          description: 'Team ID this person belongs to (optional)',
        },
        user: {
          type: 'string',
          description: 'Login account ID to link this person to (optional). One account maps to at most one member.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_member',
    description: 'Update an existing member',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The member ID to update',
        },
        name: {
          type: 'string',
          description: 'New display name',
        },
        email: {
          type: 'string',
          description: 'New email address',
        },
        team: {
          type: 'string',
          description: 'New team ID (use null to remove from the team)',
        },
        active: {
          type: 'boolean',
          description: 'Set false when someone leaves. They keep existing assignments but drop out of the pickers.',
        },
        user: {
          type: 'string',
          description: 'Login account ID to link (use null to unlink)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_member',
    description: 'Delete a member (tickets assigned to this person become unassigned). Prefer setting active to false, which preserves history.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The member ID to delete',
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'list_tickets',
    description: 'List tickets in Local PM with optional filters. By default returns only basic fields (id, title, status, project). Use "include" to request additional fields. Note: Relationship fields are returned in slim format - project returns {id, prefix}, team and assignee return {id, name}, blockedBy returns array of ticket IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID',
        },
        teamId: {
          type: 'string',
          description: 'Filter by team ID',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter by assignee (member) ID',
        },
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['todo', 'in_progress', 'done'],
        },
        priority: {
          type: 'string',
          description: 'Filter by priority',
          enum: ['no_priority', 'urgent', 'high', 'medium', 'low'],
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tickets to return (default: 20)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1). Use with limit to paginate through results.',
        },
        include: {
          type: 'array',
          description: 'Additional fields to include in the response. By default only id, title, status, and project are returned.',
          items: {
            type: 'string',
            enum: ['description', 'team', 'assignee', 'priority', 'dueDate', 'labels', 'subtasks', 'blockedBy', 'sortOrder', 'createdAt', 'updatedAt'],
          },
        },
      },
    },
  },
  {
    name: 'get_ticket',
    description: 'Get detailed information about a specific ticket by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ticket ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_ticket',
    description: 'Create a new ticket in Local PM',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Ticket title',
        },
        description: {
          type: 'string',
          description: 'Ticket description (supports HTML for rich text)',
        },
        project: {
          type: 'string',
          description: 'Project ID (required)',
        },
        team: {
          type: 'string',
          description: 'Team ID (optional)',
        },
        assignee: {
          type: 'string',
          description: 'Assignee member ID (optional). Use list_members to find one.',
        },
        status: {
          type: 'string',
          description: 'Ticket status',
          enum: ['todo', 'in_progress', 'done'],
          default: 'todo',
        },
        priority: {
          type: 'string',
          description: 'Ticket priority',
          enum: ['no_priority', 'urgent', 'high', 'medium', 'low'],
          default: 'no_priority',
        },
        dueDate: {
          type: 'string',
          description: 'Due date in ISO format (YYYY-MM-DD)',
        },
        labels: {
          type: 'array',
          description: 'Array of labels with name and color',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              color: { type: 'string' },
            },
            required: ['name', 'color'],
          },
        },
        subtasks: {
          type: 'array',
          description: 'Array of subtasks with title and completed status',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              completed: { type: 'boolean', default: false },
            },
            required: ['title'],
          },
        },
        blockedBy: {
          type: 'array',
          description: 'Array of ticket IDs that block this ticket. The ticket cannot be worked on until all blocking tickets are done.',
          items: {
            type: 'string',
          },
        },
      },
      required: ['title', 'project'],
    },
  },
  {
    name: 'update_ticket',
    description: 'Update an existing ticket',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ticket ID to update',
        },
        title: {
          type: 'string',
          description: 'New ticket title',
        },
        description: {
          type: 'string',
          description: 'New ticket description',
        },
        team: {
          type: 'string',
          description: 'New team ID (use null to unassign)',
        },
        assignee: {
          type: 'string',
          description: 'New assignee member ID (use null to unassign)',
        },
        status: {
          type: 'string',
          description: 'New ticket status',
          enum: ['todo', 'in_progress', 'done'],
        },
        priority: {
          type: 'string',
          description: 'New ticket priority',
          enum: ['no_priority', 'urgent', 'high', 'medium', 'low'],
        },
        dueDate: {
          type: 'string',
          description: 'New due date in ISO format (use null to clear)',
        },
        labels: {
          type: 'array',
          description: 'New array of labels (replaces existing)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              color: { type: 'string' },
            },
            required: ['name', 'color'],
          },
        },
        subtasks: {
          type: 'array',
          description: 'New array of subtasks (replaces existing)',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              completed: { type: 'boolean' },
            },
            required: ['title'],
          },
        },
        blockedBy: {
          type: 'array',
          description: 'Array of ticket IDs that block this ticket (replaces existing). Use empty array to clear.',
          items: {
            type: 'string',
          },
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_ticket',
    description: 'Move a ticket to a different status (column on the Kanban board)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ticket ID to move',
        },
        status: {
          type: 'string',
          description: 'New status',
          enum: ['todo', 'in_progress', 'done'],
        },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'delete_ticket',
    description: 'Delete a ticket',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ticket ID to delete',
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'get_board',
    description: 'Get the full Kanban board with tickets grouped by status. Optionally filter by project or team. By default returns only basic ticket fields (id, title, status, project). Use "include" to request additional fields. Note: Relationship fields are returned in slim format - project returns {id, prefix}, team and assignee return {id, name}, blockedBy returns array of ticket IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID',
        },
        teamId: {
          type: 'string',
          description: 'Filter by team ID',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter by assignee (member) ID',
        },
        include: {
          type: 'array',
          description: 'Additional ticket fields to include. By default only id, title, status, and project are returned.',
          items: {
            type: 'string',
            enum: ['description', 'team', 'assignee', 'priority', 'dueDate', 'labels', 'subtasks', 'blockedBy', 'sortOrder', 'createdAt', 'updatedAt'],
          },
        },
      },
    },
  },

  {
    name: 'toggle_subtask',
    description: 'Toggle a subtask completion status',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID containing the subtask',
        },
        subtaskIndex: {
          type: 'number',
          description: 'The index of the subtask to toggle (0-based)',
        },
      },
      required: ['ticketId', 'subtaskIndex'],
    },
  },
  {
    name: 'add_subtask',
    description: 'Add a subtask to a ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket ID to add subtask to',
        },
        title: {
          type: 'string',
          description: 'Subtask title',
        },
      },
      required: ['ticketId', 'title'],
    },
  },

  {
    name: 'list_activity',
    description: 'Read the change history of a ticket, oldest first. Entries cover field changes (action "changed", with the field and the values before and after as they read at the time) and the comment thread (actions "commented", "replied", "edited", "resolved", "reopened", "deleted", carrying the comment text). The text of a deleted comment is kept here after the comment itself is gone. The history is written automatically and cannot be edited or deleted. Board reordering is not recorded.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket whose history to read',
        },
        field: {
          type: 'string',
          description: 'Only return changes to this field, e.g. "status", "assignee", "priority", "title", "dueDate", "labels", "blockedBy", "subtasks", "project", "team", "description"',
        },
        action: {
          type: 'string',
          description: 'Only return entries with this action: "created", "changed", "commented", "replied", "edited", "resolved", "reopened" or "deleted"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return (default: 50)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1)',
        },
      },
      required: ['ticketId'],
    },
  },

  {
    name: 'list_comments',
    description: 'List the comments on a ticket, oldest first. Threads are one level deep: a comment with a "parent" is a reply to the comment that opened that thread. Mentions appear in the body as @[Name](member:ID) and are also resolved into the "mentions" array.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket whose comments to list',
        },
        parentId: {
          type: 'string',
          description: 'Only return the replies in this thread. Omit for every comment on the ticket.',
        },
        includeResolved: {
          type: 'boolean',
          description: 'Include threads that have been marked resolved (default: true)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of comments to return (default: 50)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (1-indexed, default: 1)',
        },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'add_comment',
    description: 'Post a comment on a ticket, or a reply in an existing thread. The body is markdown. To mention someone write @[Their Name](member:THEIR_ID); use list_members to find the ID. Replies go on the comment that opened the thread, never on another reply.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'The ticket to comment on',
        },
        body: {
          type: 'string',
          description: 'Markdown body. Mentions use @[Name](member:ID).',
        },
        parentId: {
          type: 'string',
          description: 'The comment that opened the thread, to post this as a reply (optional)',
        },
        authorId: {
          type: 'string',
          description: 'Member ID to attribute this comment to (optional). Without it the comment is attributed to the signed-in account, or to nobody.',
        },
      },
      required: ['ticketId', 'body'],
    },
  },
  {
    name: 'update_comment',
    description: 'Edit a comment body, or resolve/reopen a thread. Only the comment that opened a thread can be resolved.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The comment ID',
        },
        body: {
          type: 'string',
          description: 'New markdown body',
        },
        resolved: {
          type: 'boolean',
          description: 'Mark the thread resolved (true) or reopen it (false)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment. Deleting the comment that opened a thread deletes its replies too. This cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The comment ID to delete',
        },
      },
      required: ['id'],
    },
  },
];

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'list_projects': {
      const limit = (args.limit as number) || 20;
      const page = (args.page as number) || 1;
      const includeFields = (args.include as string[]) || [];
      let query = `?limit=${limit}&page=${page}&depth=0`;
      if (args.status) {
        query += `&where[status][equals]=${toPayloadValue(args.status as string)}`;
      }
      const response = await apiRequest(`/projects${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const defaultFields = ['id', 'name', 'prefix', 'status', 'color', 'icon'];
      const optionalFields = ['description', 'createdAt', 'updatedAt'];

      const fieldsToInclude = new Set([...defaultFields, ...includeFields.filter(f => optionalFields.includes(f))]);

      const filteredDocs = response.docs.map(project => {
        const filtered: Record<string, unknown> = {};
        for (const field of fieldsToInclude) {
          if (field in project) {
            filtered[field] = project[field];
          }
        }
        return filtered;
      });

      return formatPaginatedResponse({
        ...response,
        docs: filteredDocs,
      });
    }
    case 'get_project': {
      return apiRequest(`/projects/${args.id}?depth=1`);
    }
    case 'create_project': {
      return apiRequest('/projects', 'POST', {
        name: args.name,
        prefix: (args.prefix as string).toUpperCase(),
        description: args.description || null,
        status: toPayloadValue(args.status as string) || 'ACTIVE',
        icon: args.icon || 'folder',
        color: args.color || '#6366f1',
      });
    }
    case 'update_project': {
      const id = args.id;
      const updates: Record<string, unknown> = {};
      if (args.name) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status) updates.status = toPayloadValue(args.status as string);
      if (args.icon) updates.icon = args.icon;
      if (args.color) updates.color = args.color;
      return apiRequest(`/projects/${id}`, 'PATCH', updates);
    }
    case 'delete_project': {
      const { id, deleteTickets = true } = args;
      if (deleteTickets) {
        const ticketsResponse = await apiRequest(
          `/tickets?where[project][equals]=${id}&limit=1000`
        ) as { docs: Array<{ id: string }> };
        for (const ticket of ticketsResponse.docs || []) {
          await apiRequest(`/tickets/${ticket.id}`, 'DELETE');
        }
      }
      return apiRequest(`/projects/${id}`, 'DELETE');
    }

    case 'list_teams': {
      const limit = (args.limit as number) || 20;
      const page = (args.page as number) || 1;
      const includeFields = (args.include as string[]) || [];
      const query = `?limit=${limit}&page=${page}&depth=0`;
      const response = await apiRequest(`/teams${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const defaultFields = ['id', 'name', 'color'];
      const optionalFields = ['description', 'createdAt', 'updatedAt'];

      const fieldsToInclude = new Set([...defaultFields, ...includeFields.filter(f => optionalFields.includes(f))]);

      const filteredDocs = response.docs.map(team => {
        const filtered: Record<string, unknown> = {};
        for (const field of fieldsToInclude) {
          if (field in team) {
            filtered[field] = team[field];
          }
        }
        return filtered;
      });

      return formatPaginatedResponse({
        ...response,
        docs: filteredDocs,
      });
    }
    case 'get_team': {
      return apiRequest(`/teams/${args.id}?depth=1`);
    }
    case 'create_team': {
      return apiRequest('/teams', 'POST', {
        name: args.name,
        description: args.description || null,
        color: args.color || '#6366f1',
      });
    }
    case 'update_team': {
      const { id, ...updates } = args;
      return apiRequest(`/teams/${id}`, 'PATCH', updates);
    }
    case 'delete_team': {
      return apiRequest(`/teams/${args.id}`, 'DELETE');
    }

    case 'list_members': {
      const limit = (args.limit as number) || 20;
      const page = (args.page as number) || 1;
      const includeFields = (args.include as string[]) || [];
      const activeOnly = args.activeOnly === undefined ? true : Boolean(args.activeOnly);

      let query = `?limit=${limit}&page=${page}&depth=1&sort=name`;
      if (args.teamId) {
        query += `&where[team][equals]=${args.teamId}`;
      }
      if (activeOnly) {
        query += '&where[active][equals]=true';
      }

      const response = await apiRequest(`/members${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const defaultFields = ['id', 'name', 'active'];
      const optionalFields = ['email', 'team', 'user', 'createdAt', 'updatedAt'];
      const fieldsToInclude = new Set([...defaultFields, ...includeFields.filter(f => optionalFields.includes(f))]);

      const filteredDocs = response.docs.map(member => {
        const filtered: Record<string, unknown> = {};
        for (const field of fieldsToInclude) {
          if (!(field in member)) continue;
          filtered[field] = field === 'team' ? slimTeam(member[field]) : member[field];
        }
        return filtered;
      });

      return formatPaginatedResponse({
        ...response,
        docs: filteredDocs,
      });
    }
    case 'get_member': {
      return apiRequest(`/members/${args.id}?depth=1`);
    }
    case 'create_member': {
      return apiRequest('/members', 'POST', {
        name: args.name,
        email: args.email || null,
        team: args.team || null,
        user: args.user || null,
      });
    }
    case 'update_member': {
      const id = args.id;
      const updates: Record<string, unknown> = {};
      if (args.name) updates.name = args.name;
      if (args.email !== undefined) updates.email = args.email;
      if (args.team !== undefined) updates.team = args.team;
      if (args.active !== undefined) updates.active = args.active;
      if (args.user !== undefined) updates.user = args.user;
      return apiRequest(`/members/${id}`, 'PATCH', updates);
    }
    case 'delete_member': {
      return apiRequest(`/members/${args.id}`, 'DELETE');
    }

    case 'list_tickets': {
      const limit = (args.limit as number) || 20;
      const page = (args.page as number) || 1;
      const includeFields = (args.include as string[]) || [];

      let query = `?limit=${limit}&page=${page}&depth=1`;
      if (args.projectId) {
        query += `&where[project][equals]=${args.projectId}`;
      }
      if (args.teamId) {
        query += `&where[team][equals]=${args.teamId}`;
      }
      if (args.assigneeId) {
        query += `&where[assignee][equals]=${args.assigneeId}`;
      }
      if (args.status) {
        query += `&where[status][equals]=${toPayloadValue(args.status as string)}`;
      }
      if (args.priority) {
        query += `&where[priority][equals]=${toPayloadValue(args.priority as string)}`;
      }
      const response = await apiRequest(`/tickets${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const defaultFields = ['id', 'title', 'status', 'project'];
      const optionalFields = ['description', 'team', 'assignee', 'priority', 'dueDate', 'labels', 'subtasks', 'blockedBy', 'sortOrder', 'createdAt', 'updatedAt'];

      const fieldsToInclude = new Set([...defaultFields, ...includeFields.filter(f => optionalFields.includes(f))]);

      const filteredDocs = response.docs.map(ticket => slimTicket(ticket, fieldsToInclude));

      return formatPaginatedResponse({
        ...response,
        docs: filteredDocs,
      });
    }
    case 'get_ticket': {
      return apiRequest(`/tickets/${args.id}?depth=1`);
    }
    case 'create_ticket': {
      return apiRequest('/tickets', 'POST', {
        title: args.title,
        description: args.description || null,
        project: args.project,
        team: args.team || null,
        assignee: args.assignee || null,
        status: toPayloadValue(args.status as string) || 'TODO',
        priority: toPayloadValue(args.priority as string) || 'NO_PRIORITY',
        dueDate: args.dueDate || null,
        labels: args.labels || [],
        subtasks: args.subtasks || [],
        blockedBy: args.blockedBy || [],
      });
    }
    case 'update_ticket': {
      const id = args.id;
      const updates: Record<string, unknown> = {};
      if (args.title) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.team !== undefined) updates.team = args.team;
      if (args.assignee !== undefined) updates.assignee = args.assignee;
      if (args.status) updates.status = toPayloadValue(args.status as string);
      if (args.priority) updates.priority = toPayloadValue(args.priority as string);
      if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
      if (args.labels) updates.labels = args.labels;
      if (args.subtasks) updates.subtasks = args.subtasks;
      if (args.blockedBy !== undefined) updates.blockedBy = args.blockedBy;
      return apiRequest(`/tickets/${id}`, 'PATCH', updates);
    }
    case 'move_ticket': {
      return apiRequest(`/tickets/${args.id}`, 'PATCH', {
        status: toPayloadValue(args.status as string),
      });
    }
    case 'delete_ticket': {
      return apiRequest(`/tickets/${args.id}`, 'DELETE');
    }

    case 'get_board': {
      const includeFields = (args.include as string[]) || [];

      let query = '?limit=1000&depth=1';
      if (args.projectId) {
        query += `&where[project][equals]=${args.projectId}`;
      }
      if (args.teamId) {
        query += `&where[team][equals]=${args.teamId}`;
      }
      if (args.assigneeId) {
        query += `&where[assignee][equals]=${args.assigneeId}`;
      }
      const response = await apiRequest(`/tickets${query}`) as { docs: Array<Record<string, unknown>> };
      const tickets = response.docs || [];

      const defaultFields = ['id', 'title', 'status', 'project'];
      const optionalFields = ['description', 'team', 'assignee', 'priority', 'dueDate', 'labels', 'subtasks', 'blockedBy', 'sortOrder', 'createdAt', 'updatedAt'];

      const fieldsToInclude = new Set([...defaultFields, ...includeFields.filter(f => optionalFields.includes(f))]);

      const board = {
        todo: tickets.filter((t) => t.status === 'TODO').map(t => slimTicket(t, fieldsToInclude)),
        in_progress: tickets.filter((t) => t.status === 'IN_PROGRESS').map(t => slimTicket(t, fieldsToInclude)),
        done: tickets.filter((t) => t.status === 'DONE').map(t => slimTicket(t, fieldsToInclude)),
        summary: {
          total: tickets.length,
          todo: tickets.filter((t) => t.status === 'TODO').length,
          inProgress: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
          done: tickets.filter((t) => t.status === 'DONE').length,
        },
      };
      return board;
    }

    case 'toggle_subtask': {
      const ticket = await apiRequest(`/tickets/${args.ticketId}`) as {
        subtasks?: Array<{ title: string; completed: boolean }>
      };
      const subtasks = ticket.subtasks || [];
      const index = args.subtaskIndex as number;

      if (index < 0 || index >= subtasks.length) {
        throw new Error(`Subtask index ${index} out of range`);
      }

      subtasks[index].completed = !subtasks[index].completed;
      return apiRequest(`/tickets/${args.ticketId}`, 'PATCH', { subtasks });
    }
    case 'add_subtask': {
      const ticket = await apiRequest(`/tickets/${args.ticketId}`) as {
        subtasks?: Array<{ title: string; completed: boolean }>
      };
      const subtasks = ticket.subtasks || [];
      subtasks.push({ title: args.title as string, completed: false });
      return apiRequest(`/tickets/${args.ticketId}`, 'PATCH', { subtasks });
    }

    case 'list_activity': {
      const limit = (args.limit as number) || 50;
      const page = (args.page as number) || 1;

      let query = `?limit=${limit}&page=${page}&depth=1&sort=createdAt`;
      query += `&where[ticket][equals]=${args.ticketId}`;
      if (args.field) {
        query += `&where[field][equals]=${args.field}`;
      }
      if (args.action) {
        query += `&where[action][equals]=${args.action}`;
      }

      const response = await apiRequest(`/activity${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const slimmed = response.docs.map(entry => ({
        id: entry.id,
        action: entry.action,
        field: entry.field ?? null,
        comment: slimComment(entry.comment),
        from: entry.from ?? null,
        to: entry.to ?? null,
        actor: slimMember(entry.actor),
        at: entry.createdAt,
      }));

      return formatPaginatedResponse({
        ...response,
        docs: slimmed,
      });
    }

    case 'list_comments': {
      const limit = (args.limit as number) || 50;
      const page = (args.page as number) || 1;

      let query = `?limit=${limit}&page=${page}&depth=1&sort=createdAt`;
      query += `&where[ticket][equals]=${args.ticketId}`;
      if (args.parentId) {
        query += `&where[parent][equals]=${args.parentId}`;
      }
      if (args.includeResolved === false) {
        query += '&where[resolved][not_equals]=true';
      }

      const response = await apiRequest(`/comments${query}`) as {
        docs: Array<Record<string, unknown>>;
        totalDocs: number;
        limit: number;
        totalPages: number;
        page: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        nextPage?: number | null;
        prevPage?: number | null;
      };

      const slimmed = response.docs.map(comment => ({
        id: comment.id,
        parent: slimComment(comment.parent),
        body: comment.body,
        author: slimMember(comment.author),
        mentions: Array.isArray(comment.mentions)
          ? comment.mentions.map(m => slimMember(m)).filter(Boolean)
          : [],
        resolved: Boolean(comment.resolved),
        createdAt: comment.createdAt,
        editedAt: comment.editedAt ?? null,
      }));

      return formatPaginatedResponse({
        ...response,
        docs: slimmed,
      });
    }
    case 'add_comment': {
      return apiRequest('/comments', 'POST', {
        ticket: args.ticketId,
        body: args.body,
        parent: args.parentId || null,
        author: args.authorId || undefined,
      });
    }
    case 'update_comment': {
      const updates: Record<string, unknown> = {};
      if (args.body !== undefined) updates.body = args.body;
      if (args.resolved !== undefined) updates.resolved = args.resolved;
      return apiRequest(`/comments/${args.id}`, 'PATCH', updates);
    }
    case 'delete_comment': {
      return apiRequest(`/comments/${args.id}`, 'DELETE');
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  {
    name: 'local-pm-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, args as Record<string, unknown>);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Local PM MCP Server running on stdio');
}

main().catch(console.error);

# Local PM MCP Server

A Model Context Protocol (MCP) server for Local PM - a lightweight project management system with Kanban boards.

## Features

This MCP server provides AI models with full access to Local PM functionality:

### Projects
- `list_projects` - List all projects with pagination
- `get_project` - Get project details by ID
- `create_project` - Create a new project
- `update_project` - Update an existing project
- `delete_project` - Delete a project

### Teams
- `list_teams` - List all teams with pagination
- `get_team` - Get team details by ID
- `create_team` - Create a new team
- `update_team` - Update an existing team
- `delete_team` - Delete a team

### Members
- `list_members` - List the people tickets can be assigned to
- `get_member` - Get member details by ID
- `create_member` - Create a person work can be assigned to
- `update_member` - Update a member, or deactivate one who has left
- `delete_member` - Delete a member (their tickets become unassigned)

### Tickets
- `list_tickets` - List tickets with filtering by project, team, assignee, or status
- `get_ticket` - Get ticket details by ID (includes subtasks)
- `create_ticket` - Create a new ticket with optional subtasks
- `update_ticket` - Update ticket fields
- `move_ticket` - Move ticket between statuses (todo, in_progress, done)
- `delete_ticket` - Delete a ticket

### Board View
- `get_board` - Get Kanban board view for a project (tickets grouped by status)

### Subtasks
- `toggle_subtask` - Toggle a subtask's completion status
- `add_subtask` - Add a new subtask to a ticket

### Comments
- `list_comments` - List the comments on a ticket, oldest first
- `add_comment` - Post a comment, or a reply in an existing thread
- `update_comment` - Edit a comment body, or resolve/reopen a thread
- `delete_comment` - Delete a comment (and its replies, if it opened the thread)

## Installation

### Prerequisites
- Node.js 18+
- Local PM running at `http://localhost:3010` (or custom URL)

### Build from Source

```bash
cd mcp-server
npm install
npm run build
```

### Global Installation

```bash
cd mcp-server
npm install
npm run build
npm link
```

This makes `local-pm-mcp` available globally.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_PM_URL` | `http://localhost:3010` | Base URL of Local PM instance |

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "local-pm": {
      "command": "node",
      "args": ["C:/projects/local-pm/mcp-server/dist/index.js"],
      "env": {
        "LOCAL_PM_URL": "http://localhost:3010"
      }
    }
  }
}
```

Or if installed globally via `npm link`:

```json
{
  "mcpServers": {
    "local-pm": {
      "command": "local-pm-mcp",
      "env": {
        "LOCAL_PM_URL": "http://localhost:3010"
      }
    }
  }
}
```

### Claude Code Configuration

Add to your Claude Code settings file:

**Windows**: `%USERPROFILE%\.claude\settings.json`
**macOS/Linux**: `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "local-pm": {
      "command": "node",
      "args": ["C:/projects/local-pm/mcp-server/dist/index.js"],
      "env": {
        "LOCAL_PM_URL": "http://localhost:3010"
      }
    }
  }
}
```

## Usage Examples

Once configured, AI models can interact with Local PM:

### Create a Project
```
Create a new project called "Website Redesign" with color blue
```

### Create Tickets
```
Create a ticket "Design homepage mockup" in the Website Redesign project
```

### View Board
```
Show me the Kanban board for the Website Redesign project
```

### Move Tickets
```
Move ticket WEBS-1 to in_progress status
```

### Add Subtasks
```
Add subtasks "Create wireframe" and "Review with team" to ticket WEBS-1
```

## Tool Reference

### list_projects
Lists all projects with optional pagination.

**Parameters:**
- `limit` (number, optional): Max results to return (default: 50)
- `page` (number, optional): Page number (default: 1)

### get_project
Gets a project by ID.

**Parameters:**
- `id` (string, required): Project ID

### create_project
Creates a new project.

**Parameters:**
- `name` (string, required): Project name
- `description` (string, optional): Project description
- `prefix` (string, optional): Ticket ID prefix (auto-generated if not provided)
- `color` (string, optional): Hex color code

### update_project
Updates an existing project.

**Parameters:**
- `id` (string, required): Project ID
- `name` (string, optional): New name
- `description` (string, optional): New description
- `color` (string, optional): New color

### delete_project
Deletes a project.

**Parameters:**
- `id` (string, required): Project ID

### list_teams
Lists all teams with optional pagination.

**Parameters:**
- `limit` (number, optional): Max results (default: 50)
- `page` (number, optional): Page number (default: 1)

### get_team
Gets a team by ID.

**Parameters:**
- `id` (string, required): Team ID

### create_team
Creates a new team.

**Parameters:**
- `name` (string, required): Team name
- `type` (string, optional): Team type (development, design, qa, devops, management, support, other)
- `description` (string, optional): Team description
- `color` (string, optional): Hex color code

### update_team
Updates an existing team.

**Parameters:**
- `id` (string, required): Team ID
- `name` (string, optional): New name
- `type` (string, optional): New type
- `description` (string, optional): New description
- `color` (string, optional): New color

### delete_team
Deletes a team.

**Parameters:**
- `id` (string, required): Team ID

### list_members
Lists the people tickets can be assigned to. Members are distinct from login
accounts: a member is a person work is assigned to, a user is a credential.

**Parameters:**
- `teamId` (string, optional): Filter by team ID
- `activeOnly` (boolean, optional): Only people still active (default: true)
- `limit` (number, optional): Max results (default: 20)
- `page` (number, optional): Page number (default: 1)
- `include` (array, optional): Extra fields — `email`, `team`, `user`, `createdAt`, `updatedAt`

### get_member
Gets a member by ID.

**Parameters:**
- `id` (string, required): Member ID

### create_member
Creates a person work can be assigned to.

**Parameters:**
- `name` (string, required): Display name
- `email` (string, optional): Email address
- `team` (string, optional): Team ID
- `user` (string, optional): Login account ID to link. One account maps to at most one member.

### update_member
Updates a member.

**Parameters:**
- `id` (string, required): Member ID
- `name` (string, optional): New display name
- `email` (string, optional): New email address
- `team` (string, optional): New team ID (null to remove from the team)
- `active` (boolean, optional): Set false when someone leaves — they keep existing
  assignments but drop out of the assignee pickers
- `user` (string, optional): Login account ID to link (null to unlink)

### delete_member
Deletes a member. Tickets assigned to them become unassigned. Prefer
`update_member` with `active: false`, which preserves history.

**Parameters:**
- `id` (string, required): Member ID

### list_tickets
Lists tickets with optional filtering.

**Parameters:**
- `project` (string, optional): Filter by project ID
- `team` (string, optional): Filter by team ID
- `assigneeId` (string, optional): Filter by assignee (member) ID
- `status` (string, optional): Filter by status (todo, in_progress, done)
- `limit` (number, optional): Max results (default: 50)
- `page` (number, optional): Page number (default: 1)

### get_ticket
Gets a ticket by ID with full details including subtasks.

**Parameters:**
- `id` (string, required): Ticket ID

### create_ticket
Creates a new ticket.

**Parameters:**
- `title` (string, required): Ticket title
- `project` (string, required): Project ID
- `description` (string, optional): Ticket description (supports markdown)
- `status` (string, optional): Initial status (todo, in_progress, done) - defaults to todo
- `team` (string, optional): Assigned team ID
- `assignee` (string, optional): Assignee member ID — use `list_members` to find one
- `subtasks` (array, optional): Array of subtask objects with `title` and optional `completed` fields

### update_ticket
Updates an existing ticket.

**Parameters:**
- `id` (string, required): Ticket ID
- `title` (string, optional): New title
- `description` (string, optional): New description
- `team` (string, optional): New team ID

### move_ticket
Moves a ticket to a different status.

**Parameters:**
- `id` (string, required): Ticket ID
- `status` (string, required): New status (todo, in_progress, done)

### delete_ticket
Deletes a ticket.

**Parameters:**
- `id` (string, required): Ticket ID

### get_board
Gets the Kanban board view for a project with tickets grouped by status.

**Parameters:**
- `project` (string, required): Project ID

### toggle_subtask
Toggles a subtask's completion status.

**Parameters:**
- `ticketId` (string, required): Parent ticket ID
- `subtaskIndex` (number, required): Index of subtask in array (0-based)

### add_subtask
Adds a new subtask to a ticket.

**Parameters:**
- `ticketId` (string, required): Parent ticket ID
- `title` (string, required): Subtask title

### list_comments
Lists the comments on a ticket, oldest first. Threads are one level deep: a comment
carrying a `parent` is a reply to the comment that opened that thread.

**Parameters:**
- `ticketId` (string, required): The ticket whose comments to list
- `parentId` (string, optional): Only the replies in this thread
- `includeResolved` (boolean, optional): Include resolved threads (default: true)
- `limit` (number, optional): Maximum comments to return (default: 50)
- `page` (number, optional): Page number, 1-indexed (default: 1)

### add_comment
Posts a comment on a ticket, or a reply in an existing thread.

**Parameters:**
- `ticketId` (string, required): The ticket to comment on
- `body` (string, required): Markdown body
- `parentId` (string, optional): The comment that opened the thread, to reply to it
- `authorId` (string, optional): Member ID to attribute the comment to

**Mentions:** write `@[Their Name](member:THEIR_ID)` inside the body; `list_members`
gives the IDs. Mentioned people are resolved into the comment's `mentions` array on
every save, so they stay queryable even if the body is edited later.

### update_comment
Edits a comment body, or resolves/reopens a thread. Only the comment that opened a
thread can carry `resolved`.

**Parameters:**
- `id` (string, required): The comment ID
- `body` (string, optional): New markdown body
- `resolved` (boolean, optional): Resolve (true) or reopen (false) the thread

### delete_comment
Deletes a comment. Deleting the comment that opened a thread deletes its replies too.

**Parameters:**
- `id` (string, required): The comment ID to delete

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Start the server
npm start
```

## Troubleshooting

### "Connection refused" errors
Make sure Local PM is running at the configured URL (default: `http://localhost:3010`).

### Tools not appearing in Claude
1. Restart Claude Desktop/Claude Code after updating config
2. Check the config file path is correct for your OS
3. Verify the path to `dist/index.js` is absolute and correct

### Permission errors on Windows
Use forward slashes in paths even on Windows, or escape backslashes.

## License

MIT

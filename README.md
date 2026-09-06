# Local PM

A lightweight, self-hosted project management tool with a built-in MCP (Model Context Protocol) server that enables AI assistants to manage your projects, tickets, and teams directly.

## Features

- **Kanban Board** - Drag-and-drop ticket management with Todo, In Progress, and Done columns
- **Projects** - Organize work with customizable projects (icons, colors, prefixes)
- **Teams** - Assign tickets to teams for better organization
- **Tickets** - Full-featured tickets with:
  - Priority levels (Urgent, High, Medium, Low)
  - Due dates
  - Custom labels with colors
  - Subtasks with completion tracking
  - Ticket dependencies (blocked by)
  - Rich text descriptions
- **MCP Server** - AI-native project management via Model Context Protocol
- **Self-Hosted** - Your data stays on your machine
- **Docker Ready** - One command deployment

## Screenshots

### Kanban Board
<p>
  <img width="400" alt="Kanban Board" src="https://github.com/user-attachments/assets/d8f271ca-2503-41ea-9d7c-11aef09a9119" />
  <img width="400" alt="Ticket Details" src="https://github.com/user-attachments/assets/de2b062a-ec17-43b1-8bbb-31b208100cbc" />
</p>

### Tickets
<p>
  <img width="400" alt="Ticket View" src="https://github.com/user-attachments/assets/b2265f8f-8358-42d2-9b81-df8798bf4be2" />
  <img width="400" alt="Ticket Edit" src="https://github.com/user-attachments/assets/e04a0c77-6d74-477b-9ca1-a055ea9b0d47" />
</p>

### Projects
<p>
  <img width="400" alt="Projects List" src="https://github.com/user-attachments/assets/38bd0867-ed7e-43aa-bec2-c2ae469be01e" />
  <img width="400" alt="Project Details" src="https://github.com/user-attachments/assets/2970d1ea-eeba-49a5-91de-5a9a538a6857" />
</p>

### Teams
<p>
  <img width="400" alt="Teams List" src="https://github.com/user-attachments/assets/3db9dcd7-d7f9-4117-a82c-308eaff1ced3" />
  <img width="400" alt="Team Details" src="https://github.com/user-attachments/assets/20102c8e-c6e2-4bcb-bfcb-e1449914e275" />
</p>

## Repository structure (pnpm workspace)

The repository is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with
an orchestrator root and two independent, first-class packages:

```
local-pm/
├── package.json               # private orchestrator root (build/dev/seed scripts)
├── pnpm-workspace.yaml        # packages: apps/*, packages/*
├── pnpm-lock.yaml             # single lockfile for the whole repo
├── tsconfig.base.json         # shared compiler options
├── apps/
│   └── web/                   # the Next.js 15 + Payload 3.x application
├── packages/
│   └── mcp-server/            # @local-pm/mcp-server — MCP server package
├── Dockerfile                 # multi-stage build consuming the workspace
└── docs/                      # specs, requirements, ADRs
```

The two packages declare **no dependency on each other** — the only interface
is HTTP (`LOCAL_PM_URL`). Each builds and type-checks in isolation:

```bash
pnpm install                          # installs everything from the root
pnpm --filter local-pm-web build      # build the app only
pnpm --filter @local-pm/mcp-server build   # build the MCP server only
pnpm mcp:build                        # same, via the root orchestrator script
```

## Installation

### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/your-username/local-pm.git
cd local-pm
```

2. Start the containers:
```bash
docker compose up -d --build
```

3. Access the app at http://localhost:3010

### Manual Installation

1. Clone the repository and install dependencies (from the repo root):
```bash
git clone https://github.com/your-username/local-pm.git
cd local-pm
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your MongoDB connection string
```

3. Run the development server:
```bash
pnpm dev
```

## MCP Server Setup

The MCP (Model Context Protocol) server allows AI assistants like Claude to interact with your project management data directly.

### Building the MCP Server

From the repository root:
```bash
pnpm install
pnpm mcp:build
```

The compiled server lands in `packages/mcp-server/dist/index.js`.

### Adding to Claude Code (Global)

```bash
claude mcp add --scope user local-pm node "/path/to/local-pm/packages/mcp-server/dist/index.js"
```

### Adding to Claude Desktop

Add to your Claude Desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "local-pm": {
      "command": "node",
      "args": ["/path/to/local-pm/packages/mcp-server/dist/index.js"],
      "env": {
        "LOCAL_PM_URL": "http://localhost:3010"
      }
    }
  }
}
```

## MCP Tools Reference

The MCP server exposes 18 tools for complete project management:

### Project Tools
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with optional status filter |
| `get_project` | Get detailed project information by ID |
| `create_project` | Create a new project with name, prefix, icon, color |
| `update_project` | Update project properties |
| `delete_project` | Delete a project and optionally all its tickets |

### Team Tools
| Tool | Description |
|------|-------------|
| `list_teams` | List all teams |
| `get_team` | Get detailed team information by ID |
| `create_team` | Create a new team |
| `update_team` | Update team properties |
| `delete_team` | Delete a team |

### Ticket Tools
| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets with filters (project, team, status, priority) |
| `get_ticket` | Get detailed ticket information by ID |
| `create_ticket` | Create a new ticket with full properties |
| `update_ticket` | Update ticket properties |
| `move_ticket` | Move ticket to different status column |
| `delete_ticket` | Delete a ticket |

### Board & Subtask Tools
| Tool | Description |
|------|-------------|
| `get_board` | Get full Kanban board grouped by status |
| `toggle_subtask` | Toggle subtask completion status |
| `add_subtask` | Add a subtask to a ticket |

## How MCP Enhances AI Development

### What is MCP?

Model Context Protocol (MCP) is an open standard that enables AI assistants to interact with external tools and data sources. Instead of just chatting, AI can take actions in the real world through well-defined tool interfaces.

### Benefits for AI-Assisted Development

1. **Persistent Task Tracking**
   - AI can create tickets for features it's implementing
   - Track progress across coding sessions
   - Never lose context on what was done or what's pending

2. **Structured Workflow**
   - AI breaks down complex features into subtasks
   - Sets priorities and due dates
   - Manages dependencies between tickets

3. **Project Organization**
   - AI can organize work into logical projects
   - Assign tasks to teams
   - Maintain a clear overview of all work

4. **Seamless Integration**
   - Works directly in your AI coding workflow
   - No context switching to external tools
   - AI reads and updates tickets as it works

### Example Workflow

```
You: "Create a project for our new authentication system"

AI: [Creates project AUTH with relevant description]

You: "Break down the login feature into tickets"

AI: [Creates tickets for:
  - AUTH-1: Implement login form UI
  - AUTH-2: Create authentication API endpoint
  - AUTH-3: Add JWT token handling
  - AUTH-4: Implement session management
  Sets AUTH-2 as blocking AUTH-3 and AUTH-4]

You: "Start working on the login form"

AI: [Moves AUTH-1 to In Progress, implements the feature,
     then moves to Done when complete]
```

### Why Local & Self-Hosted?

- **Privacy**: Your project data stays on your machine
- **Speed**: No network latency for AI tool calls
- **Control**: Customize and extend as needed
- **Offline**: Works without internet connection

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Backend**: Payload CMS 3.0
- **Database**: MongoDB
- **MCP Server**: TypeScript, @modelcontextprotocol/sdk

## Special Thanks

Built with [Payload CMS](https://payloadcms.com/)

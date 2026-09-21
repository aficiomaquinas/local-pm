import type { CollectionConfig } from 'payload'
import {
  ProjectStatus,
  PROJECT_STATUS_OPTIONS,
  PROJECT_ICONS,
  PROJECT_COLORS,
  CycleAutomation,
  CycleRollover,
  CYCLE_AUTOMATION_OPTIONS,
  CYCLE_ROLLOVER_OPTIONS,
} from '@/types/enums'
import { collectionAccess } from '@/lib/access'
import {
  DEFAULT_CYCLE_LENGTH_WEEKS,
  DEFAULT_CYCLE_START_DAY,
  DEFAULT_UPCOMING_CYCLES,
  MAX_CYCLE_LENGTH_WEEKS,
  MAX_UPCOMING_CYCLES,
  MIN_CYCLE_LENGTH_WEEKS,
} from '@/lib/cycles'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'prefix', 'status', 'createdAt'],
    description: 'Projects organize related tickets together',
  },
  access: collectionAccess,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'The name of the project',
      },
    },
    {
      name: 'prefix',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Short prefix for ticket IDs (e.g., PROJ for PROJ-123)',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return 'Prefix is required'
        if (!/^[A-Z]{2,6}$/.test(value)) {
          return 'Prefix must be 2-6 uppercase letters'
        }
        return true
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Detailed description of the project',
      },
    },
    {
      name: 'icon',
      type: 'select',
      options: PROJECT_ICONS.map((icon) => ({ label: icon, value: icon })),
      defaultValue: 'folder',
      admin: {
        description: 'Icon to represent the project',
      },
    },
    {
      name: 'color',
      type: 'select',
      options: PROJECT_COLORS.map((color) => ({ label: color, value: color })),
      defaultValue: '#6366f1',
      admin: {
        description: 'Color theme for the project',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: PROJECT_STATUS_OPTIONS,
      defaultValue: ProjectStatus.ACTIVE,
      required: true,
      admin: {
        description: 'Current status of the project',
      },
    },
    {
      name: 'cycles',
      type: 'group',
      admin: {
        description: 'Time-boxed cycles for this project',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Turn cycles on for this project. Off by default.',
          },
        },
        {
          name: 'lengthWeeks',
          type: 'number',
          defaultValue: DEFAULT_CYCLE_LENGTH_WEEKS,
          min: MIN_CYCLE_LENGTH_WEEKS,
          max: MAX_CYCLE_LENGTH_WEEKS,
          admin: {
            description: 'How long each cycle runs. Applies to cycles created from now on.',
          },
        },
        {
          name: 'startDay',
          type: 'number',
          defaultValue: DEFAULT_CYCLE_START_DAY,
          min: 0,
          max: 6,
          admin: {
            description: 'Weekday the first cycle starts on, 0 being Sunday',
          },
        },
        {
          name: 'rollover',
          type: 'select',
          options: CYCLE_ROLLOVER_OPTIONS,
          defaultValue: CycleRollover.NEXT,
          admin: {
            description: 'Where incomplete tickets go when a cycle closes',
          },
        },
        {
          name: 'automation',
          type: 'select',
          options: CYCLE_AUTOMATION_OPTIONS,
          defaultValue: CycleAutomation.AUTOMATIC,
          admin: {
            description:
              'Automatic closes elapsed cycles on the server on a schedule. Manual waits for someone to close each cycle.',
          },
        },
        {
          name: 'upcomingCount',
          type: 'number',
          defaultValue: DEFAULT_UPCOMING_CYCLES,
          min: 0,
          max: MAX_UPCOMING_CYCLES,
          admin: {
            description: 'How many future cycles to keep provisioned ahead of the active one',
          },
        },
      ],
    },
    {
      name: 'ticketCounter',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-incremented counter for ticket IDs',
      },
    },
  ],
  timestamps: true,
}

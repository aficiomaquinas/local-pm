import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Activity } from './collections/Activity'
import { Attachments } from './collections/Attachments'
import { Comments } from './collections/Comments'
import { Cycles } from './collections/Cycles'
import { Members } from './collections/Members'
import { Projects } from './collections/Projects'
import { Statuses } from './collections/Statuses'
import { Teams } from './collections/Teams'
import { Tickets } from './collections/Tickets'
import { Users } from './collections/Users'
import { CYCLE_CRON, CYCLE_QUEUE, cycleCronEnabled, cycleRolloverTask } from './jobs/cycle-rollover'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Projects,
    Teams,
    Members,
    Statuses,
    Cycles,
    Tickets,
    Comments,
    Attachments,
    Activity,
  ],
  jobs: {
    tasks: [cycleRolloverTask],
    deleteJobOnComplete: true,
    autoRun: cycleCronEnabled()
      ? [{ cron: CYCLE_CRON, queue: CYCLE_QUEUE, limit: 10 }]
      : [],
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
    connectOptions: {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS ?? 10000),
    },
  }),
})

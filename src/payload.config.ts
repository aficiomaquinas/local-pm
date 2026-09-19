import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Projects } from './collections/Projects'
import { Teams } from './collections/Teams'
import { Tickets } from './collections/Tickets'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Projects, Teams, Tickets],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
    connectOptions: {
      // Bound mongoose's server selection so an unreachable database fails
      // fast and deterministically instead of riding the 30s default.
      //
      // aficiomaquinas/local-pm hard-codes 3000 here, which is right for a
      // mongodb container on the same compose network and too short for a
      // hosted cluster over the public internet — it makes `npm run seed`
      // fail against Atlas. Configurable, with a default that works for both.
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS ?? 10000),
    },
  }),
})

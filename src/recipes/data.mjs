export function data(c) {
  if (c.has('hub')) {
    c.module('@nuxthub/core'); c.add('drizzle-orm'); c.add('drizzle-kit')
    const pg = c.options.database === 'postgresql'
    c.add(pg ? 'postgres' : 'mysql2')
    c.cfg.hub = { db: { dialect: c.options.database, driver: pg ? 'postgres-js' : 'mysql2', applyMigrationsDuringBuild: false, applyMigrationsDuringDev: false } }
    c.env.push(`DATABASE_URL=${pg ? 'postgresql' : 'mysql'}://app:app@127.0.0.1:${pg ? '5432' : '3306'}/app`)
    c.pkg.scripts['db:generate'] = 'nuxt db generate'
    c.pkg.scripts['db:migrate'] = 'nuxt db migrate'
    c.file('server/db/schema/notes.ts', pg ? `import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})` : `import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core'
export const notes = mysqlTable('notes', {
  id: int('id').primaryKey().autoincrement(),
  title: varchar('title', { length: 200 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
})`)
    c.notes.push('Run db:generate once after installation, inspect and commit the generated migrations, then run db:migrate. Builds never modify your database. No second drizzle.config.ts is generated.')
  }
  if (c.has('redis')) {
    c.add('ioredis'); c.add('unstorage')
    c.cfg.runtimeConfig.redisCacheUrl = ''
    c.cfg.runtimeConfig.redisStateUrl = ''
    c.cfg.runtimeConfig.redisPrefix = `${c.options.name}:`
    c.env.push('NUXT_REDIS_CACHE_URL=redis://127.0.0.1:6379', 'NUXT_REDIS_STATE_URL=redis://127.0.0.1:6380', `NUXT_REDIS_PREFIX=${c.options.name}:`)
    c.file('server/plugins/redis.ts', `import redisDriver from 'unstorage/drivers/redis'

export default defineNitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()
  if (!config.redisCacheUrl || !config.redisStateUrl) {
    throw new Error('NUXT_REDIS_CACHE_URL and NUXT_REDIS_STATE_URL are required; refusing a local cache fallback')
  }
  const storage = useStorage()
  await storage.unmount('cache', true)
  storage.mount('cache', redisDriver({ url: config.redisCacheUrl, base: config.redisPrefix + 'cache', maxRetriesPerRequest: 1 }))
  storage.mount('kv', redisDriver({ url: config.redisStateUrl, base: config.redisPrefix + 'kv', maxRetriesPerRequest: 1 }))
  nitroApp.hooks.hook('close', async () => {
    await storage.unmount('cache', true)
    await storage.unmount('kv', true)
  })
})`)
    c.file('server/utils/kv.ts', `/** Durable non-secret key-value data; auth uses its own Redis namespace. */
export function kv() { return useStorage('kv') }`)
    c.file('server/utils/cached-example.ts', `/** Public, non-user-specific data only. Never cache an authenticated response globally. */
export const getCachedExample = defineCachedFunction(async () => ({ calculatedAt: new Date().toISOString() }), {
  name: 'starter-example', maxAge: 60, swr: false
})`)
    c.notes.push('Cache and durable state use separate Redis instances, not just different Redis databases. Cache may evict; sessions/queues use noeviction and AOF. URLs are read at runtime, not embedded into build artefacts.')
  }
}

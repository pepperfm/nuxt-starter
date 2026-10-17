export function queue(c) {
  if (!c.has('queue')) return
  c.add('bullmq')
  c.pkg.scripts.worker = 'bun run workers/index.ts'
  c.pkg.scripts['queue:demo'] = 'bun run workers/enqueue.ts'
  c.pkg.scripts['schedule:register'] = 'bun run workers/schedules.ts'
  c.pkg.scripts['typecheck:worker'] = 'tsc --noEmit -p tsconfig.worker.json'
  c.file('tsconfig.worker.json', JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noEmit: true, skipLibCheck: true, types: ['node'], allowImportingTsExtensions: true
  }, include: ['workers/**/*.ts'] }, null, 2))
  c.file('workers/connection.ts', `import { Redis } from 'ioredis'

/** Ordinary TypeScript: no Nitro imports or request-scoped helpers in a worker. */
export function connection(worker = false) {
  const url = process.env.NUXT_REDIS_STATE_URL
  if (!url) throw new Error('NUXT_REDIS_STATE_URL is required')
  const client = new Redis(url, { maxRetriesPerRequest: worker ? null : 1, connectTimeout: 5000 })
  client.on('error', () => console.error('Queue Redis connection error'))
  return client
}
export function queuePrefix() {
  return (process.env.NUXT_REDIS_PREFIX || '${c.options.name}:') + 'bull'
}
export const queueName = 'default'`)
  c.file('workers/processor.ts', `import type { Job } from 'bullmq'
import { z } from 'zod'
const example = z.object({ message: z.string().min(1).max(200) })

export async function processJob(job: Pick<Job, 'name' | 'data'>) {
  switch (job.name) {
    case 'heartbeat': return { ok: true }
    case 'example': return { accepted: example.parse(job.data).message }
    default: throw new Error('Unknown job name: ' + job.name)
  }
}
// Jobs are at-least-once: real external side effects need idempotency keys or a DB transaction.`)
  c.file('workers/index.ts', `import { Worker } from 'bullmq'
import { connection, queuePrefix, queueName } from './connection'
import { processJob } from './processor'
const redis = connection(true)
const worker = new Worker(queueName, processJob, { connection: redis, prefix: queuePrefix(), concurrency: 5 })
worker.on('error', () => console.error('Worker connection or processing error'))
worker.on('failed', job => console.error('Job failed', { id: job?.id, name: job?.name }))
worker.on('completed', job => console.info('Job completed', { id: job.id, name: job.name }))
let closing = false
async function close() {
  if (closing) return
  closing = true
  try { await worker.close() }
  finally { redis.disconnect() }
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { close().catch(() => { process.exitCode = 1 }) })
await worker.waitUntilReady()
console.info('Worker ready')`)
  c.file('workers/enqueue.ts', `import { Queue } from 'bullmq'
import { connection, queuePrefix, queueName } from './connection'
const redis = connection()
const queue = new Queue(queueName, { connection: redis, prefix: queuePrefix() })
try {
  const job = await queue.add('example', { message: 'Hello from the starter' }, {
    attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000
  })
  console.info('Queued job', job.id)
} finally { await queue.close(); redis.disconnect() }`)
  c.file('workers/schedules.ts', `import { Queue } from 'bullmq'
import { connection, queuePrefix, queueName } from './connection'
const redis = connection()
const queue = new Queue(queueName, { connection: redis, prefix: queuePrefix() })
try {
  await queue.upsertJobScheduler('hourly-heartbeat', { pattern: '0 * * * *', tz: 'UTC' }, {
    name: 'heartbeat', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 }
  })
  console.info('Schedules registered')
} finally { await queue.close(); redis.disconnect() }`)
  if (c.has('test')) c.file('tests/worker.test.ts', `import { describe, it, expect } from 'vitest'
import { processJob } from '../workers/processor'
describe('worker processor', () => {
  it('processes a heartbeat', async () => { expect(await processJob({ name: 'heartbeat', data: {} })).toEqual({ ok: true }) })
  it('validates job data', async () => { await expect(processJob({ name: 'example', data: {} })).rejects.toThrow() })
  it('rejects unknown job types', async () => { await expect(processJob({ name: 'unexpected', data: {} })).rejects.toThrow('Unknown job') })
})`)
  c.notes.push('Run schedule:register once per deployment; do not register schedules inside HTTP handlers. The worker is a separate Bun process. A scheduler queues work but does not guarantee exact wall-clock execution under load. Add domain-level idempotency before using real side effects.')
}

/** Network/infrastructure integration suite. Run on CI or a machine with Bun and the selected services. */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { normalize } from '../src/options.mjs'
import { buildProject, writeProject, finishProject, run } from '../src/generator.mjs'
const scenario = process.argv[2] ?? 'nuxt-ui'
const matrix = {
  none: { ui: 'none', backend: 'none', modules: 'eslint,test' },
  'nuxt-ui': { ui: 'nuxt-ui', backend: 'none', modules: 'eslint,test,i18n,mdc,image' },
  shadcn: { ui: 'shadcn', backend: 'none', modules: 'eslint,test,i18n' },
  element: { ui: 'element', backend: 'none', modules: 'eslint,test,i18n,vueuse,pinia' },
  content: { ui: 'nuxt-ui', backend: 'none', modules: 'eslint,test,content' },
  fullstack: { ui: 'nuxt-ui', backend: 'fullstack', modules: 'eslint,test,i18n,security' },
  mysql: { ui: 'none', backend: 'data', database: 'mysql', modules: 'eslint,test' }
}
assert.ok(matrix[scenario], 'Unknown smoke scenario')
const root = resolve('.smoke')
await mkdir(root, { recursive: true })
const options = normalize({ target: resolve(root, scenario), values: { ...matrix[scenario], 'no-install': true, 'no-git': true, 'no-docker': true } })
const plan = buildProject(options)
await writeProject(options, plan)
// Exercise exactly the consumer setup path, including initial formatting.
await finishProject({ ...options, install: true, git: false })
await run('bun', ['run', 'typecheck'], options.dir)
{
  const path = resolve(options.dir, scenario === 'shadcn' ? 'app/components/ui/button/Button.vue' : 'app/pages/index.vue')
  const original = await readFile(path, 'utf8')
  try {
    await writeFile(path, original.replace('<script setup lang="ts">', '<script setup lang="ts">\nconst intentionalTypeProbe: number = \'must be rejected\''))
    const probe = spawnSync('bun', ['run', 'typecheck'], { cwd: options.dir, encoding: 'utf8', timeout: 60000 })
    assert.ok(!probe.error, 'SFC typecheck probe failed to execute')
    assert.notEqual(probe.status, 0, 'Vue SFC type errors must not be silently skipped by the checker')
    assert.match(probe.stdout + probe.stderr, /TS2322/, 'Expected the deliberate string-to-number type error in the Vue SFC')
  } finally { await writeFile(path, original) }
}
if (options.features.includes('queue')) await run('bun', ['run', 'typecheck:worker'], options.dir)
await run('bun', ['run', 'test'], options.dir)
// No fixes here: the installed generated app must pass its own CI unchanged.
await run('bun', ['run', 'lint'], options.dir)
if (options.features.includes('hub')) {
  await run('bun', ['run', 'db:generate'], options.dir)
  await run('bun', ['run', 'db:migrate'], options.dir)
}
await run('bun', ['run', 'build'], options.dir)
const port = 4317
const origin = `http://127.0.0.1:${port}`
const localEnv = Object.fromEntries((await readFile(resolve(options.dir, '.env'), 'utf8')).split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)] }))
const env = { ...process.env, ...localEnv, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), NUXT_PUBLIC_SITE_URL: origin }
const child = spawn('bun', ['run', '.output/server/index.mjs'], { cwd: options.dir, env, stdio: 'inherit' })
let spawnError
child.on('error', error => { spawnError = error })
const delay = ms => new Promise(r => setTimeout(r, ms))
async function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return
  proc.kill('SIGTERM')
  for (let n = 0; n < 40 && proc.exitCode === null && proc.signalCode === null; n++) await delay(100)
  if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
}
function cookies(response) { return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ') }
async function request(path, body, cookie = '') {
  return fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) throw new Error('Bun server exited before readiness')
    try { ready = (await fetch(origin + '/api/health')).ok; if (ready) break } catch { /* startup */ }
    await delay(300)
  }
  assert.ok(ready, 'Bun server did not become ready')
  const page = await fetch(origin)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes('PEPPERFM'), 'SSR did not render the starter')
  assert.ok(!html.includes('[object Object]'), 'SSR serialization regression')
  assert.match(html, /<button[^>]*>[\s\S]*?Counter: 0[\s\S]*?<\/button>/, 'Selected UI must render a real button, not an unresolved custom element')
  if (options.modules.includes('i18n')) assert.equal((await fetch(origin + '/en')).status, 200)
  if (options.modules.includes('mdc')) assert.match(await (await fetch(origin + '/markdown')).text(), /Markdown demo/)
  if (options.modules.includes('content')) assert.match(await (await fetch(origin + '/docs')).text(), /Your content/)
  if (options.features.includes('auth')) {
    assert.equal((await request('/api/me')).status, 401)
    const credentials = { email: 'smoke@example.com', password: 'a-unique-test-password-2947' }
    const signup = await request('/api/auth/sign-up/email', { ...credentials, name: 'Smoke User' })
    assert.ok(signup.ok, 'Sign-up failed with HTTP ' + signup.status)
    const first = cookies(signup)
    assert.ok(first, 'Sign-up did not set a session cookie')
    const me = await request('/api/me', undefined, first)
    assert.equal(me.status, 200)
    assert.match(me.headers.get('cache-control'), /no-store/)
    const identity = await me.json()
    assert.equal(identity.user.email, credentials.email)
    assert.ok(!JSON.stringify(identity).includes('token'))
    const login = await request('/api/auth/sign-in/email', credentials)
    assert.ok(login.ok, 'Sign-in failed with HTTP ' + login.status)
    const second = cookies(login)
    const devices = await request('/api/auth/list-sessions', undefined, second)
    assert.ok(devices.ok)
    const sessions = await devices.json()
    assert.equal(sessions.length, 2)
    const original = sessions.find(s => s.id === identity.session.id)
    assert.ok(original)
    assert.ok((await request('/api/auth/revoke-session', { token: original.token }, second)).ok)
    assert.equal((await request('/api/me', undefined, first)).status, 401, 'Revoked session remains active')
    assert.equal((await request('/api/me', undefined, second)).status, 200)
    assert.ok((await request('/api/auth/sign-out', {}, second)).ok)
    assert.equal((await request('/api/me', undefined, second)).status, 401)
    const crossOrigin = await fetch(origin + '/api/auth/sign-in/email', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify(credentials) })
    assert.equal(crossOrigin.status, 403)
    console.log('Redis-backed auth: sign-up, two sessions, revocation, sign-out and origin checks passed')
  }
  if (options.features.includes('queue')) {
    await run('bun', ['run', 'schedule:register'], options.dir)
    const worker = spawn('bun', ['run', 'workers/index.ts'], { cwd: options.dir, env, stdio: 'inherit' })
    worker.on('error', error => { spawnError = error })
    try {
      await writeFile(resolve(options.dir, 'queue-probe.ts'), `import assert from 'node:assert/strict'
import { Queue, QueueEvents } from 'bullmq'
import { connection, queuePrefix, queueName } from './workers/connection'
const producer = connection()
const subscriber = connection(true)
const q = new Queue(queueName, { connection: producer, prefix: queuePrefix() })
const events = new QueueEvents(queueName, { connection: subscriber, prefix: queuePrefix() })
try {
 await events.waitUntilReady()
 const job = await q.add('example', { message: 'CI probe' })
 assert.deepEqual(await job.waitUntilFinished(events, 30000), { accepted: 'CI probe' })
 assert.ok((await q.getJobSchedulers()).length > 0)
} finally { await events.close(); await q.close(); producer.disconnect(); subscriber.disconnect() }
`)
      await run('bun', ['run', 'queue-probe.ts'], options.dir)
      if (spawnError) throw spawnError
      console.log('Standalone Bun worker and persisted job scheduler passed')
    } finally { await stop(worker) }
  }
  console.log(`PASS: ${scenario} installed, typechecked, tested, built and served with Nitro Bun`)
} finally { await stop(child) }

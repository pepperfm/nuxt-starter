import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseCLI, normalize } from '../src/options.mjs'
import { buildProject, writeProject } from '../src/generator.mjs'
import { modules, uis } from '../src/catalog.mjs'
const cli = fileURLToPath(new URL('../bin/starter.mjs', import.meta.url))
const opts = (values = {}, target = '/tmp/pepperfm-test') => normalize({ values, target })

test('Bun is the default package manager AND Nitro runtime', () => {
  const options = opts()
  const plan = buildProject(options)
  assert.equal(options.pm, 'bun')
  assert.equal(plan.config.nitro.preset, 'bun')
  assert.equal(plan.pkg.scripts.start, 'bun run .output/server/index.mjs')
  assert.match(plan.files.get('deploy/app.service'), /ExecStart=\/usr\/local\/bin\/bun run \.output\/server\/index\.mjs/)
  assert.match(plan.files.get('deploy/worker.service'), /bun run workers\/index\.ts/)
})
test('choosing another installer never silently changes the server runtime', () => {
  assert.equal(buildProject(opts({ pm: 'npm' })).config.nitro.preset, 'bun')
})
test('defaults are UI + PostgreSQL/Redis/auth/queues, lint and tests', () => {
  const o = opts()
  assert.equal(o.ui, 'nuxt-ui'); assert.equal(o.database, 'postgresql')
  assert.deepEqual(o.modules, ['eslint', 'test'])
  assert.deepEqual(o.features, ['hub', 'redis', 'auth', 'queue'])
})
test('aliases and additive flags work', () => {
  const o = normalize(parseCLI(['my-app', '--ui', 'nuxtui', '--i18n', '--mdc']))
  assert.equal(o.ui, 'nuxt-ui')
  assert.deepEqual(o.modules, ['eslint', 'test', 'i18n', 'mdc'])
})
test('Content + MDC does not register the standalone MDC module twice', () => {
  const o = opts({ modules: 'content,mdc' })
  assert.deepEqual(o.modules, ['content'])
  assert.equal(o.notices.length, 1)
  assert.ok(!buildProject(o).config.modules.includes('@nuxtjs/mdc'))
})
test('auth and queue dependency closure is automatic', () => {
  assert.deepEqual(opts({ features: 'auth' }).features, ['hub', 'redis', 'auth'])
  assert.deepEqual(opts({ features: 'queue' }).features, ['redis', 'queue'])
})
test('unsafe names, unknown modules and unsupported combinations fail before writes', () => {
  for (const values of [{ ui: 'react' }, { modules: 'foo' }, { backend: 'foo' }, { features: 'foo' }, { pm: 'sh -c' }, { locales: '../../etc' }, { database: 'mysql' }]) assert.throws(() => opts(values))
  assert.throws(() => opts({}, '/tmp/Bad Project'))
  assert.throws(() => opts({}, '/'))
  assert.throws(() => normalize({ target: '.', values: {} }))
  assert.throws(() => parseCLI(['my-app', '--does-not-exist']))
})
test('empty backend is actually empty', () => {
  const p = buildProject(opts({ backend: 'none', modules: '', ui: 'none' }))
  assert.ok(!p.pkg.dependencies['@nuxthub/core'])
  assert.ok(!p.pkg.dependencies['better-auth'])
  assert.ok(!p.pkg.dependencies.bullmq)
  assert.ok(!p.files.has('compose.yaml'))
  assert.ok(!p.files.has('deploy/worker.service'))
})
test('four UI alternatives remain isolated', () => {
  for (const kit of uis) {
    const p = buildProject(opts({ ui: kit.value }))
    for (const [ui, pkg] of [['nuxt-ui', '@nuxt/ui'], ['shadcn', 'shadcn-nuxt'], ['element', '@element-plus/nuxt']]) {
      assert.equal(Boolean(p.pkg.dependencies[pkg]), kit.value === ui)
    }
    assert.equal(p.files.has('components.json'), kit.value === 'shadcn')
  }
})
test('shadcn Button class has a default and ESLint rejects all warnings', () => {
  const plan = buildProject(opts({ ui: 'shadcn', backend: 'none', modules: 'eslint,test' }))
  const button = plan.files.get('app/components/ui/button/Button.vue')
  assert.match(button, /class: ''/)
  assert.equal(plan.pkg.scripts.lint, 'eslint . --max-warnings 0')
  assert.equal(plan.pkg.scripts['lint:fix'], 'eslint . --fix --max-warnings 0')
})
test('render matrix: all individual modules with every UI and backend preset', () => {
  let count = 0
  for (const kit of uis) for (const backend of ['none', 'data', 'fullstack']) for (const mod of ['', ...modules.map(x => x.value), modules.map(x => x.value).join(',')]) {
    const p = buildProject(opts({ ui: kit.value, backend, modules: mod }))
    assert.equal(p.config.nitro.preset, 'bun')
    assert.ok(p.files.size >= 10)
    for (const [path, text] of p.files) {
      assert.ok(text.endsWith('\n'), path)
      if (path.endsWith('.json')) JSON.parse(text)
      assert.ok(!path.startsWith('/') && !path.split('/').includes('..'))
    }
    count++
  }
  assert.equal(count, 132)
})
test('MySQL is supported without silently generating PostgreSQL auth tables', () => {
  const p = buildProject(opts({ database: 'mysql', backend: 'data' }))
  assert.equal(p.config.hub.db.driver, 'mysql2')
  assert.match(p.files.get('server/db/schema/notes.ts'), /mysqlTable/)
  assert.match(p.files.get('compose.yaml'), /mysql:8.4/)
  assert.ok(!p.files.has('server/db/schema/auth.ts'))
})
test('auth uses official Redis storage and never falls back to a cookie session', () => {
  const p = buildProject(opts())
  const source = p.files.get('server/utils/auth.ts')
  assert.match(source, /@better-auth\/redis-storage/)
  assert.match(source, /cookieCache: \{ enabled: false \}/)
  assert.match(source, /storeSessionInDatabase: false/)
  assert.match(p.files.get('server/api/me.get.ts'), /requireUser\(event\)/)
  assert.ok(!p.files.get('server/api/me.get.ts').includes('token:'))
})
test('migrations cannot be applied during build or dev implicitly', () => {
  const { config } = buildProject(opts())
  assert.equal(config.hub.db.applyMigrationsDuringBuild, false)
  assert.equal(config.hub.db.applyMigrationsDuringDev, false)
})
test('cache and state use different Redis instances and policies', () => {
  const p = buildProject(opts())
  assert.match(p.files.get('compose.yaml'), /allkeys-lru/)
  assert.match(p.files.get('compose.yaml'), /noeviction/)
  assert.match(p.files.get('compose.yaml'), /appendonly/)
  assert.match(p.files.get('.env.example'), /127\.0\.0\.1:6379/)
  assert.match(p.files.get('.env.example'), /127\.0\.0\.1:6380/)
})
test('workers contain no Nuxt virtual aliases or request-scoped helpers', () => {
  const p = buildProject(opts())
  for (const [path, source] of p.files) if (path.startsWith('workers/')) assert.doesNotMatch(source, /@nuxthub|useRuntimeConfig|#imports|#app|defineEventHandler/)
})
test('no-docker and no-deploy are independent', () => {
  const p = buildProject(opts({ 'no-docker': true }))
  assert.ok(!p.files.has('compose.yaml')); assert.ok(p.files.has('deploy/app.service'))
  const q = buildProject(opts({ 'no-deploy': true }))
  assert.ok(q.files.has('compose.yaml')); assert.ok(!q.files.has('deploy/app.service'))
})
test('generation writes a private random env and refuses existing directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pepperfm-test-'))
  try {
    const one = opts({ 'no-install': true, 'no-git': true }, join(root, 'one'))
    const two = opts({ 'no-install': true, 'no-git': true }, join(root, 'two'))
    await writeProject(one); await writeProject(two)
    const secret1 = (await readFile(join(one.dir, '.env'), 'utf8')).match(/^NUXT_AUTH_SECRET=(.+)$/m)[1]
    const secret2 = (await readFile(join(two.dir, '.env'), 'utf8')).match(/^NUXT_AUTH_SECRET=(.+)$/m)[1]
    assert.ok(secret1.length >= 32); assert.notEqual(secret1, secret2)
    assert.ok(!(await readFile(join(one.dir, '.env.example'), 'utf8')).includes(secret1))
    if (process.platform !== 'win32') assert.equal((await stat(join(one.dir, '.env'))).mode & 0o777, 0o600)
    await writeFile(join(one.dir, 'keep.txt'), 'untouched')
    await assert.rejects(writeProject(one), /already exists/)
    assert.equal(await readFile(join(one.dir, 'keep.txt'), 'utf8'), 'untouched')
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('symlink destinations cannot overwrite another project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pepperfm-symlink-'))
  try {
    const real = join(root, 'real'); await mkdir(real)
    await symlink(real, join(root, 'linked'), 'dir')
    await assert.rejects(writeProject(opts({}, join(root, 'linked'))), /already exists/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('dry run creates no directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pepperfm-dry-'))
  try {
    const o = opts({ 'dry-run': true }, join(root, 'nothing'))
    await writeProject(o)
    await assert.rejects(stat(o.dir), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('recipe path traversal is rejected before writing anything', async () => {
  await assert.rejects(writeProject(opts(), { files: new Map([['../escape', 'x']]) }), /Unsafe recipe path/)
})
test('CLI help, version and noninteractive dry-run work without loading prompts', () => {
  for (const args of [['--help'], ['--version'], ['new-app', '--yes', '--dry-run']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.length > 0)
  }
  const bad = spawnSync(process.execPath, [cli], { encoding: 'utf8' })
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /Non-interactive/)
})

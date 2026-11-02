import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from '../src/options.mjs'
import { uiTemplates } from '../src/catalog.mjs'
import { buildProject } from '../src/generator.mjs'
import { combineUITemplate, buildUITemplateProject } from '../src/ui-template.mjs'

const options = values => normalize({ target: '/tmp/nuxt-template-test', values })

function fixture() {
  return new Map([
    ['package.json', JSON.stringify({
      name: 'upstream', scripts: { dev: 'nuxt dev', build: 'nuxt build', lint: 'eslint .' },
      dependencies: { nuxt: '^4.6.3', '@nuxt/ui': '^4.12.0' },
      devDependencies: { eslint: '^10.0.0' },
      packageManager: 'pnpm@12.0.0'
    })],
    ['nuxt.config.ts', "export default defineNuxtConfig({ modules: ['@nuxt/ui'], css: ['~/assets/css/main.css'] })\n"],
    ['app/app.vue', '<template><UApp><NuxtPage /></UApp></template>\n'],
    ['app/pages/index.vue', '<template><h1>My template design</h1></template>\n'],
    ['app/assets/css/main.css', '@import "tailwindcss";\n'],
    ['.env.example', 'PUBLIC_THEME=dark\n'],
    ['.gitignore', '/node_modules\n'],
    ['README.md', '# Official template\n'],
    ['eslint.config.mjs', "import withNuxt from './.nuxt/eslint.config.mjs'\nexport default withNuxt()\n"],
    ['public/preview.png', Buffer.from([0, 255, 128, 1])]
  ])
}

test('UI template selection leaves the old latest preset intact', () => {
  assert.equal(options({}).template, 'latest')
  assert.equal(options({ ui: 'nuxt-ui', template: 'dashboard' }).template, 'dashboard')
  assert.ok(uiTemplates.some(item => item.value === 'portfolio'))
  assert.throws(() => options({ ui: 'shadcn', template: 'dashboard' }), /only with --ui nuxt-ui/)
  assert.throws(() => options({ ui: 'nuxt-ui', template: '../invalid' }), /Unknown Nuxt UI template/)
  assert.throws(() => options({ template: 'saas' }), /already has \/login/)
  assert.throws(() => options({ template: 'chat' }), /own auth\/database/)
})

test('Dashboard preserves UI and adds PostgreSQL, Redis, auth and queues', () => {
  const opts = options({ template: 'dashboard', backend: 'fullstack' })
  const result = combineUITemplate(fixture(), buildProject(opts), opts)
  const pkg = JSON.parse(result.files.get('package.json'))
  assert.match(result.files.get('app/pages/index.vue'), /My template design/)
  assert.equal(result.files.get('app/assets/css/main.css'), '@import "tailwindcss";\n')
  assert.deepEqual(result.files.get('public/preview.png'), Buffer.from([0, 255, 128, 1]))
  assert.match(String(result.files.get('nuxt.template.config.ts')), /@nuxt\/ui/)
  assert.match(result.files.get('nuxt.config.ts'), /preset: 'bun'/)
  assert.match(result.files.get('nuxt.config.ts'), /@nuxthub\/core/)
  assert.match(result.files.get('eslint.config.mjs'), /original.append/)
  assert.match(String(result.files.get('eslint.template.config.mjs')), /withNuxt/)
  assert.ok(result.files.has('server/api/auth/[...all].ts'))
  assert.ok(result.files.has('server/plugins/redis.ts'))
  assert.ok(result.files.has('workers/index.ts'))
  assert.equal(pkg.dependencies['@nuxt/ui'], '^4.12.0')
  assert.equal(pkg.dependencies['defu'], '^6.1.4')
  assert.equal(pkg.dependencies['@nuxthub/core'], '^0.10.8')
  assert.equal(pkg.packageManager, undefined)
  assert.equal(pkg.scripts.start, 'bun run .output/server/index.mjs')
  assert.equal(JSON.parse(result.files.get('.pepperfm-starter.json')).template, 'dashboard')
  assert.match(result.files.get('.env.example'), /DATABASE_URL=/)
  assert.match(result.files.get('.env.example'), /PUBLIC_THEME=dark/)
})

test('Data-only backend works and real file collisions fail closed', () => {
  const opts = options({ template: 'portfolio', backend: 'data' })
  const upstream = fixture()
  const result = combineUITemplate(upstream, buildProject(opts), opts)
  assert.equal(result.config.hub.db.driver, 'postgres-js')
  assert.ok(result.files.has('server/db/schema/notes.ts'))
  assert.ok(!result.files.has('server/api/me.get.ts'))
  upstream.set('server/db/schema/notes.ts', 'export const existing = true\n')
  assert.throws(() => combineUITemplate(upstream, buildProject(opts), opts), /conflicts at server\/db\/schema\/notes.ts/)
})

test('Dry run never downloads an external UI template', async () => {
  const opts = options({ template: 'dashboard', 'dry-run': true })
  const plan = buildProject(opts)
  const result = await buildUITemplateProject(opts, plan, () => { throw new Error('Unexpected network') })
  assert.equal(result, plan)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from '../src/options.mjs'
import { buildProject, finishProject } from '../src/generator.mjs'

const options = values => normalize({ target: '/tmp/starter-setup-test', values })
test('normal setup installs and formats selected ESLint before git init', async () => {
  const calls = []
  await finishProject(options({}), async (...args) => { calls.push(args) })
  assert.deepEqual(calls.map(([cmd, args]) => [cmd, ...args]), [
    ['bun', 'install'], ['bun', 'run', 'lint:fix'], ['git', 'init', '-b', 'master']
  ])
})
test('no-install and no-git never execute implicit setup commands', async () => {
  const calls = []
  await finishProject(options({ 'no-install': true, 'no-git': true }), async (...args) => { calls.push(args) })
  await finishProject(options({ 'dry-run': true }), async (...args) => { calls.push(args) })
  assert.deepEqual(calls, [])
})
test('setup skips absent formatters; typechecker uses its Node shebang without weakening Vue types', async () => {
  const calls = []
  await finishProject(options({ modules: '', 'no-git': true }), async (...args) => { calls.push(args) })
  assert.deepEqual(calls.map(([cmd, args]) => [cmd, ...args]), [['bun', 'install']])
  assert.equal(buildProject(options({ ui: 'shadcn' })).config.typescript.shim, undefined)
  assert.equal(buildProject(options({ ui: 'nuxt-ui' })).config.typescript.shim, undefined)
  assert.equal(buildProject(options({})).pkg.scripts.typecheck, 'nuxt typecheck')
})

test('ESLint defaults format Vue props, JS object literals and if-else braces', () => {
  const project = buildProject(options({ modules: 'eslint', backend: 'none' }))
  const cfg = project.files.get('eslint.config.mjs')
  assert.match(project.files.get('nuxt.config.ts'), /stylistic/)
  assert.match(cfg, /@stylistic\/brace-style/)
  assert.match(cfg, /1tbs/)
  assert.match(cfg, /@stylistic\/object-curly-newline/)
  assert.match(cfg, /minProperties: 3/)
  assert.match(cfg, /@stylistic\/object-property-newline/)
  assert.match(cfg, /vue\/max-attributes-per-line/)
  assert.match(cfg, /singleline: \{ max: 2 \}/)
  assert.match(cfg, /vue\/first-attribute-linebreak/)
})
test('Content selects runtime-native SQLite without adding a compiled addon', () => {
  const p = buildProject(options({ modules: 'content' }))
  assert.equal(p.pkg.engines.node, '>=22.13.0')
  assert.match(p.files.get('nuxt.config.ts'), /process\.versions\.bun \? 'bun' : 'native'/)
  assert.equal(p.pkg.dependencies['better-sqlite3'], undefined)
  assert.equal(p.pkg.devDependencies['better-sqlite3'], undefined)
})

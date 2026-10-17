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

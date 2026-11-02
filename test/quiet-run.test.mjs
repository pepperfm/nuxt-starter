
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { run } from '../src/generator.mjs'

test('captured scaffolding failures preserve useful diagnostics, not temporary paths', async () => {
  await assert.rejects(run(process.execPath, [
    '-e', 'console.error("scaffold error at /tmp/pepperfm-nuxt-ui-secret/template"); process.exit(7)'
  ], process.cwd(), { quiet: true, redactPaths: ['/tmp/pepperfm-nuxt-ui-secret'] }), error => {
    assert.match(error.message, /scaffold error/)
    assert.doesNotMatch(error.message, /pepperfm-nuxt-ui-secret/)
    assert.match(error.message, /<temporary template>/)
    return true
  })
})

test('successful quiet scaffolding does not print the child process output', () => {
  const url = new URL('../src/generator.mjs', import.meta.url)
  const code = `import { run } from ${JSON.stringify(url.href)}; await run(process.execPath, ['-e', 'console.log("do not leak temporary template path")'], process.cwd(), { quiet: true })`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

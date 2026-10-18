import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateVersion, compareStableVersions, findPushRun } from '../release.mjs'

const pkg = { name: '@pepper_fm/nuxt-starter', version: '0.1.3' }

test('publish infers the committed package version when the argument is omitted', () => {
  assert.equal(validateVersion(pkg), '0.1.3')
  assert.equal(validateVersion(pkg, '0.1.3'), '0.1.3')
})

test('publish rejects mismatched, malformed and unexpected package versions before pushing', () => {
  assert.throws(() => validateVersion(pkg, '1.0.3'), /Version mismatch/)
  assert.throws(() => validateVersion({ ...pkg, version: '01.2.3' }), /stable X.Y.Z/)
  assert.throws(() => validateVersion({ ...pkg, version: '0.1.3-rc.1' }), /stable X.Y.Z/)
  assert.throws(() => validateVersion({ ...pkg, name: '@other/starter' }), /Unexpected package/)
})

test('stable npm version ordering prevents publishing a lower version', () => {
  assert.equal(compareStableVersions('0.1.3', '0.1.2'), 1)
  assert.equal(compareStableVersions('1.0.0', '0.99.99'), 1)
  assert.equal(compareStableVersions('0.1.2', '0.1.2'), 0)
  assert.equal(compareStableVersions('0.1.2', '1.0.0'), -1)
})

test('CI selection requires the exact commit and a push run', () => {
  const runs = [
    { databaseId: 1, headSha: 'abc', event: 'release', status: 'completed' },
    { databaseId: 2, headSha: 'wrong', event: 'push', status: 'completed' },
    { databaseId: 3, headSha: 'abc', event: 'push', status: 'completed' }
  ]
  assert.equal(findPushRun(runs, 'abc').databaseId, 3)
  assert.equal(findPushRun(runs, 'none'), undefined)
  assert.throws(() => findPushRun(null, 'abc'), /Invalid GitHub run list/)
})

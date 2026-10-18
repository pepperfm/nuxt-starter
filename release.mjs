#!/usr/bin/env bun
/**
 * Release orchestrator.
 *
 * 1. Validate committed package version, branch, tags and npm registry.
 * 2. Check the generator locally.
 * 3. Push master and WAIT for the full remote integration suite.
 * 4. Create a GitHub Release, which triggers the OIDC-only npm publish workflow.
 *
 * Never publish to npm or change package.json from this script.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repository = 'pepperfm/nuxt-starter'
const packageName = '@pepper_fm/nuxt-starter'
const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function exec(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })
  if (result.error) throw new Error(command + ': ' + result.error.message)
  if (result.status !== 0 && !allowFailure) {
    throw new Error(command + ' ' + args.join(' ') + ' failed (exit ' + result.status + ')' +
      (capture ? '\n' + (result.stderr || result.stdout || '') : ''))
  }
  return capture ? (result.stdout || '').trim() : result.status
}

export function validateVersion(pkg, requested) {
  if (pkg.name !== packageName) throw new Error('Unexpected package name: ' + pkg.name)
  if (!stableSemver.test(pkg.version)) {
    throw new Error('Set a stable X.Y.Z version in package.json first (got ' + pkg.version + ')')
  }
  if (requested !== undefined && requested !== pkg.version) {
    throw new Error('Version mismatch: package.json has ' + pkg.version + ', but pub was called with ' + requested)
  }
  return pkg.version
}

export function compareStableVersions(a, b) {
  if (!stableSemver.test(a) || !stableSemver.test(b)) throw new Error('Invalid stable version')
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) return Math.sign(partsA[i] - partsB[i])
  }
  return 0
}

export function findPushRun(runs, sha) {
  if (!Array.isArray(runs)) throw new Error('Invalid GitHub run list')
  return runs.find(run => run.headSha === sha && run.event === 'push' && Number.isInteger(run.databaseId))
}

function checkGit(version) {
  if (exec('git', ['branch', '--show-current'], { capture: true }) !== 'master') {
    throw new Error('Releases must be created from master')
  }
  if (exec('git', ['status', '--porcelain'], { capture: true }) !== '') {
    throw new Error('Working tree is dirty. Commit your changes (including package.json) first.')
  }
  const actualRepo = exec('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { capture: true })
  if (actualRepo !== repository) throw new Error('Not the expected GitHub repository: ' + actualRepo)

  const committed = JSON.parse(exec('git', ['show', 'HEAD:package.json'], { capture: true }))
  if (committed.version !== version) throw new Error('Version in package.json has not been committed')

  exec('git', ['fetch', 'origin', 'master', '--quiet'])
  if (exec('git', ['merge-base', '--is-ancestor', 'origin/master', 'HEAD'], { allowFailure: true }) !== 0) {
    throw new Error('Local master is behind/diverged from origin/master; pull/rebase first')
  }

  const tag = 'v' + version
  if (exec('git', ['ls-remote', '--tags', '--refs', 'origin', 'refs/tags/' + tag], { capture: true })) {
    throw new Error('Tag ' + tag + ' already exists on origin; choose a new version')
  }
  return exec('git', ['rev-parse', 'HEAD'], { capture: true })
}

async function checkRegistry(version) {
  const url = 'https://registry.npmjs.org/%40pepper_fm%2Fnuxt-starter'
  const response = await fetch(url, { headers: { accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(20000) })
  if (response.status !== 200) {
    throw new Error('Cannot verify npm registry (' + response.status + '). Nothing was pushed.')
  }
  const metadata = await response.json()
  if (metadata.versions?.[version]) throw new Error(packageName + '@' + version + ' is already published')
  const latest = metadata['dist-tags']?.latest
  if (typeof latest === 'string' && stableSemver.test(latest) && compareStableVersions(version, latest) <= 0) {
    throw new Error('Version ' + version + ' must be higher than npm latest ' + latest)
  }
}

function verify() {
  const steps = [
    ['bun', ['run', 'check']],
    ['bun', ['run', 'test']],
    ['bun', ['bin/starter.mjs', 'ci-dry-run', '--yes', '--dry-run', '--i18n', '--mdc']],
    ['npm', ['pack', '--dry-run']]
  ]
  for (const [command, args] of steps) {
    console.log('\n> ' + command + ' ' + args.join(' '))
    exec(command, args)
  }
}

async function waitForCI(sha) {
  console.log('\nWaiting for Starter CI (all seven integration scenarios)...')
  for (let attempt = 0; attempt < 60; attempt++) {
    const raw = exec('gh', [
      'run', 'list', '--repo', repository, '--workflow', 'ci.yml',
      '--branch', 'master', '--event', 'push', '--commit', sha,
      '--limit', '10', '--json', 'databaseId,status,conclusion,headSha,event'
    ], { capture: true })
    const run = findPushRun(JSON.parse(raw), sha)
    if (run) {
      console.log('Watching CI run #' + run.databaseId)
      exec('gh', ['run', 'watch', String(run.databaseId), '--repo', repository, '--exit-status'])
      return
    }
    await Bun.sleep(2000)
  }
  throw new Error('Timed out waiting for CI to start. No GitHub Release was created.')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1) throw new Error('Usage: bun run pub [X.Y.Z]  (or bun run verify)')
  if (args[0] === '--check-only') {
    verify()
    return
  }
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const version = validateVersion(pkg, args[0])
  const sha = checkGit(version)
  await checkRegistry(version)
  verify()

  console.log('\nPushing master...')
  exec('git', ['push', 'origin', 'master'])
  await waitForCI(sha)

  const remoteSha = exec('git', ['ls-remote', '--heads', 'origin', 'master'], { capture: true }).split(/\s+/)[0]
  if (remoteSha !== sha) {
    throw new Error('Remote master changed after CI; refusing to release the wrong commit')
  }

  console.log('\nCreating GitHub Release v' + version + '...')
  exec('gh', ['release', 'create', 'v' + version, '--repo', repository, '--target', sha, '--generate-notes'])
  console.log('\nDone: GitHub Actions will publish ' + packageName + '@' + version + ' to npm via OIDC.')
}

if (import.meta.main) {
  main().catch(error => {
    console.error('\nRelease aborted: ' + error.message)
    process.exitCode = 1
  })
}

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.smoke'].includes(e.name)) continue
    const path = join(dir, e.name)
    if (e.isDirectory()) await walk(path)
    else if (path.endsWith('.json')) JSON.parse(await readFile(path, 'utf8'))
    else if (path.endsWith('.mjs')) {
      const result = spawnSync('node', ['--check', path], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr || 'Node.js is required for the independent syntax check')
    }
  }
}
await walk(root)
console.log('JavaScript syntax and JSON checks passed')

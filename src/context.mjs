import { dependency } from './catalog.mjs'
export class Raw { constructor(source) { this.source = source } }
export const raw = source => new Raw(source)
export function serialize(value, depth = 0) {
  if (value instanceof Raw) return value.source
  if (Array.isArray(value)) return `[${value.map(v => serialize(v, depth + 1)).join(', ')}]`
  if (value && typeof value === 'object') {
    const pad = '  '.repeat(depth)
    return `{\n${Object.entries(value).map(([key, val]) => `${pad}  ${JSON.stringify(key)}: ${serialize(val, depth + 1)}`).join(',\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}
export function context(options) {
  const files = new Map()
  const pkg = {
    name: options.name, private: true, type: 'module',
    scripts: { dev: 'bun --bun nuxt dev', build: 'bun --bun nuxt build', preview: 'bun --bun nuxt preview', start: 'bun run .output/server/index.mjs', postinstall: 'bun --bun nuxt prepare', typecheck: 'nuxt typecheck' },
    dependencies: {}, devDependencies: {}
  }
  const cfg = {
    compatibilityDate: '2026-10-17', devtools: { enabled: true },
    modules: [], css: ['~/assets/css/main.css'],
    nitro: { preset: 'bun' },
    runtimeConfig: { public: { appName: options.name, siteUrl: 'http://localhost:3000' } },
    typescript: { strict: true }
  }
  return {
    options, files, pkg, cfg, imports: new Set(), env: [], notes: [],
    has: name => options.modules.includes(name) || options.features.includes(name),
    add(name, dev = false) {
      if (!dev) delete pkg.devDependencies[name]
      if (dev && pkg.dependencies[name]) return
      pkg[dev ? 'devDependencies' : 'dependencies'][name] = dependency(name)
    },
    module(name) { this.add(name); if (!cfg.modules.includes(name)) cfg.modules.push(name) },
    file(path, content) {
      if (files.has(path)) throw new Error(`Recipe file collision: ${path}`)
      files.set(path, content.trimStart().replace(/\s+$/, '') + '\n')
    }
  }
}

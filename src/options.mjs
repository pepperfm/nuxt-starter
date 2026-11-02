import { parseArgs } from 'node:util'
import { basename, resolve, parse } from 'node:path'
import { modules, uis, uiTemplates, backends, backendFeatures } from './catalog.mjs'

const csv = value => [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))]
export const moduleNames = modules.map(m => m.value)
const featureNames = backendFeatures.map(m => m.value)

export function parseCLI(argv) {
  const booleans = ['yes', 'help', 'version', 'dry-run', 'no-install', 'no-git', 'no-docker', 'no-deploy', ...moduleNames]
  const strings = ['ui', 'template', 'modules', 'backend', 'features', 'database', 'pm', 'locales']
  const options = Object.fromEntries([
    ...booleans.map(name => [name, { type: 'boolean', ...(name === 'yes' ? { short: 'y' } : {}) }]),
    ...strings.map(name => [name, { type: 'string' }])
  ])
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true, strict: true })
  if (positionals[0] === 'create') positionals.shift()
  if (positionals.length > 1) throw new Error('Specify exactly one destination directory.')
  return { values, target: positionals[0] }
}

export function normalize(input, cwd = process.cwd()) {
  const values = input.values ?? {}
  const aliases = { nuxtui: 'nuxt-ui', 'shadcn-vue': 'shadcn', 'element-plus': 'element' }
  const ui = aliases[values.ui] ?? values.ui ?? 'nuxt-ui'
  if (!uis.some(item => item.value === ui)) throw new Error(`Unknown UI: ${ui}`)
  const template = values.template ?? 'latest'
  if (!uiTemplates.some(item => item.value === template)) throw new Error(`Unknown Nuxt UI template: ${template}`)
  if (ui !== 'nuxt-ui' && template !== 'latest') throw new Error('--template is available only with --ui nuxt-ui.')
  const preset = values.backend ?? 'fullstack'
  if (!Object.hasOwn(backends, preset)) throw new Error(`Unknown backend preset: ${preset}`)
  let selected = values.modules === undefined ? ['eslint', 'test'] : csv(values.modules)
  for (const name of moduleNames) if (values[name]) selected.push(name)
  selected = [...new Set(selected)]
  for (const name of selected) if (!moduleNames.includes(name)) throw new Error(`Unknown module: ${name}`)
  const notices = []
  if (selected.includes('content') && selected.includes('mdc')) {
    selected = selected.filter(name => name !== 'mdc')
    notices.push('Nuxt Content provides MDC; a separate @nuxtjs/mdc registration was removed.')
  }
  const requested = values.features === undefined ? [...backends[preset]] : csv(values.features)
  for (const name of requested) if (!featureNames.includes(name)) throw new Error(`Unknown backend feature: ${name}`)
  const features = new Set(requested)
  if (features.has('auth')) { features.add('hub'); features.add('redis') }
  if (features.has('queue')) features.add('redis')
  if (template === 'saas' && features.has('auth')) throw new Error('The SaaS template already has /login; select backend features without auth or use another template.')
  if (template === 'chat' && features.size) throw new Error('The Chat template ships its own auth/database; use --backend none and do not select backend features.')
  const database = values.database ?? 'postgresql'
  if (!['postgresql', 'mysql'].includes(database)) throw new Error(`Unknown database: ${database}`)
  if (database === 'mysql' && features.has('auth')) throw new Error('The auth recipe currently supports PostgreSQL. Use --database postgresql or omit auth from --features.')
  const pm = values.pm ?? 'bun'
  if (!['bun', 'npm', 'pnpm'].includes(pm)) throw new Error(`Unknown package manager: ${pm}`)
  const locales = csv(values.locales ?? 'ru,en')
  if (!locales.length) throw new Error('At least one locale is required.')
  for (const locale of locales) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new Error(`Invalid locale: ${locale}`)
    try { Intl.getCanonicalLocales(locale) } catch { throw new Error(`Invalid locale: ${locale}`) }
  }
  const target = input.target ?? 'my-nuxt-app'
  const dir = resolve(cwd, target)
  if (dir === parse(dir).root || dir === resolve(cwd)) throw new Error('Generate into a new directory, not a filesystem root or the current directory.')
  const name = basename(dir)
  if (!/^[a-z0-9][a-z0-9._-]{0,100}$/.test(name)) throw new Error('Use a lowercase project name with letters, digits, dots, hyphens or underscores.')
  return {
    name, dir, ui, template, modules: moduleNames.filter(n => selected.includes(n)),
    features: featureNames.filter(n => features.has(n)), database, pm, locales,
    docker: !values['no-docker'], deploy: !values['no-deploy'],
    install: !values['no-install'], dryRun: !!values['dry-run'], notices
  }
}

import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { run } from './generator.mjs'
import { serialize } from './context.mjs'

const SKIP_DIRS = new Set(['.git', '.nuxt', '.output', 'node_modules'])
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', '.env'])
const FRONTEND_FILES = new Set([
  'app/app.vue', 'app/pages/index.vue', 'app/components/StarterButton.vue',
  'app/assets/css/main.css', 'app/assets/css/base.css'
])
const CONFIG_FILES = new Set([
  'nuxt.config.ts', 'package.json', '.env.example', '.gitignore',
  '.editorconfig', 'tsconfig.json', 'README.md', 'AGENTS.md',
  '.github/workflows/ci.yml', 'eslint.config.mjs'
])

async function readScaffold(dir) {
  const files = new Map()
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name) && entry.isDirectory()) continue
      if (SKIP_FILES.has(entry.name) && entry.isFile()) continue
      const filename = join(folder, entry.name)
      const relativePath = relative(dir, filename).split(sep).join('/')
      const stats = await lstat(filename)
      if (stats.isSymbolicLink()) throw new Error('Nuxt UI template contains a symlink: ' + relativePath)
      if (stats.isDirectory()) await walk(filename)
      else if (stats.isFile()) files.set(relativePath, await readFile(filename))
    }
  }
  await walk(dir)
  return files
}

/** Download to a disposable directory, never to the user's destination. */
export async function downloadUITemplate(options, execute = run) {
  const scratch = await mkdtemp(join(tmpdir(), 'pepperfm-nuxt-ui-'))
  try {
    const destination = join(scratch, 'template')
    await execute('bunx', [
      '--bun', 'create-nuxt@latest', destination,
      '--template', 'ui/' + options.template,
      '--no-install', '--no-gitInit', '--packageManager', options.pm
    ], scratch, { quiet: true, redactPaths: [scratch, destination] })
    return await readScaffold(destination)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

function environment(original, generated) {
  const lines = String(original).trimEnd().split('\n').filter(Boolean)
  const defined = new Set(lines.flatMap(line => {
    const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
    return key ? [key[1]] : []
  }))
  for (const line of generated.trimEnd().split('\n')) {
    const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
    if (!key || !defined.has(key[1])) {
      lines.push(line)
      if (key) defined.add(key[1])
    }
  }
  return lines.join('\n').trimEnd() + '\n'
}

function mergePackage(original, generated, options) {
  const template = JSON.parse(original)
  const starter = JSON.parse(generated)
  const dependencies = { ...starter.dependencies, ...template.dependencies }
  const devDependencies = { ...starter.devDependencies, ...template.devDependencies }
  for (const name of Object.keys(dependencies)) delete devDependencies[name]
  return JSON.stringify({
    ...template,
    name: options.name,
    private: true,
    type: 'module',
    scripts: {
      ...template.scripts,
      ...starter.scripts,
      dev: template.scripts?.dev ?? 'nuxt dev',
      build: template.scripts?.build ?? 'nuxt build',
      preview: template.scripts?.preview ?? 'nuxt preview',
      postinstall: 'nuxt prepare',
      ...(options.modules.includes('eslint') ? { 'lint:fix': 'eslint . --fix --max-warnings 0' } : {})
    },
    engines: { ...template.engines, ...starter.engines },
    dependencies: { ...dependencies, defu: '^6.1.4' },
    devDependencies,
    packageManager: undefined
  }, null, 2) + '\n'
}

function mergeConfig(generatedConfig) {
  const cfg = { ...generatedConfig }
  for (const key of ['css', 'modules', 'compatibilityDate', 'devtools', 'ui', 'eslint']) delete cfg[key]
  const featureModules = generatedConfig.modules.filter(name => name !== '@nuxt/ui')
  return [
    "import templateConfig from './nuxt.template.config'",
    "import { defu } from 'defu'",
    '',
    '// Keep upstream pages and styling; merge starter capabilities and Bun runtime.',
    'const starter = ' + serialize(cfg),
    'const modules = [...new Set([...(templateConfig.modules ?? []), ...' + JSON.stringify(featureModules) + '])]',
    "const css = [...new Set([...(templateConfig.css ?? []), '~/assets/css/pepperfm-starter.css'])]",
    '',
    'export default defineNuxtConfig({',
    '  ...defu(starter, templateConfig),',
    '  modules,',
    '  css,',
    "  nitro: defu({ preset: 'bun' }, templateConfig.nitro ?? {})",
    // Defu's generic merge widens literals such as hub.db.dialect from 'postgresql'
    // to string; the recipe config itself is already validated by the generator.
    '} as Parameters<typeof defineNuxtConfig>[0])',
    ''
  ].join('\n')
}

function scopedStyles(css) {
  return css.split('\n')
    .filter(line => !line.startsWith(':root ') && !line.startsWith('body ') && !line.startsWith(':focus-visible '))
    .join('\n')
}

/** Preserve original UI and fail on actual backend/file collisions. */
export function combineUITemplate(templateFiles, generated, options) {
  if (options.template === 'latest') throw new Error('The latest starter does not use an external template.')
  const result = new Map(templateFiles)
  for (const filename of ['package.json', 'nuxt.config.ts', 'app/app.vue']) {
    if (!result.has(filename)) throw new Error('Nuxt UI template is missing ' + filename)
  }
  if (result.has('nuxt.template.config.ts')) throw new Error('Template already uses nuxt.template.config.ts; cannot safely compose.')
  result.set('nuxt.template.config.ts', result.get('nuxt.config.ts'))
  result.set('nuxt.config.ts', mergeConfig(generated.config))
  result.set('package.json', mergePackage(result.get('package.json'), generated.files.get('package.json'), options))
  if (result.has('app/assets/css/pepperfm-starter.css')) throw new Error('Template already uses the reserved starter CSS path.')
  result.set('app/assets/css/pepperfm-starter.css', scopedStyles(generated.files.get('app/assets/css/base.css')))

  if (result.has('README.md')) result.set('README.template.md', result.get('README.md'))
  result.set('README.md', 'Nuxt UI template: ' + options.template + ' (upstream README.template.md).\n\n' + generated.files.get('README.md'))
  result.set('AGENTS.md', [result.get('AGENTS.md'), generated.files.get('AGENTS.md')].filter(Boolean).join('\n\n'))
  result.set('.pepperfm-starter.json', JSON.stringify({
    ...JSON.parse(generated.files.get('.pepperfm-starter.json')),
    template: options.template
  }, null, 2) + '\n')

  result.set('.gitignore', [result.get('.gitignore'), generated.files.get('.gitignore')].filter(Boolean).join('\n'))
  result.set('.env.example', environment(result.get('.env.example') ?? '', generated.files.get('.env.example')))
  result.set('.github/workflows/ci.yml', generated.files.get('.github/workflows/ci.yml'))

  if (result.has('eslint.config.mjs')) {
    if (result.has('eslint.template.config.mjs')) throw new Error('Template already uses the reserved eslint.template.config.mjs path.')
    // Keep the upstream template's lint rules for original files. Its stricter
    // stylistic/Tailwind rules do not understand our independently generated auth/worker examples.
    const generatedSources = [...generated.files.keys()]
      .filter(filename => /\.(?:ts|vue|mjs)$/.test(filename) && !FRONTEND_FILES.has(filename))
    result.set('eslint.template.config.mjs', result.get('eslint.config.mjs'))
    result.set('eslint.config.mjs', [
      "import original from './eslint.template.config.mjs'",
      '',
      'export default original.append({',
      '  files: ' + JSON.stringify(generatedSources) + ',',
      '  rules: {',
      "    '@stylistic/max-statements-per-line': 'off',",
      "    'better-tailwindcss/no-unknown-classes': 'off'",
      '  }',
      '})',
      ''
    ].join('\n'))
  } else if (generated.files.has('eslint.config.mjs')) {
    result.set('eslint.config.mjs', generated.files.get('eslint.config.mjs'))
  }

  for (const [filename, content] of generated.files) {
    if (CONFIG_FILES.has(filename) || FRONTEND_FILES.has(filename) || filename === '.pepperfm-starter.json') continue
    if (result.has(filename)) {
      throw new Error('Nuxt UI template "' + options.template + '" conflicts at ' + filename +
        '. Disable the conflicting feature or choose another template. No destination files were written.')
    }
    result.set(filename, content)
  }
  return {
    ...generated,
    files: result,
    notices: [
      ...generated.notices,
      'Nuxt UI ' + options.template + ': original UI retained; backend and infrastructure composed.',
      'Review upstream template environment variables in README.template.md.'
    ]
  }
}

export async function buildUITemplateProject(options, generated, execute = run) {
  if (options.dryRun || options.template === 'latest') return generated
  return combineUITemplate(await downloadUITemplate(options, execute), generated, options)
}

import * as p from '@clack/prompts'
import { uis, uiTemplates, modules, backends, backendFeatures } from './catalog.mjs'
import { normalize } from './options.mjs'

export class Cancelled extends Error {}
function answer(value) {
  if (p.isCancel(value)) { p.cancel('Cancelled. No files were written.'); throw new Cancelled() }
  return value
}

export async function wizard(input) {
  p.intro('PepperFM · Nuxt Starter')
  const values = { ...input.values }
  // UI is deliberately the first question, even before the directory name.
  values.ui ??= answer(await p.select({ message: '1 / 6 · Choose your UI', options: uis, initialValue: 'nuxt-ui' }))
  if (values.ui === 'nuxt-ui') {
    values.template ??= answer(await p.select({ message: '2 / 6 · Nuxt UI template', options: uiTemplates, initialValue: 'latest' }))
  }
  values.modules ??= answer(await p.multiselect({ message: '3 / 6 · Choose Nuxt modules', options: modules, initialValues: ['eslint', 'test'], required: false })).join(',')
  values.features ??= answer(await p.multiselect({ message: '4 / 6 · Choose backend capabilities', options: backendFeatures, initialValues: backends[values.backend ?? 'fullstack'] ?? [], required: false })).join(',')
  if (values.features.split(',').includes('hub') && !values.features.split(',').includes('auth')) {
    values.database ??= answer(await p.select({ message: 'Database', options: [{ value: 'postgresql', label: 'PostgreSQL' }, { value: 'mysql', label: 'MySQL' }] }))
  }
  values.pm ??= answer(await p.select({ message: '5 / 6 · Package manager', initialValue: 'bun', options: ['bun', 'npm', 'pnpm'].map(value => ({ value, label: value })) }))
  if (values['no-docker'] === undefined) values['no-docker'] = !answer(await p.confirm({ message: 'Generate Docker Compose for LOCAL databases and Redis?', initialValue: true }))
  if (values['no-deploy'] === undefined) values['no-deploy'] = !answer(await p.confirm({ message: 'Generate Ubuntu systemd + Nginx deployment examples (no production Docker)?', initialValue: true }))
  const target = input.target ?? answer(await p.text({ message: '6 / 6 · Project directory', placeholder: 'my-nuxt-app', defaultValue: 'my-nuxt-app', validate(value) {
    try { normalize({ values, target: value }); return undefined } catch (error) { return error.message }
  } }))
  const result = normalize({ values, target })
  p.note([`Directory: ${result.dir}`, `UI: ${result.ui}`, `Template: ${result.template}`, `Modules: ${result.modules.join(', ') || 'none'}`, `Backend: ${result.features.join(', ') || 'none'}`, ...result.notices].join('\n'), 'Review')
  if (!answer(await p.confirm({ message: 'Create this project?', initialValue: true }))) throw new Cancelled()
  return result
}

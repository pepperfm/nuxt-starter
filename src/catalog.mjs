/** Package ranges intentionally stay within compatible major/minor families.
 * Each generated application must commit its own package-manager lockfile.
 */
export const versions = Object.freeze({
  nuxt: '^4.0.0', vue: '^3.5.0', 'vue-router': '^4.5.0',
  typescript: '^5.9.0', 'vue-tsc': '^3.0.0', '@types/node': '^22.0.0',
  '@nuxt/ui': '^4.0.0', tailwindcss: '^4.1.0', '@tailwindcss/vite': '^4.1.0',
  'shadcn-nuxt': '^2.0.0', 'reka-ui': '^2.0.0',
  'class-variance-authority': '^0.7.1', clsx: '^2.1.1', 'tailwind-merge': '^3.0.0',
  '@element-plus/nuxt': '^1.0.0', 'element-plus': '^2.9.0', dayjs: '^1.11.0',
  '@nuxt/eslint': '^1.0.0', eslint: '^9.0.0',
  '@nuxtjs/i18n': '^10.0.0', '@nuxtjs/mdc': '^0.18.0',
  '@nuxt/content': '^3.0.0', '@nuxt/image': '^2.0.0',
  '@vueuse/nuxt': '^13.0.0', '@vueuse/core': '^13.0.0',
  '@pinia/nuxt': '^0.11.0', pinia: '^3.0.0',
  'nuxt-security': '^2.0.0', vitest: '^3.2.0',
  '@nuxthub/core': '^0.10.0', 'drizzle-orm': '^0.44.0', 'drizzle-kit': '^0.31.0',
  postgres: '^3.4.0', mysql2: '^3.14.0', ioredis: '^5.6.0',
  'better-auth': '^1.7.10', '@better-auth/core': '^1.7.10', '@better-auth/redis-storage': '^1.7.10', bullmq: '^5.58.0', tsx: '^4.20.0', zod: '^4.0.0',
  unstorage: '^1.17.0'
})

export const uis = [
  { value: 'nuxt-ui', label: 'Nuxt UI', hint: 'Nuxt team · Tailwind CSS · UApp' },
  { value: 'shadcn', label: 'shadcn-vue', hint: 'Vue components in your source tree · Tailwind CSS' },
  { value: 'element', label: 'Element Plus', hint: 'Element Plus team · no Tailwind required' },
  { value: 'none', label: 'No UI library', hint: 'Vue + plain CSS' }
]

export const modules = [
  { value: 'eslint', label: 'ESLint', hint: 'Nuxt · lint and lint:fix' },
  { value: 'test', label: 'Vitest', hint: 'Unit tests · independent of a UI library' },
  { value: 'i18n', label: 'Nuxt i18n', hint: 'Nuxt community · ru/en starter locales' },
  { value: 'mdc', label: 'MDC', hint: 'Nuxt · render Markdown strings with Vue components' },
  { value: 'content', label: 'Nuxt Content', hint: 'Nuxt · file-based content; already includes MDC' },
  { value: 'image', label: 'Nuxt Image', hint: 'Nuxt · local image optimisation' },
  { value: 'vueuse', label: 'VueUse', hint: 'VueUse team · browser composables' },
  { value: 'pinia', label: 'Pinia', hint: 'Vue team · shared client state' },
  { value: 'security', label: 'Nuxt Security', hint: 'Community · review CSP for your own integrations' }
]

export const backends = {
  none: [],
  data: ['hub', 'redis'],
  fullstack: ['hub', 'redis', 'auth', 'queue']
}

export const backendFeatures = [
  { value: 'hub', label: 'Database: NuxtHub + Drizzle', hint: 'PostgreSQL or MySQL · explicit migrations' },
  { value: 'redis', label: 'Redis cache + KV', hint: 'Runtime configuration · no silent filesystem fallback' },
  { value: 'auth', label: 'Better Auth', hint: 'PostgreSQL + Redis sessions · sign-in and session controls' },
  { value: 'queue', label: 'BullMQ + scheduler', hint: 'Separate worker · retries · graceful shutdown' }
]

export function dependency(name) {
  const version = versions[name]
  if (!version) throw new Error(`No supported version declared for ${name}`)
  return version
}

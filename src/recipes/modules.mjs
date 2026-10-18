import { raw } from '../context.mjs'

export function extras(c) {
  if (c.has('eslint')) {
    c.module('@nuxt/eslint'); c.add('eslint', true)
    c.pkg.scripts.lint = 'eslint . --max-warnings 0'
    c.pkg.scripts['lint:fix'] = 'eslint . --fix --max-warnings 0'
    // Opt into Nuxt's existing ESLint Stylistic integration, not a second formatter.
    c.cfg.eslint = { config: { stylistic: { indent: 2, semi: false, quotes: 'single' } } }
    c.file('eslint.config.mjs', `import withNuxt from './.nuxt/eslint.config.mjs'

// PHP-like braces and explicit multiline formatting for objects and Vue templates.
export default withNuxt(
  { ignores: ['.data/**', '.output/**'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    rules: {
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/object-curly-newline': ['error', {
        ObjectExpression: { minProperties: 3, multiline: true, consistent: true },
        ObjectPattern: { multiline: true, consistent: true },
        TSTypeLiteral: { minProperties: 3, multiline: true, consistent: true },
        TSInterfaceBody: { minProperties: 3, multiline: true, consistent: true }
      }],
      '@stylistic/object-property-newline': 'error'
    }
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/max-attributes-per-line': ['error', {
        singleline: { max: 2 },
        multiline: { max: 1 }
      }],
      'vue/first-attribute-linebreak': ['error', {
        singleline: 'ignore',
        multiline: 'below'
      }]
    }
  }
)`)
  }
  if (c.has('test')) {
    c.add('vitest', true); c.add('vite', true); c.pkg.scripts.test = 'vitest run'
    c.file('vitest.config.ts', `import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], environment: 'node' } })`)
    c.file('tests/note.test.ts', `import { describe, it, expect } from 'vitest'
import { noteInput } from '../shared/schemas/note'
describe('noteInput', () => {
  it('trims a valid title', () => { expect(noteInput.parse({ title: ' hello ' })).toEqual({ title: 'hello' }) })
  it('rejects empty titles', () => { expect(noteInput.safeParse({ title: ' ' }).success).toBe(false) })
  it('rejects oversized titles', () => { expect(noteInput.safeParse({ title: 'x'.repeat(201) }).success).toBe(false) })
})`)
  }
  if (c.has('i18n')) {
    c.module('@nuxtjs/i18n')
    c.cfg.i18n = { defaultLocale: c.options.locales[0], strategy: 'prefix_except_default', langDir: 'locales', detectBrowserLanguage: false,
      locales: c.options.locales.map(code => ({ code, language: code, name: code, file: `${code}.json` })) }
    for (const code of c.options.locales) c.file(`i18n/locales/${code}.json`, JSON.stringify({ welcome: code.startsWith('ru') ? 'Новый проект готов к разработке' : 'Ready to build your next project' }, null, 2))
    c.file('app/components/LocaleSwitcher.vue', `<script setup lang="ts">
const { locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
</script>
<template>
  <span class="starter-links">
    <NuxtLink v-for="locale in locales" :key="locale.code" :to="switchLocalePath(locale.code)">{{ locale.name }}</NuxtLink>
  </span>
</template>`)
    c.notes.push('Only the demo heading is translated. Translate authentication and domain UI before shipping. Other selected locales start with English sample text.')
  }
  if (c.has('mdc')) {
    c.module('@nuxtjs/mdc')
    c.file('app/pages/markdown.vue', `<script setup lang="ts">
const markdown = '# Markdown demo\\n\\nRender trusted Markdown with **MDC** and Vue components.'
</script>
<template><main class="starter-shell"><MDC :value="markdown" /></main></template>`)
    c.notes.push('MDC is intentionally opt-in. Do not render untrusted user-controlled Vue components through Markdown without a component allowlist.')
  }
  if (c.has('content')) {
    c.module('@nuxt/content')
    // Use each tool runtime's built-in SQLite; no native npm addon or install-time binary build.
    c.cfg.content = { experimental: { sqliteConnector: raw("process.versions.bun ? 'bun' : 'native'") } }
    c.notes.push('Content uses Bun SQLite for the app/build and native Node SQLite during typechecking. Node 22.13+ is required for this optional recipe; its sqliteConnector setting is experimental upstream.')
    c.file('content.config.ts', `import { defineContentConfig, defineCollection } from '@nuxt/content'
export default defineContentConfig({ collections: { docs: defineCollection({ type: 'page', source: '**/*.md' }) } })`)
    c.file('content/intro.md', '---\ntitle: Getting started\n---\n\n# Your content\n\nEdit `content/intro.md`.\n')
    c.file('app/pages/docs.vue', `<script setup lang="ts">
const { data: page } = await useAsyncData('starter-docs', () => queryCollection('docs').path('/intro').first())
</script>
<template><main class="starter-shell"><ContentRenderer v-if="page" :value="page" /><p v-else>No content yet.</p></main></template>`)
  }
  if (c.has('image')) c.module('@nuxt/image')
  if (c.has('vueuse')) { c.module('@vueuse/nuxt'); c.add('@vueuse/core') }
  if (c.has('pinia')) {
    c.module('@pinia/nuxt'); c.add('pinia')
    c.file('app/stores/counter.ts', `import { defineStore } from 'pinia'
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const increment = () => { count.value++ }
  return { count, increment }
})`)
  }
  if (c.has('security')) {
    c.module('nuxt-security')
    c.cfg.security = { rateLimiter: false }
    c.notes.push('Nuxt Security headers are enabled. Its in-memory rate limiter is disabled; auth has its own Redis-backed limiter. Review CSP and trusted proxies per deployment.')
  }
}

export function base(c) {
  for (const p of ['nuxt', 'vue', 'vue-router', 'zod']) c.add(p)
  for (const p of ['typescript', 'vue-tsc', '@types/node']) c.add(p, true)
  c.env.push('NUXT_PUBLIC_SITE_URL=http://localhost:3000')
  c.file('.gitignore', 'node_modules/\n.nuxt/\n.output/\n.data/\n.env\n.env.*\n!.env.example\ncoverage/\n')
  c.file('.editorconfig', 'root = true\n\n[*]\ncharset = utf-8\nindent_style = space\nindent_size = 2\nend_of_line = lf\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n')
  c.file('tsconfig.json', JSON.stringify({ files: [], references: [
    { path: './.nuxt/tsconfig.app.json' }, { path: './.nuxt/tsconfig.server.json' },
    { path: './.nuxt/tsconfig.shared.json' }, { path: './.nuxt/tsconfig.node.json' }
  ] }, null, 2))
  c.file('server/api/health.get.ts', `export default defineEventHandler(() => ({ status: 'ok' as const }))`)
  c.file('shared/schemas/note.ts', `import { z } from 'zod'

export const noteInput = z.object({ title: z.string().trim().min(1).max(200) })
export type NoteInput = z.infer<typeof noteInput>
`)
  c.file('app/pages/index.vue', `<script setup lang="ts">
const config = useRuntimeConfig()
const count = ref(0)
const { data: health, error } = await useFetch('/api/health')
${c.has('i18n') ? 'const { t } = useI18n()' : ''}
useHead({ title: config.public.appName })
</script>

<template>
  <main class="starter-shell">
    <p class="starter-eyebrow">PEPPERFM / NUXT STARTER</p>
    <h1>${c.has('i18n') ? "{{ t('welcome') }}" : '{{ config.public.appName }}'}</h1>
    <p>Your UI: <strong>${c.options.ui}</strong>. Your code, your server.</p>
    <p role="status">API: {{ error ? 'unavailable' : health?.status ?? 'loading' }}</p>
    <StarterButton @click="count++">Counter: {{ count }}</StarterButton>
    <nav aria-label="Starter examples" class="starter-links">
      ${c.has('i18n') ? '<LocaleSwitcher />' : ''}
      ${c.has('mdc') ? '<NuxtLink to="/markdown">Markdown</NuxtLink>' : ''}
      ${c.has('content') ? '<NuxtLink to="/docs">Content</NuxtLink>' : ''}
      ${c.has('auth') ? '<NuxtLink to="/login">Sign in</NuxtLink>\n      <NuxtLink to="/account">Account and sessions</NuxtLink>' : ''}
    </nav>
  </main>
</template>`)
  c.file('app/assets/css/base.css', `:root { font-family: system-ui, sans-serif; color-scheme: light dark; }
body { margin: 0; }
.starter-shell { max-width: 48rem; margin: 4rem auto; padding: 1.5rem; }
.starter-shell h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.1; margin: 1rem 0; }
.starter-eyebrow { font-size: .75rem; letter-spacing: .16em; opacity: .6; }
.starter-links { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
.starter-form { display: grid; gap: 1rem; max-width: 28rem; }
.starter-form label { display: grid; gap: .35rem; }
.starter-form input { font: inherit; padding: .65rem; border: 1px solid currentColor; border-radius: .35rem; }
.starter-error { color: #b91c1c; }
.starter-session { padding: 1rem 0; border-bottom: 1px solid #8885; }
.starter-plain-button { font: inherit; padding: .6rem 1rem; cursor: pointer; border: 1px solid currentColor; border-radius: .4rem; }
:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
`)
}

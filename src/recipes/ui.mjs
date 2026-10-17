import { raw } from '../context.mjs'

export function ui(c) {
  const kit = c.options.ui
  let button = '<button class="starter-plain-button" type="button"><slot /></button>'
  let css = '@import "./base.css";'
  let app = '<NuxtPage />'
  if (kit === 'nuxt-ui') {
    c.module('@nuxt/ui'); c.add('tailwindcss')
    c.cfg.ui = { fonts: false }
    css = '@import "tailwindcss";\n@import "@nuxt/ui";\n@import "./base.css";'
    app = '<UApp><NuxtPage /></UApp>'
    button = '<UButton><slot /></UButton>'
  } else if (kit === 'element') {
    c.module('@element-plus/nuxt'); c.add('element-plus'); c.add('dayjs')
    button = '<ElButton type="primary"><slot /></ElButton>'
  } else if (kit === 'shadcn') {
    c.module('shadcn-nuxt')
    for (const p of ['tailwindcss', '@tailwindcss/vite', 'reka-ui', 'class-variance-authority', 'clsx', 'tailwind-merge']) c.add(p)
    c.imports.add("import tailwindcss from '@tailwindcss/vite'")
    c.cfg.vite = { plugins: [raw('tailwindcss()')] }
    c.cfg.shadcn = { prefix: 'Ui', componentDir: '@/components/ui' }
    button = '<UiButton><slot /></UiButton>'
    css = `@import "tailwindcss";
@import "./base.css";
@custom-variant dark (&:where(.dark, .dark *));
:root { --background: #fff; --foreground: #171717; --primary: #171717; --primary-foreground: #fafafa; --ring: #737373; --radius: .5rem; }
.dark { --background: #171717; --foreground: #fafafa; --primary: #fafafa; --primary-foreground: #171717; }
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-ring: var(--ring);
  --radius-md: var(--radius);
}
body { background: var(--background); color: var(--foreground); }`
    c.file('components.json', JSON.stringify({
      $schema: 'https://shadcn-vue.com/schema.json', style: 'new-york', typescript: true,
      tailwind: { config: '', css: 'app/assets/css/main.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
      aliases: { components: '@/components', composables: '@/composables', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib' }
    }, null, 2))
    c.file('app/lib/utils.ts', `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }`)
    c.file('app/components/ui/button/index.ts', `export { default as Button } from './Button.vue'`)
    c.file('app/components/ui/button/Button.vue', `<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = withDefaults(defineProps<PrimitiveProps & { class?: HTMLAttributes['class'] }>(), { as: 'button' })
</script>

<template>
  <Primitive :as="props.as" :as-child="props.asChild" :class="cn('inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50', props.class)">
    <slot />
  </Primitive>
</template>`)
    c.notes.push('shadcn uses source components, not a component bundle. Add more with bunx shadcn-vue@latest add <component>; review resulting changes.')
  }
  c.file('app/app.vue', `<template>\n  ${app}\n</template>`)
  c.file('app/components/StarterButton.vue', `<template>\n  ${button}\n</template>`)
  c.file('app/assets/css/main.css', css)
}

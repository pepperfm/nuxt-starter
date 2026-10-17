#!/usr/bin/env node
import { parseCLI, normalize } from '../src/options.mjs'
import { buildProject, writeProject, finishProject, generatorVersion } from '../src/generator.mjs'

const help = `PepperFM Nuxt Starter

  pepperfm-starter [create] <directory> [options]

UI is the first interactive step, followed by modules, backend and local infrastructure.
Bun is the default package manager and the production runtime (nitro.preset = 'bun').

  --ui nuxt-ui|shadcn|element|none
  --modules eslint,test,i18n,mdc,content,image,vueuse,pinia,security
  --i18n --mdc ...          Add an individual module
  --locales ru,en           First locale is the default
  --backend fullstack|data|none   Default: fullstack
  --features hub,redis,auth,queue Override the backend preset (empty string means none)
  --database postgresql|mysql   Default: postgresql; auth currently PostgreSQL only
  --pm bun|npm|pnpm         Installer selection; production runtime stays Bun
  --no-install --no-git --no-docker --no-deploy
  --dry-run                Print a plan without writing files
  --yes, -y                Use flags/defaults without interactive prompts
  --help --version

Examples:
  pepperfm-starter my-app
  pepperfm-starter my-app -y --ui nuxt-ui --i18n --mdc
  pepperfm-starter landing -y --backend none --ui none --modules eslint
`
try {
  const input = parseCLI(process.argv.slice(2))
  if (input.values.help) console.log(help)
  else if (input.values.version) console.log(generatorVersion)
  else {
    if (!input.values.yes && !process.stdin.isTTY) throw new Error('Non-interactive terminal: pass --yes and a project directory.')
    const options = input.values.yes ? normalize(input) : await (await import('../src/prompts.mjs')).wizard(input)
    const plan = buildProject(options)
    if (options.dryRun) console.log(JSON.stringify({ directory: options.dir, ui: options.ui, modules: options.modules, features: options.features, runtime: 'bun', files: [...plan.files.keys()], notices: plan.notices }, null, 2))
    else {
      await writeProject(options, plan)
      await finishProject(options)
      console.log(`\nCreated ${options.dir}\nUI: ${options.ui} · Nitro: bun · ${plan.files.size} files\n`)
      for (const note of plan.notices) console.log(`• ${note}`)
      console.log(`\nNext: cd ${JSON.stringify(options.dir)}\nRead README.md, configure local services, then run ${options.pm} run dev.`)
    }
  }
} catch (error) {
  if (error.constructor?.name === 'Cancelled') process.exitCode = 130
  else { console.error(`\n${error.message}`); process.exitCode = 1 }
}

# Maintainer rules

This repository is a CLI generator, not a generated Nuxt app. Inspect src/catalog.mjs and the recipe graph before changing dependencies. All generated Nuxt configs use nitro.preset = 'bun'. Bun is the default package manager and the runtime for production HTTP and workers. Docker is local infrastructure only; deploy examples use Ubuntu + systemd + Nginx.

Keep UI choices mutually exclusive. Only expose a selection when a functional recipe and tests exist. Validate flags and prerequisite features before touching the filesystem. Never overwrite an existing target directory or commit real .env secrets. Runtime env variables must not become build-time credentials. Do not put Nitro virtual imports in standalone workers.

Run bun run check and bun run test. Use GitHub CI for real installation/typecheck/build/runtime smoke tests. Do not call a generated app tested merely because template rendering succeeded. Add/expand the CI matrix when adding UI or infrastructure features. Do not deploy or publish to npm without a separate explicit request.

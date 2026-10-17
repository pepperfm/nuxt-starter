export function infra(c) {
  const name = c.options.name
  if (c.options.docker && (c.has('hub') || c.has('redis'))) {
    let compose = '# LOCAL DEVELOPMENT ONLY. Production uses Ubuntu services, not these containers.\nservices:\n'
    const volumes = []
    if (c.has('hub')) {
      if (c.options.database === 'postgresql') {
        compose += `  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    ports: ["127.0.0.1:5432:5432"]
    volumes: ["postgres-data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 5s
      retries: 20
`
        volumes.push('postgres-data')
      } else {
        compose += `  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: app
      MYSQL_USER: app
      MYSQL_PASSWORD: app
      MYSQL_ROOT_PASSWORD: local-root
    ports: ["127.0.0.1:3306:3306"]
    volumes: ["mysql-data:/var/lib/mysql"]
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -plocal-root"]
      interval: 5s
      timeout: 5s
      retries: 30
`
        volumes.push('mysql-data')
      }
    }
    if (c.has('redis')) {
      compose += `  redis-cache:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    ports: ["127.0.0.1:6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
  redis-state:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "noeviction"]
    ports: ["127.0.0.1:6380:6379"]
    volumes: ["redis-state-data:/data"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
`
      volumes.push('redis-state-data')
    }
    compose += 'volumes:\n' + volumes.map(v => `  ${v}: {}`).join('\n') + '\n'
    c.file('compose.yaml', compose)
    c.pkg.scripts['services:up'] = 'docker compose up -d --wait'
    c.pkg.scripts['services:down'] = 'docker compose down'
  }
  if (c.options.deploy) {
    const service = (description, command) => `[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${name}
Group=${name}
WorkingDirectory=/var/www/${name}/current
EnvironmentFile=/etc/${name}/app.env
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
# Install Bun at a stable, root-owned path; do not rely on an interactive shell PATH.
ExecStart=/usr/local/bin/bun ${command}
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=90
NoNewPrivileges=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=multi-user.target
`
    c.file('deploy/app.service', service(`${name} · Nuxt / Bun`, 'run .output/server/index.mjs'))
    if (c.has('queue')) c.file('deploy/worker.service', service(`${name} · BullMQ / Bun`, 'run workers/index.ts'))
    c.file('deploy/nginx.conf', `# Example HTTP vhost: add TLS/Certbot before using public authentication.
server {
    listen 80;
    server_name example.com;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
`)
    c.file('deploy/README.md', `# Ubuntu deployment / Bun

No Docker on production. Provision Bun, PostgreSQL/MySQL, Redis, Nginx and a dedicated unprivileged user.

1. Install Bun at /usr/local/bin/bun (root-owned executable). Create /var/www/${name}/releases and a user/group named ${name}. Adjust paths/user names in the unit files as required.
2. Put environment variables from .env.example into /etc/${name}/app.env, owned by root:${name}, mode 0640. Use strong database credentials and a unique auth secret. Set NUXT_PUBLIC_SITE_URL to the exact HTTPS origin. Keep the app port and database/Redis ports private.
3. Build in a new release directory: bun install --frozen-lockfile, bun run typecheck, bun run build. Commit bun.lock after the first installation. Do NOT pass secrets to the build. The Nitro preset is bun.
4. ${c.has('hub') ? 'With the production environment exported, apply the committed migrations using bun run db:migrate. Do not generate migrations on the server. Use backward-compatible expand/contract migrations; rolling back code does not undo schema changes.' : 'There are no database migrations in this preset.'}
5. ${c.has('queue') ? 'With the production environment exported, run bun run schedule:register. Keep workers/ and production dependencies in each release. Nitro output alone does not contain standalone worker sources.' : 'No background worker is configured.'}
6. Atomically switch current to the new release; restart the app${c.has('queue') ? ' and worker' : ''} systemd unit. Check /api/health, then keep the old release for rollback. This minimal single-instance example has a short restart interruption; it is not a zero-downtime deployment orchestrator.
7. Add HTTPS to Nginx before public auth. Review trusted proxies, CSP and rate limits. Back up the SQL database and durable Redis; enable AOF and noeviction on durable Redis. Monitor memory: noeviction rejects writes when full.

Copy deploy/app.service to /etc/systemd/system/${name}.service${c.has('queue') ? ` and deploy/worker.service to /etc/systemd/system/${name}-worker.service` : ''}, then run systemctl daemon-reload. These files are examples; the generator never provisions or deploys a server.

/api/health is a process liveness check, not a guarantee that DB/Redis are healthy. Add protected readiness checks and alerts for your product.
`)
  }
}

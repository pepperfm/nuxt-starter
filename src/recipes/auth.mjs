export function auth(c) {
  if (!c.has('auth')) return
  for (const name of ['better-auth', '@better-auth/core', '@better-auth/redis-storage']) c.add(name)
  c.cfg.runtimeConfig.authSecret = ''
  c.env.push('NUXT_AUTH_SECRET=')
  c.cfg.routeRules = { '/api/auth/**': { headers: { 'cache-control': 'no-store' } }, '/api/me': { headers: { 'cache-control': 'no-store' } }, '/account': { headers: { 'cache-control': 'no-store' } } }
  c.file('server/db/schema/auth.ts', `import { pgTable, text, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'

const dates = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
export const user = pgTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'), ...dates()
})
export const session = pgTable('auth_session', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'), ...dates()
}, table => [index('auth_session_user_idx').on(table.userId)])
export const account = pgTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), ...dates()
}, table => [index('auth_account_user_idx').on(table.userId), uniqueIndex('auth_account_provider_idx').on(table.providerId, table.accountId)])
export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), ...dates()
}, table => [index('auth_verification_identifier_idx').on(table.identifier)])`)
  c.file('server/utils/auth.ts', `import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { redisStorage } from '@better-auth/redis-storage'
import { Redis } from 'ioredis'
import { db, schema } from '@nuxthub/db'

let instance: ReturnType<typeof createAuth> | undefined
let redis: Redis | undefined
function createAuth() {
  const config = useRuntimeConfig()
  if (config.authSecret.length < 32) throw new Error('NUXT_AUTH_SECRET must contain at least 32 characters')
  if (!config.redisStateUrl) throw new Error('NUXT_REDIS_STATE_URL is required for sessions')
  const baseURL = config.public.siteUrl
  if (process.env.NODE_ENV === 'production' && !baseURL.startsWith('https://') && !baseURL.startsWith('http://127.0.0.1:') && !baseURL.startsWith('http://localhost:')) {
    throw new Error('Use HTTPS for NUXT_PUBLIC_SITE_URL in production')
  }
  redis = new Redis(config.redisStateUrl, { maxRetriesPerRequest: 1, connectTimeout: 5000 })
  redis.on('error', () => console.error('Authentication Redis connection error'))
  return betterAuth({
    secret: config.authSecret, baseURL, trustedOrigins: [baseURL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secondaryStorage: redisStorage({ client: redis, keyPrefix: config.redisPrefix + 'auth:' }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24,
      storeSessionInDatabase: false, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'secondary-storage', window: 60, max: 60 },
    advanced: { ipAddress: { ipAddressHeaders: ['x-real-ip'] } }
  })
}
export function auth() { return instance ??= createAuth() }
export async function closeAuth() {
  instance = undefined
  if (redis) { redis.disconnect(); redis = undefined }
}`)
  c.file('server/plugins/auth-lifecycle.ts', `export default defineNitroPlugin(nitroApp => { nitroApp.hooks.hook('close', closeAuth) })`)
  c.file('server/api/auth/[...all].ts', `import { toWebRequest } from 'h3'
export default defineEventHandler(event => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return auth().handler(toWebRequest(event))
})`)
  c.file('server/utils/require-user.ts', `import type { H3Event } from 'h3'
import { getRequestHeaders } from 'h3'

/** Must be called by every protected API. Page middleware is not API protection. */
export async function requireUser(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const result = await auth().api.getSession({ headers: new Headers(getRequestHeaders(event) as HeadersInit) })
  if (!result) throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' })
  return result
}`)
  c.file('server/api/me.get.ts', `export default defineEventHandler(async event => {
  const { user, session } = await requireUser(event)
  // Deliberately omit the session token and provider credentials from SSR payloads.
  return { user: { id: user.id, name: user.name, email: user.email }, session: { id: session.id } }
})`)
  c.file('app/lib/auth-client.ts', `import { createAuthClient } from 'better-auth/vue'
/** Relative URLs keep browser auth requests same-origin. Do not import the server auth module here. */
export const authClient = createAuthClient()`)
  c.file('app/middleware/auth.ts', `export default defineNuxtRouteMiddleware(async () => {
  const fetch = useRequestFetch()
  try { await fetch('/api/me') }
  catch (error) {
    const status = (error as { statusCode?: number, status?: number }).statusCode ?? (error as { status?: number }).status
    if (status === 401) return navigateTo(${c.has('i18n') ? "useLocalePath()('/login')" : "'/login'"})
    throw error
  }
})`)
  c.file('app/pages/login.vue', `<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
const email = ref('')
const password = ref('')
const name = ref('')
const register = ref(false)
const pending = ref(false)
const error = ref('')
${c.has('i18n') ? 'const localePath = useLocalePath()' : ''}
async function submit() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = register.value
      ? await authClient.signUp.email({ email: email.value, password: password.value, name: name.value })
      : await authClient.signIn.email({ email: email.value, password: password.value })
    if (result.error) { error.value = result.error.message ?? 'Authentication failed'; return }
    await navigateTo(${c.has('i18n') ? "localePath('/account')" : "'/account'"})
  } catch { error.value = 'Could not reach the server. Please try again.' }
  finally { pending.value = false }
}
</script>
<template>
  <main class="starter-shell">
    <h1>{{ register ? 'Create an account' : 'Sign in' }}</h1>
    <form class="starter-form" @submit.prevent="submit">
      <label v-if="register">Name<input v-model="name" autocomplete="name" required maxlength="100"></label>
      <label>Email<input v-model="email" type="email" autocomplete="email" required maxlength="254"></label>
      <label>Password<input v-model="password" type="password" :autocomplete="register ? 'new-password' : 'current-password'" required minlength="12" maxlength="128"></label>
      <p v-if="error" role="alert" class="starter-error">{{ error }}</p>
      <button class="starter-plain-button" type="submit" :disabled="pending">{{ pending ? 'Working…' : register ? 'Register' : 'Sign in' }}</button>
      <button class="starter-plain-button" type="button" :disabled="pending" @click="register = !register">{{ register ? 'Already have an account?' : 'Create account' }}</button>
    </form>
  </main>
</template>`)
  c.file('app/pages/account.vue', `<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
definePageMeta({ middleware: 'auth' })
const { data: me } = await useFetch('/api/me')
const sessions = ref<Awaited<ReturnType<typeof authClient.listSessions>>['data']>([])
const error = ref('')
const pending = ref(false)
${c.has('i18n') ? 'const localePath = useLocalePath()' : ''}
async function loadSessions() {
  const result = await authClient.listSessions()
  if (result.error) throw new Error(result.error.message ?? 'Could not load sessions')
  sessions.value = result.data
}
onMounted(async () => { try { await loadSessions() } catch { error.value = 'Could not load sessions' } })
async function revoke(token: string) {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    const result = await authClient.revokeSession({ token })
    if (result.error) throw new Error(result.error.message)
    await loadSessions()
  } catch { error.value = 'Could not revoke the session' }
  finally { pending.value = false }
}
async function signOut() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    const result = await authClient.signOut()
    if (result.error) throw new Error(result.error.message)
    clearNuxtData()
    await navigateTo(${c.has('i18n') ? "localePath('/login')" : "'/login'"})
  } catch { error.value = 'Could not sign out' }
  finally { pending.value = false }
}
</script>
<template>
  <main class="starter-shell">
    <h1>{{ me?.user.name }}</h1>
    <p>{{ me?.user.email }}</p>
    <h2>Active sessions</h2>
    <p v-if="error" role="alert" class="starter-error">{{ error }}</p>
    <article v-for="session in sessions ?? []" :key="session.id" class="starter-session">
      <p>{{ session.userAgent || 'Unknown device' }}</p>
      <p>{{ session.ipAddress || 'Unknown IP' }} · {{ new Date(session.createdAt).toLocaleString() }}</p>
      <span v-if="session.id === me?.session.id">Current session</span>
      <button v-else type="button" class="starter-plain-button" :disabled="pending" @click="revoke(session.token)">Revoke</button>
    </article>
    <button type="button" class="starter-plain-button" :disabled="pending" @click="signOut">Sign out</button>
  </main>
</template>`)
  c.notes.push('Auth sessions live in Redis (no DB fallback, no cookie cache). Clearing durable Redis signs users out. /api/me is server-protected and does not serialize tokens; device tokens are loaded client-side only for revocation. Email verification, password reset mail and OAuth credentials are deliberately not configured yet. Add those before a public launch.')
}

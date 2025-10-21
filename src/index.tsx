import { reactRenderer } from '@hono/react-renderer'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { Link, ReactRefresh, Script, ViteClient } from 'vite-ssr-components/react'
import App from './client/app'

type Bindings = {
  OPENAI_API_KEY: string
  CHATKIT_WORKFLOW_ID: string
  CHATKIT_API_BASE?: string
  OPENAI_ORGANIZATION?: string
  OPENAI_PROJECT?: string
}

type SessionRequestBody = {
  workflow?: { id?: string | null } | null
  workflowId?: string | null
  user?: string | null
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean
    }
  }
}

type AppEnv = { Bindings: Bindings }

const DEFAULT_CHATKIT_BASE = 'https://api.openai.com'
const SESSION_COOKIE_NAME = 'chatkit_session_id'
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

declare module '@hono/react-renderer' {
  interface Props {
    title?: string
  }
}

// Design Doc: docs/design/vite-ssr-migration.md
// Related classes: src/client/app.tsx, src/client/index.tsx
const app = new Hono<AppEnv>()

app.use(
  '*',
  reactRenderer(({ children, title }) => {
    const Refresh = import.meta.env.DEV ? ReactRefresh : () => null
    return (
      <html>
        <head>
          {title && <title>{title}</title>}
          <Refresh />
          <ViteClient />
          <script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" defer />
          <Script src="/src/client/index.tsx" />
          <Link href="/src/style.css" rel="stylesheet" />
        </head>
        <body>
          <div className="page-layout">
            <div id="root">{children}</div>
          </div>
        </body>
      </html>
    )
  })
)

app.get('/', (c) => {
  return c.render(<App />, { title: 'ChatKit Demo' })
})

app.post('/api/chatkit/session', async (c) => {
  const env = c.env
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: 'Missing OPENAI_API_KEY' }, 500)
  }

  const requestBody = (await parseJson<SessionRequestBody>(c).catch(() => null)) ?? {}
  const resolvedWorkflowId =
    requestBody.workflow?.id ?? requestBody.workflowId ?? env.CHATKIT_WORKFLOW_ID

  if (!resolvedWorkflowId) {
    return c.json({ error: 'Missing CHATKIT_WORKFLOW_ID configuration' }, 400)
  }

  const { userId, cookie } = resolveUser(c)
  const apiBase = env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    'OpenAI-Beta': 'chatkit_beta=v1'
  }

  if (env.OPENAI_ORGANIZATION) {
    headers['OpenAI-Organization'] = env.OPENAI_ORGANIZATION
  }
  if (env.OPENAI_PROJECT) {
    headers['OpenAI-Project'] = env.OPENAI_PROJECT
  }

  const upstreamResponse = await fetch(`${apiBase}/v1/chatkit/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workflow: { id: resolvedWorkflowId },
      user: requestBody.user ?? userId,
      chatkit_configuration: {
        file_upload: {
          enabled: requestBody.chatkit_configuration?.file_upload?.enabled ?? false
        }
      }
    })
  })

  const payload = (await upstreamResponse.json().catch(() => ({}))) as Record<string, unknown>

  if (cookie) {
    c.header('Set-Cookie', cookie)
  }

  if (!upstreamResponse.ok) {
    const message = resolveUpstreamError(payload)
    return c.json(
      {
        error: message ?? 'Failed to create ChatKit session',
        details: payload
      },
      upstreamResponse.status
    )
  }

  return c.json({
    client_secret: payload?.client_secret ?? null,
    expires_after: payload?.expires_after ?? null
  })
})

export default app

async function parseJson<T>(c: Context<AppEnv>): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

function resolveUser(c: Context<AppEnv>): { userId: string; cookie: string | null } {
  const cookieHeader = c.req.header('Cookie')
  const existing = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)
  if (existing) {
    return { userId: existing, cookie: null }
  }

  const generated = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : cryptoIdFallback()
  const secure = import.meta.env.PROD
  return {
    userId: generated,
    cookie: serializeCookie(SESSION_COOKIE_NAME, generated, secure)
  }
}

function getCookieValue(cookieHeader: string | undefined | null, name: string): string | null {
  if (!cookieHeader) {
    return null
  }
  const cookies = cookieHeader.split(';')
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.split('=')
    if (!rawName || rest.length === 0) continue
    if (rawName.trim() === name) {
      return rest.join('=').trim()
    }
  }
  return null
}

function serializeCookie(name: string, value: string, secure: boolean): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax'
  ]
  if (secure) {
    attributes.push('Secure')
  }
  return attributes.join('; ')
}

function cryptoIdFallback(): string {
  return Math.random().toString(36).slice(2)
}

function resolveUpstreamError(payload: Record<string, unknown>): string | null {
  if (!payload) {
    return null
  }
  const error = payload.error
  if (typeof error === 'string') {
    return error
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  if (typeof payload.message === 'string') {
    return payload.message
  }
  return null
}

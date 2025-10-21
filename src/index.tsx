import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getCookie, setCookie } from 'hono/cookie'
import App from './client/app'
import { renderer } from './renderer'

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

type SessionResponsePayload = {
  client_secret?: string | null
  expires_after?: number | null
  error?: { message?: string | null } | string | null
  message?: string | null
}

const DEFAULT_CHATKIT_BASE = 'https://api.openai.com'
const SESSION_COOKIE_NAME = 'chatkit_session_id'
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Design Doc: docs/design/vite-ssr-migration.md
// Related classes: src/client/app.tsx, src/client/index.tsx
type AppEnv = { Bindings: CloudflareBindings; Variables: { userId: string } }

const app = new Hono<AppEnv>()

app.use('*', renderer)

app.use('/api/*', async (c, next) => {
  const userId = resolveUser(c)
  c.set('userId', userId)
  await next()
})

app.onError((err, c) => {
  console.error('Unhandled application error', err)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Internal Server Error' }, 500)
  }
  return c.text('Internal Server Error', 500)
})

app.get('/', (c) => c.render(<App />))

app.post('/api/chatkit/session', async (c) => {
  const env = c.env
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: 'Missing OPENAI_API_KEY' }, 500)
  }

  const requestBody = await c.req.json<SessionRequestBody>().catch(() => null)
  const resolvedWorkflowId =
    requestBody?.workflow?.id ?? requestBody?.workflowId ?? env.CHATKIT_WORKFLOW_ID

  if (!resolvedWorkflowId) {
    return c.json({ error: 'Missing CHATKIT_WORKFLOW_ID configuration' }, 400)
  }

  const userId = c.get('userId')
  const apiBase = env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE

  const upstreamResponse = await fetch(`${apiBase}/v1/chatkit/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'chatkit_beta=v1',
      ...(env.OPENAI_ORGANIZATION ? { 'OpenAI-Organization': env.OPENAI_ORGANIZATION } : {}),
      ...(env.OPENAI_PROJECT ? { 'OpenAI-Project': env.OPENAI_PROJECT } : {})
    },
    body: JSON.stringify({
      workflow: { id: resolvedWorkflowId },
      user: requestBody?.user ?? userId,
      chatkit_configuration: {
        file_upload: {
          enabled: requestBody?.chatkit_configuration?.file_upload?.enabled ?? false
        }
      }
    })
  })

  const payload = (await upstreamResponse.json().catch(() => ({}))) as SessionResponsePayload

  if (!upstreamResponse.ok) {
    const message = resolveUpstreamError(payload)
    return c.json(
      {
        error: message ?? 'Failed to create ChatKit session',
        details: payload
      },
      toContentfulStatus(upstreamResponse.status)
    )
  }

  return c.json({
    client_secret: extractString(payload?.client_secret),
    expires_after: typeof payload?.expires_after === 'number' ? payload.expires_after : null
  })
})

export default app

function resolveUser(c: Context<AppEnv>): string {
  const existing = getCookie(c, SESSION_COOKIE_NAME)
  if (existing) {
    return existing
  }

  const generated = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : cryptoIdFallback()
  const secure = import.meta.env.PROD

  setCookie(c, SESSION_COOKIE_NAME, generated, {
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'Lax',
    secure
  })

  return generated
}

function cryptoIdFallback(): string {
  return Math.random().toString(36).slice(2)
}

function resolveUpstreamError(payload: SessionResponsePayload | null): string | null {
  if (!payload) {
    return null
  }

  const error = payload.error
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  return extractString(payload.message)
}

function extractString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toContentfulStatus(status: number): ContentfulStatusCode {
  if (status === 101 || status === 204 || status === 205 || status === 304) {
    return 500
  }
  if (status < 200 || status > 599) {
    return 500
  }
  return status as ContentfulStatusCode
}
